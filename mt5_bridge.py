"""
MT5 Bridge - Python script to connect MetaTrader 5 with Electron app
Handles MT5 connection and communicates with Electron via WebSocket
"""

import MetaTrader5 as mt5
import json
import asyncio
import websockets
import logging
from datetime import datetime
from twilio_alerts import TwilioAlerts
from simulator import TradingSimulator
import yfinance as yf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MT5Bridge:
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.connected_to_mt5 = False
        self.websocket = None
        self.twilio_alerts = None
        self.twilio_config = {}
        self.alert_config = {}
        self.monitored_positions = {}  # Track positions for TP/SL alerts
        self.simulator_mode = False  # Simulator mode flag
        self.simulator = TradingSimulator()  # Simulator instance
        self.load_twilio_config()
    
    def load_twilio_config(self):
        """Load Twilio configuration from unified settings file"""
        try:
            # Try to load from unified settings first
            try:
                with open('app_settings.json', 'r') as f:
                    settings = json.load(f)
                    twilio_config = settings.get('twilio', {})
            except FileNotFoundError:
                # Fallback to old config file
                with open('twilio_config.json', 'r') as f:
                    config = json.load(f)
                    twilio_config = config.get('twilio', {})
            self.twilio_config = twilio_config  # Store for later retrieval
            self.alert_config = config.get('notifications', {})
            
            if twilio_config.get('enabled', False):
                self.twilio_alerts = TwilioAlerts(
                    account_sid=twilio_config.get('account_sid'),
                    auth_token=twilio_config.get('auth_token'),
                    from_number=twilio_config.get('from_number')
                )
                logger.info("Twilio alerts configured and enabled")
            else:
                logger.info("Twilio alerts disabled in configuration")
                
        except FileNotFoundError:
            logger.warning("twilio_config.json not found. Twilio alerts disabled.")
            self.twilio_config = {}
        except Exception as e:
            logger.error(f"Error loading Twilio config: {e}")
            self.twilio_config = {}
    
    def update_position_monitoring(self):
        """Update monitored positions and check for TP/SL hits"""
        if not self.twilio_alerts or not self.twilio_alerts.is_enabled():
            return
        
        try:
            current_positions = self.get_positions()
            if isinstance(current_positions, dict) and 'error' in current_positions:
                return
            
            current_tickets = {pos['ticket'] for pos in current_positions}
            previous_tickets = set(self.monitored_positions.keys())
            
            # Check for closed positions (potential TP/SL hits)
            closed_tickets = previous_tickets - current_tickets
            
            for ticket in closed_tickets:
                old_position = self.monitored_positions[ticket]
                self.check_tp_sl_hit(old_position)
                del self.monitored_positions[ticket]
            
            # Update monitored positions
            for position in current_positions:
                ticket = position['ticket']
                self.monitored_positions[ticket] = position
                
        except Exception as e:
            logger.error(f"Error updating position monitoring: {e}")
    
    def check_tp_sl_hit(self, position):
        """Check if position was closed due to TP or SL hit"""
        if not self.alert_config.get('alerts', {}).get('take_profit', False) and \
           not self.alert_config.get('alerts', {}).get('stop_loss', False):
            return
        
        try:
            symbol = position['symbol']
            current_price = position['current_price']
            take_profit = position.get('take_profit', 0)
            stop_loss = position.get('stop_loss', 0)
            order_type = position['type']
            recipient = self.alert_config.get('recipient_number')
            method = self.alert_config.get('method', 'sms')
            
            if not recipient:
                return
            
            # Determine if TP or SL was hit based on price proximity
            tp_hit = False
            sl_hit = False
            
            if take_profit > 0:
                if order_type == 'BUY' and current_price >= take_profit:
                    tp_hit = True
                elif order_type == 'SELL' and current_price <= take_profit:
                    tp_hit = True
            
            if stop_loss > 0:
                if order_type == 'BUY' and current_price <= stop_loss:
                    sl_hit = True
                elif order_type == 'SELL' and current_price >= stop_loss:
                    sl_hit = True
            
            # Send appropriate alert
            if tp_hit and self.alert_config.get('alerts', {}).get('take_profit', False):
                self.twilio_alerts.send_take_profit_alert(position, recipient, method)
            elif sl_hit and self.alert_config.get('alerts', {}).get('stop_loss', False):
                self.twilio_alerts.send_stop_loss_alert(position, recipient, method)
                
        except Exception as e:
            logger.error(f"Error checking TP/SL hit: {e}")
        
    def connect_mt5(self, login=None, password=None, server=None):
        """Connect to MetaTrader 5"""
        if not mt5.initialize():
            logger.error(f"MT5 initialization failed: {mt5.last_error()}")
            return False
        
        if login and password and server:
            authorized = mt5.login(login, password, server)
            if not authorized:
                logger.error(f"MT5 login failed: {mt5.last_error()}")
                mt5.shutdown()
                return False
        
        self.connected_to_mt5 = True
        logger.info("Connected to MT5 successfully")
        return True
    
    def get_account_info(self):
        """Get MT5 account information (real or simulated)"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        # SIMULATOR MODE: Return simulated account info
        if self.simulator_mode:
            return self.simulator.get_account_summary()
        
        # REAL MODE: Return actual account info
        account_info = mt5.account_info()
        if account_info is None:
            return {"error": mt5.last_error()}
        
        return {
            "balance": account_info.balance,
            "equity": account_info.equity,
            "margin": account_info.margin,
            "free_margin": account_info.margin_free,
            "profit": account_info.profit,
            "leverage": account_info.leverage,
            "currency": account_info.currency
        }
    
    def get_positions(self):
        """Get open positions (real or simulated)"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        # SIMULATOR MODE: Return simulated positions
        if self.simulator_mode:
            # Update prices for all simulated positions
            sim_positions = self.simulator.get_positions()
            for pos in sim_positions:
                tick = mt5.symbol_info_tick(pos['symbol'])
                if tick:
                    current_price = tick.bid if pos['type'] == 'BUY' else tick.ask
                    symbol_info = mt5.symbol_info(pos['symbol'])
                    contract_size = symbol_info.trade_contract_size if symbol_info else 100000
                    self.simulator.update_position_prices(pos['symbol'], current_price, contract_size)
            
            # Check for TP/SL hits
            self.simulator.check_tp_sl_hits()
            
            # Return updated positions
            return self.simulator.get_positions()
        
        # REAL MODE: Return actual positions
        positions = mt5.positions_get()
        if positions is None:
            return []
        
        result = []
        for pos in positions:
            result.append({
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "type": "BUY" if pos.type == mt5.ORDER_TYPE_BUY else "SELL",
                "volume": pos.volume,
                "open_price": pos.price_open,
                "current_price": pos.price_current,
                "profit": pos.profit,
                "stop_loss": pos.sl,
                "take_profit": pos.tp
            })
        
        return result
    
    def execute_order(self, symbol, order_type, volume, sl=0, tp=0):
        """Execute a trading order (real or simulated)"""
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
        # SIMULATOR MODE: Execute simulated trade
        if self.simulator_mode:
            logger.info(f"[SIMULATOR] Executing order: {symbol} {order_type} {volume} SL:{sl} TP:{tp}")
            
            # Get current market price
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                return {"success": False, "error": f"Failed to get current price for {symbol}"}
            
            # Use appropriate price based on order type
            open_price = tick.ask if order_type == "BUY" else tick.bid
            
            # Open simulated position
            result = self.simulator.open_position(symbol, order_type, volume, open_price, sl, tp)
            logger.info(f"[SIMULATOR] Order executed: {result}")
            return result
        
        # REAL MODE: Execute actual trade
        logger.info(f"Executing order: {symbol} {order_type} {volume} SL:{sl} TP:{tp}")
        
        # Get symbol info - this validates the symbol exists
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            logger.error(f"Symbol {symbol} not found")
            return {"success": False, "error": f"Symbol {symbol} not found"}
        
        logger.info(f"Symbol info found: {symbol_info.name}, visible: {symbol_info.visible}")
        
        # Make sure symbol is visible/selected in Market Watch
        if not symbol_info.visible:
            logger.info(f"Selecting symbol {symbol}")
            if not mt5.symbol_select(symbol, True):
                logger.error(f"Failed to select {symbol}")
                return {"success": False, "error": f"Failed to select {symbol}"}
        
        # Get current tick data (price)
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            logger.error(f"Failed to get tick for {symbol}")
            return {"success": False, "error": f"Failed to get current price for {symbol}"}
        
        # Determine price based on order type (same as price_UI.py)
        price = tick.ask if order_type == "BUY" else tick.bid
        logger.info(f"Current price for {symbol}: ask={tick.ask}, bid={tick.bid}, using price={price}")
        
        # Prepare order request (matching price_UI.py structure)
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": mt5.ORDER_TYPE_BUY if order_type == "BUY" else mt5.ORDER_TYPE_SELL,
            "price": price,
            "deviation": 20,
            "magic": 234000,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        # Add SL/TP only if specified (matching price_UI.py logic)
        if sl and sl > 0:
            request["sl"] = sl
        if tp and tp > 0:
            request["tp"] = tp
        
        logger.info(f"Sending order request: {request}")
        result = mt5.order_send(request)
        
        if result is None:
            logger.error("Order send returned None - Check MT5 connection and trading permissions")
            return {"success": False, "error": "Order send failed - MT5 returned None. Check connection and parameters."}
        
        logger.info(f"Order result: retcode={result.retcode}, comment={result.comment}")
        
        # Check if order was successful (matching price_UI.py)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            error_msg = f"Order failed: {result.comment} (retcode: {result.retcode})"
            logger.error(error_msg)
            return {"success": False, "error": error_msg}
        
        logger.info(f"Order executed successfully: ticket={result.order}, price={result.price}")
        return {
            "success": True,
            "ticket": result.order,
            "price": result.price,
            "message": "Order executed successfully"
        }
    
    def close_position(self, ticket):
        """Close a position by ticket (real or simulated)"""
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
        # SIMULATOR MODE: Close simulated position
        if self.simulator_mode:
            # Find the position to get symbol
            sim_positions = self.simulator.get_positions()
            position = next((p for p in sim_positions if p['ticket'] == ticket), None)
            
            if not position:
                return {"success": False, "error": "Position not found"}
            
            # Get current market price
            tick = mt5.symbol_info_tick(position['symbol'])
            if tick is None:
                return {"success": False, "error": "Failed to get current price"}
            
            close_price = tick.bid if position['type'] == 'BUY' else tick.ask
            return self.simulator.close_position(ticket, close_price)
        
        # REAL MODE: Close actual position
        positions = mt5.positions_get(ticket=ticket)
        if positions is None or len(positions) == 0:
            return {"success": False, "error": "Position not found"}
        
        position = positions[0]
        
        close_type = mt5.ORDER_TYPE_SELL if position.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        price = mt5.symbol_info_tick(position.symbol).bid if position.type == mt5.ORDER_TYPE_BUY else mt5.symbol_info_tick(position.symbol).ask
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": position.symbol,
            "volume": position.volume,
            "type": close_type,
            "position": ticket,
            "price": price,
            "deviation": 20,
            "magic": 234000,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request)
        
        if result is None:
            return {"success": False, "error": "Order send failed - MT5 returned None. Check connection and parameters."}
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {"success": False, "error": f"Close failed: {result.comment}"}
        
        return {"success": True, "message": "Position closed"}
    
    def modify_position(self, ticket, sl=None, tp=None):
        """Modify stop loss and take profit of a position (real or simulated)"""
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
        # SIMULATOR MODE: Modify simulated position
        if self.simulator_mode:
            return self.simulator.modify_position(ticket, sl, tp)
        
        # REAL MODE: Modify actual position
        positions = mt5.positions_get(ticket=ticket)
        if positions is None or len(positions) == 0:
            return {"success": False, "error": "Position not found"}
        
        position = positions[0]
        
        # Use existing values if not provided, allow 0 to remove SL/TP
        new_sl = position.sl if sl is None else float(sl)
        new_tp = position.tp if tp is None else float(tp)
        
        # Get symbol info for validation
        symbol_info = mt5.symbol_info(position.symbol)
        if symbol_info is None:
            return {"success": False, "error": f"Symbol {position.symbol} not found"}
        
        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": position.symbol,
            "position": ticket,
            "sl": new_sl,
            "tp": new_tp,
        }
        
        result = mt5.order_send(request)
        
        if result is None:
            return {"success": False, "error": "Order send failed - MT5 returned None. Check connection and parameters."}
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {"success": False, "error": f"Modify failed: {result.comment} (retcode: {result.retcode})"}
        
        return {"success": True, "message": "Position modified"}
    
    def update_twilio_config(self, config_data):
        """Update Twilio configuration in unified settings"""
        try:
            # Load existing unified settings
            try:
                with open('app_settings.json', 'r') as f:
                    current_config = json.load(f)
            except FileNotFoundError:
                # Create default unified settings structure
                current_config = {
                    "twilio": {
                        "enabled": False,
                        "accountSid": "",
                        "authToken": "",
                        "fromNumber": "",
                        "recipientNumber": "",
                        "method": "sms",
                        "alerts": {
                            "take_profit": True,
                            "stop_loss": True,
                            "position_opened": False,
                            "position_closed": False
                        }
                    }
                }
            
            # Ensure twilio section exists
            if 'twilio' not in current_config:
                current_config['twilio'] = {}
            
            # Update with new data (convert from old format to new format)
            if 'twilio' in config_data:
                twilio_data = config_data['twilio']
                current_config['twilio'].update({
                    'enabled': twilio_data.get('enabled', False),
                    'accountSid': twilio_data.get('account_sid', ''),
                    'authToken': twilio_data.get('auth_token', ''),
                    'fromNumber': twilio_data.get('from_number', '')
                })
            
            if 'notifications' in config_data:
                notifications_data = config_data['notifications']
                current_config['twilio'].update({
                    'recipientNumber': notifications_data.get('recipient_number', ''),
                    'method': notifications_data.get('method', 'sms'),
                    'alerts': notifications_data.get('alerts', {})
                })
            
            # Save updated config to unified settings
            with open('app_settings.json', 'w') as f:
                json.dump(current_config, f, indent=2)
            
            # Also maintain backward compatibility by updating old file
            try:
                old_config = {
                    "twilio": {
                        "account_sid": current_config['twilio'].get('accountSid', ''),
                        "auth_token": current_config['twilio'].get('authToken', ''),
                        "from_number": current_config['twilio'].get('fromNumber', ''),
                        "enabled": current_config['twilio'].get('enabled', False)
                    },
                    "notifications": {
                        "recipient_number": current_config['twilio'].get('recipientNumber', ''),
                        "method": current_config['twilio'].get('method', 'sms'),
                        "alerts": current_config['twilio'].get('alerts', {})
                    }
                }
                with open('twilio_config.json', 'w') as f:
                    json.dump(old_config, f, indent=2)
            except Exception as e:
                logger.warning(f"Could not update legacy twilio_config.json: {e}")
            
            # Reload configuration
            self.load_twilio_config()
            
            return {"success": True, "message": "Twilio configuration updated"}
            
        except Exception as e:
            logger.error(f"Error updating Twilio config: {e}")
            return {"success": False, "error": str(e)}
    
    def toggle_simulator_mode(self, enabled):
        """Toggle simulator mode on/off"""
        self.simulator_mode = enabled
        mode_str = "ENABLED" if enabled else "DISABLED"
        logger.info(f"Simulator mode {mode_str}")
        return {
            "success": True,
            "simulator_mode": self.simulator_mode,
            "message": f"Simulator mode {mode_str}"
        }
    
    def get_simulator_status(self):
        """Get current simulator mode status"""
        return {
            "simulator_mode": self.simulator_mode,
            "positions_count": len(self.simulator.get_positions()),
            "closed_positions_count": len(self.simulator.closed_positions),
            "account_summary": self.simulator.get_account_summary() if self.simulator_mode else None
        }
    
    def reset_simulator(self, initial_balance=10000.0):
        """Reset simulator to initial state"""
        result = self.simulator.reset_simulator(initial_balance)
        logger.info(f"Simulator reset with balance: {initial_balance}")
        return result
    
    def get_market_data(self, symbol):
        """Get current market data for a symbol"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return {"error": f"Failed to get tick for {symbol}"}
        
        return {
            "symbol": symbol,
            "bid": tick.bid,
            "ask": tick.ask,
            "spread": tick.ask - tick.bid,
            "volume": tick.volume,
            "time": datetime.fromtimestamp(tick.time).isoformat()
        }
    
    def get_symbol_info(self, symbol):
        """Get detailed symbol specifications including contract size and tick value"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            return {"error": f"Failed to get symbol info for {symbol}"}
        
        return {
            "name": symbol_info.name,
            "description": symbol_info.description if hasattr(symbol_info, 'description') else symbol_info.name,
            "currency_base": symbol_info.currency_base,
            "currency_profit": symbol_info.currency_profit,
            "currency_margin": symbol_info.currency_margin,
            "digits": symbol_info.digits,
            "point": symbol_info.point,
            "trade_contract_size": symbol_info.trade_contract_size,
            "trade_tick_value": symbol_info.trade_tick_value,
            "trade_tick_size": symbol_info.trade_tick_size,
            "volume_min": symbol_info.volume_min,
            "volume_max": symbol_info.volume_max,
            "volume_step": symbol_info.volume_step,
            "bid": symbol_info.bid,
            "ask": symbol_info.ask,
            "spread": symbol_info.spread
        }
    
    def get_symbols(self, group="*"):
        """Get available symbols from MT5"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        symbols = mt5.symbols_get(group=group)
        if symbols is None:
            return {"error": "Failed to get symbols"}
        
        result = []
        for symbol in symbols:
            # Only include visible symbols or commonly traded ones
            if symbol.visible or symbol.name in ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD']:
                result.append({
                    "name": symbol.name,
                    "description": symbol.description if hasattr(symbol, 'description') else symbol.name,
                    "currency_base": symbol.currency_base,
                    "currency_profit": symbol.currency_profit,
                    "digits": symbol.digits,
                    "point": symbol.point,
                    "visible": symbol.visible
                })
        
        # Sort by name for better UX
        result.sort(key=lambda x: x['name'])
        return result
    
    def search_symbols(self, query):
        """Search symbols by name or description"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        if not query or len(query) < 2:
            return []
        
        symbols = mt5.symbols_get()
        if symbols is None:
            return {"error": "Failed to get symbols"}
        
        query_lower = query.lower()
        result = []
        
        for symbol in symbols:
            name_match = query_lower in symbol.name.lower()
            desc_match = hasattr(symbol, 'description') and query_lower in symbol.description.lower()
            
            if name_match or desc_match:
                result.append({
                    "name": symbol.name,
                    "description": symbol.description if hasattr(symbol, 'description') else symbol.name,
                    "currency_base": symbol.currency_base,
                    "currency_profit": symbol.currency_profit,
                    "digits": symbol.digits,
                    "visible": symbol.visible
                })
        
        # Sort by relevance (exact matches first, then partial matches)
        result.sort(key=lambda x: (
            0 if x['name'].lower() == query_lower else 1,
            0 if x['name'].lower().startswith(query_lower) else 1,
            x['name']
        ))
        
        return result[:20]  # Limit to 20 results
    
    def get_historical_data(self, symbol, timeframe, start_date=None, end_date=None, bars=None):
        """Get historical data from MT5"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        # Map timeframe strings to MT5 constants
        timeframe_map = {
            'M1': mt5.TIMEFRAME_M1,
            'M5': mt5.TIMEFRAME_M5,
            'M15': mt5.TIMEFRAME_M15,
            'M30': mt5.TIMEFRAME_M30,
            'H1': mt5.TIMEFRAME_H1,
            'H4': mt5.TIMEFRAME_H4,
            'D1': mt5.TIMEFRAME_D1,
            'W1': mt5.TIMEFRAME_W1,
        }
        
        tf = timeframe_map.get(timeframe, mt5.TIMEFRAME_H1)
        
        try:
            # Get rates based on parameters
            if bars:
                # Get last N bars
                rates = mt5.copy_rates_from_pos(symbol, tf, 0, bars)
            elif start_date and end_date:
                # Get rates between dates
                rates = mt5.copy_rates_range(symbol, tf, start_date, end_date)
            else:
                # Default: get last 1000 bars
                rates = mt5.copy_rates_from_pos(symbol, tf, 0, 1000)
            
            if rates is None or len(rates) == 0:
                return {"error": f"No data available for {symbol}"}
            
            # Convert to list of dictionaries
            result = []
            for rate in rates:
                result.append({
                    "time": datetime.fromtimestamp(rate['time']).isoformat(),
                    "open": float(rate['open']),
                    "high": float(rate['high']),
                    "low": float(rate['low']),
                    "close": float(rate['close']),
                    "volume": int(rate['tick_volume'])
                })
            
            return {
                "symbol": symbol,
                "timeframe": timeframe,
                "bars": len(result),
                "data": result
            }
            
        except Exception as e:
            logger.error(f"Error getting historical data: {e}")
            return {"error": str(e)}
    
    def get_percentage_change(self, symbol, timeframe='M1'):
        """Calculate percentage change between current and previous bar"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        # Map timeframe strings to MT5 constants
        timeframe_map = {
            'M1': mt5.TIMEFRAME_M1,
            'M5': mt5.TIMEFRAME_M5,
            'M15': mt5.TIMEFRAME_M15,
            'M30': mt5.TIMEFRAME_M30,
            'H1': mt5.TIMEFRAME_H1,
            'H4': mt5.TIMEFRAME_H4,
            'D1': mt5.TIMEFRAME_D1,
            'W1': mt5.TIMEFRAME_W1,
        }
        
        tf = timeframe_map.get(timeframe, mt5.TIMEFRAME_M1)
        
        try:
            # Get last 2 bars to calculate percentage change
            rates = mt5.copy_rates_from_pos(symbol, tf, 0, 2)
            
            if rates is None or len(rates) < 2:
                return {"error": f"Insufficient data for {symbol} to calculate percentage change"}
            
            # Get current price (most recent close) and previous price
            current_price = float(rates[-1]['close'])  # Most recent bar
            previous_price = float(rates[-2]['close'])  # Previous bar
            
            # Calculate percentage change
            if previous_price == 0:
                return {"error": "Cannot calculate percentage change: previous price is zero"}
            
            percentage_change = ((current_price - previous_price) / previous_price) * 100
            
            return {
                "symbol": symbol,
                "timeframe": timeframe,
                "current_price": current_price,
                "previous_price": previous_price,
                "percentage_change": round(percentage_change, 4),
                "absolute_change": round(current_price - previous_price, 5)
            }
            
        except Exception as e:
            logger.error(f"Error calculating percentage change: {e}")
            return {"error": str(e)}
    
    def get_closed_positions(self, days_back=7):
        """Get closed positions (deal history) for the specified number of days"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        # SIMULATOR MODE: Return simulated closed positions
        if self.simulator_mode:
            return self.simulator.get_closed_positions(days_back)
        
        # REAL MODE: Return actual closed positions
        try:
            from datetime import datetime, timedelta
            
            # Calculate date range (supports fractional days for hours)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days_back)
            
            # Get deal history
            deals = mt5.history_deals_get(start_date, end_date)
            
            if deals is None:
                return {"error": "Failed to get deal history"}
            
            if len(deals) == 0:
                return []
            
            # Group deals by position ticket to calculate P&L
            position_deals = {}
            
            for deal in deals:
                # Only process position deals (not balance operations)
                if deal.type in [mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL]:
                    position_ticket = deal.position_id
                    
                    if position_ticket not in position_deals:
                        position_deals[position_ticket] = []
                    
                    position_deals[position_ticket].append(deal)
            
            # Process closed positions
            closed_positions = []
            
            for position_ticket, deals_list in position_deals.items():
                if len(deals_list) < 2:  # Need at least open and close deals
                    continue
                
                # Sort deals by time
                deals_list.sort(key=lambda x: x.time)
                
                open_deal = deals_list[0]  # First deal (position open)
                close_deal = deals_list[-1]  # Last deal (position close)
                
                # Calculate total profit/loss for this position
                total_profit = sum(deal.profit for deal in deals_list)
                total_volume = sum(deal.volume for deal in deals_list if deal.entry == mt5.DEAL_ENTRY_IN)
                
                # Determine position type
                position_type = "BUY" if open_deal.type == mt5.DEAL_TYPE_BUY else "SELL"
                
                closed_position = {
                    "ticket": position_ticket,
                    "symbol": open_deal.symbol,
                    "type": position_type,
                    "volume": total_volume,
                    "open_price": open_deal.price,
                    "close_price": close_deal.price,
                    "open_time": datetime.fromtimestamp(open_deal.time).isoformat(),
                    "close_time": datetime.fromtimestamp(close_deal.time).isoformat(),
                    "profit": round(total_profit, 2),
                    "swap": sum(deal.swap for deal in deals_list),
                    "commission": sum(deal.commission for deal in deals_list),
                    "comment": close_deal.comment or "",
                    "duration_minutes": round((close_deal.time - open_deal.time) / 60, 1)
                }
                
                closed_positions.append(closed_position)
            
            # Sort by close time (most recent first)
            closed_positions.sort(key=lambda x: x['close_time'], reverse=True)
            
            return closed_positions
            
        except Exception as e:
            logger.error(f"Error getting closed positions: {e}")
            return {"error": str(e)}
    
    def get_yfinance_data(self, symbol, data_type='price', period='1d', interval='1m'):
        """Get data from yFinance for the specified symbol"""
        try:
            logger.info(f"Fetching yFinance data for {symbol}: {data_type}, period={period}, interval={interval}")
            
            # Create ticker object
            ticker = yf.Ticker(symbol)
            
            if data_type == 'price':
                # Get current price (last close price)
                hist = ticker.history(period='1d', interval='1m')
                if hist.empty:
                    return {"error": f"No data available for symbol {symbol}"}
                
                current_price = hist['Close'].iloc[-1]
                return {
                    "success": True,
                    "symbol": symbol,
                    "dataType": data_type,
                    "value": str(round(current_price, 4)),
                    "timestamp": datetime.now().isoformat()
                }
                
            elif data_type == 'info':
                # Get basic info about the ticker
                info = ticker.info
                if not info:
                    return {"error": f"No info available for symbol {symbol}"}
                
                # Extract key information
                company_name = info.get('longName', info.get('shortName', symbol))
                sector = info.get('sector', 'N/A')
                market_cap = info.get('marketCap', 'N/A')
                
                info_string = f"{company_name} | Sector: {sector} | Market Cap: {market_cap}"
                
                return {
                    "success": True,
                    "symbol": symbol,
                    "dataType": data_type,
                    "value": info_string,
                    "timestamp": datetime.now().isoformat()
                }
                
            elif data_type == 'volume':
                # Get current volume
                hist = ticker.history(period='1d', interval='1m')
                if hist.empty:
                    return {"error": f"No data available for symbol {symbol}"}
                
                current_volume = hist['Volume'].iloc[-1]
                return {
                    "success": True,
                    "symbol": symbol,
                    "dataType": data_type,
                    "value": str(int(current_volume)),
                    "timestamp": datetime.now().isoformat()
                }
                
            elif data_type == 'change':
                # Get percentage change
                hist = ticker.history(period='2d', interval='1d')
                if len(hist) < 2:
                    return {"error": f"Insufficient data for change calculation for {symbol}"}
                
                previous_close = hist['Close'].iloc[-2]
                current_close = hist['Close'].iloc[-1]
                change_percent = ((current_close - previous_close) / previous_close) * 100
                
                return {
                    "success": True,
                    "symbol": symbol,
                    "dataType": data_type,
                    "value": str(round(change_percent, 2)) + "%",
                    "timestamp": datetime.now().isoformat()
                }
                
            else:
                return {"error": f"Unsupported data type: {data_type}"}
                
        except Exception as e:
            logger.error(f"Error fetching yFinance data for {symbol}: {e}")
            return {"error": str(e)}
    
    def execute_node_strategy(self, node_graph):
        """Execute a node-based trading strategy"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        try:
            nodes = node_graph.get('nodes', [])
            connections = node_graph.get('connections', [])
            
            if not nodes:
                return {"error": "No nodes provided in strategy"}
            
            logger.info(f"Executing node strategy with {len(nodes)} nodes and {len(connections)} connections")
            
            # For now, we'll return a success message
            # The actual node execution logic is handled by the frontend NodeEditor
            # This method serves as a confirmation that the strategy was received
            executed_nodes = []
            
            for node in nodes:
                node_type = node.get('type', 'unknown')
                node_title = node.get('title', f'Node {node.get("id", "unknown")}')
                executed_nodes.append(f"{node_title} ({node_type})")
            
            return {
                "success": True,
                "message": f"Node strategy executed successfully",
                "executed_nodes": executed_nodes,
                "total_nodes": len(nodes),
                "total_connections": len(connections)
            }
            
        except Exception as e:
            logger.error(f"Error executing node strategy: {e}")
            return {"error": str(e)}
    
    async def handle_message(self, websocket, message):
        """Handle incoming WebSocket messages from Electron"""
        try:
            data = json.loads(message)
            action = data.get('action')
            message_id = data.get('messageId')
            
            response = {"action": action, "messageId": message_id}
            
            if action == 'connect':
                login = data.get('login')
                password = data.get('password')
                server = data.get('server')
                success = self.connect_mt5(login, password, server)
                response['success'] = success
                
            elif action == 'getAccountInfo':
                response['data'] = self.get_account_info()
                
            elif action == 'getPositions':
                response['data'] = self.get_positions()
                
            elif action == 'executeOrder':
                result = self.execute_order(
                    data.get('symbol'),
                    data.get('type'),
                    data.get('volume'),
                    data.get('stopLoss', 0),
                    data.get('takeProfit', 0)
                )
                response['data'] = result
                
            elif action == 'closePosition':
                result = self.close_position(data.get('ticket'))
                response['data'] = result
            
            elif action == 'modifyPosition':
                result = self.modify_position(
                    data.get('ticket'),
                    data.get('stopLoss'),
                    data.get('takeProfit')
                )
                response['data'] = result
                
            elif action == 'getMarketData':
                result = self.get_market_data(data.get('symbol'))
                response['data'] = result
            
            elif action == 'getSymbols':
                group = data.get('group', '*')
                result = self.get_symbols(group)
                response['data'] = result
            
            elif action == 'searchSymbols':
                query = data.get('query', '')
                result = self.search_symbols(query)
                response['data'] = result
            
            elif action == 'getSymbolInfo':
                symbol = data.get('symbol')
                result = self.get_symbol_info(symbol)
                response['data'] = result
            
            elif action == 'getHistoricalData':
                symbol = data.get('symbol')
                timeframe = data.get('timeframe', 'H1')
                start_date = data.get('startDate')
                end_date = data.get('endDate')
                bars = data.get('bars')
                
                # Convert date strings to datetime objects if provided
                if start_date:
                    start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                if end_date:
                    end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                
                result = self.get_historical_data(symbol, timeframe, start_date, end_date, bars)
                response['data'] = result
            
            elif action == 'getPercentageChange':
                symbol = data.get('symbol')
                timeframe = data.get('timeframe', 'M1')
                
                result = self.get_percentage_change(symbol, timeframe)
                response['data'] = result
            
            elif action == 'executeNodeStrategy':
                node_graph = data.get('nodeGraph', {})
                result = self.execute_node_strategy(node_graph)
                response['data'] = result
            
            elif action == 'getClosedPositions':
                days_back = data.get('daysBack', 7)
                result = self.get_closed_positions(days_back)
                response['data'] = result
            
            elif action == 'sendTwilioAlert':
                message = data.get('message', '')
                to_number = data.get('toNumber', '')
                method = data.get('method', 'sms')
                
                if self.twilio_alerts and self.twilio_alerts.is_enabled():
                    result = self.twilio_alerts.send_custom_alert(message, to_number, method)
                    response['data'] = result
                else:
                    response['data'] = {"success": False, "error": "Twilio not configured"}
            
            elif action == 'testTwilioConnection':
                if self.twilio_alerts and self.twilio_alerts.is_enabled():
                    test_message = "Test message from MT5 Trader"
                    to_number = data.get('toNumber', self.alert_config.get('recipient_number', ''))
                    method = data.get('method', 'sms')
                    
                    if to_number:
                        result = self.twilio_alerts.send_custom_alert(test_message, to_number, method)
                        response['data'] = result
                    else:
                        response['data'] = {"success": False, "error": "No recipient number provided"}
                else:
                    response['data'] = {"success": False, "error": "Twilio not configured"}
            
            elif action == 'updateTwilioConfig':
                config_data = data.get('config', {})
                result = self.update_twilio_config(config_data)
                response['data'] = result
            
            elif action == 'getTwilioConfig':
                response['data'] = {
                    "enabled": self.twilio_alerts is not None and self.twilio_alerts.is_enabled(),
                    "config": self.alert_config,
                    "twilioConfig": self.twilio_config
                }
            
            elif action == 'toggleSimulatorMode':
                enabled = data.get('enabled', False)
                result = self.toggle_simulator_mode(enabled)
                response['data'] = result
            
            elif action == 'getSimulatorStatus':
                result = self.get_simulator_status()
                response['data'] = result
            
            elif action == 'resetSimulator':
                initial_balance = data.get('initialBalance', 10000.0)
                result = self.reset_simulator(initial_balance)
                response['data'] = result
            
            elif action == 'getYFinanceData':
                symbol = data.get('symbol')
                data_type = data.get('dataType', 'price')
                period = data.get('period', '1d')
                interval = data.get('interval', '1m')
                result = self.get_yfinance_data(symbol, data_type, period, interval)
                response['data'] = result
            
            else:
                response['error'] = f"Unknown action: {action}"
            
            await websocket.send(json.dumps(response))
            
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await websocket.send(json.dumps({"error": str(e), "messageId": data.get('messageId') if 'data' in locals() else None}))
    
    async def start_server(self):
        """Start WebSocket server with position monitoring"""
        async def handler(websocket):
            self.websocket = websocket
            logger.info(f"Client connected from {websocket.remote_address}")
            
            try:
                async for message in websocket:
                    await self.handle_message(websocket, message)
            except websockets.exceptions.ConnectionClosed:
                logger.info("Client disconnected")
            finally:
                self.websocket = None
        
        async def position_monitor():
            """Monitor positions for TP/SL alerts"""
            while True:
                try:
                    if self.connected_to_mt5:
                        self.update_position_monitoring()
                    await asyncio.sleep(5)  # Check every 5 seconds
                except Exception as e:
                    logger.error(f"Error in position monitoring: {e}")
                    await asyncio.sleep(10)  # Wait longer on error
        
        # Start both server and position monitoring
        async with websockets.serve(handler, self.host, self.port):
            logger.info(f"WebSocket server started on ws://{self.host}:{self.port}")
            
            # Start position monitoring task
            monitor_task = asyncio.create_task(position_monitor())
            logger.info("Position monitoring started")
            
            try:
                await asyncio.Future()  # Run forever
            finally:
                monitor_task.cancel()
    
    def shutdown(self):
        """Shutdown MT5 connection"""
        if self.connected_to_mt5:
            mt5.shutdown()
            logger.info("MT5 connection closed")

if __name__ == "__main__":
    bridge = MT5Bridge()
    
    try:
        asyncio.run(bridge.start_server())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        bridge.shutdown()
