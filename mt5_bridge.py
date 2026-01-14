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
from simulator import TradingSimulator
import yfinance as yf
import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MT5Bridge:
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.connected_to_mt5 = False
        self.websocket = None
        self.twilio_config = {}
        self.alert_config = {}
        self.monitored_positions = {}  # Track positions for TP/SL alerts (alerts handled by Node.js)
        self.simulator_mode = False  # Simulator mode flag
        self.simulator = TradingSimulator()  # Simulator instance
        self.load_twilio_config()
        self.load_simulator_mode()
    
    def load_twilio_config(self):
        """Load Twilio configuration from unified settings file (for reference only - alerts handled by Node.js)"""
        try:
            with open('app_settings.json', 'r') as f:
                settings = json.load(f)
                twilio_config = settings.get('twilio', {})
                self.twilio_config = twilio_config  # Store for later retrieval
                self.alert_config = settings.get('notifications', {})
            logger.info("Twilio config loaded (alerts handled by Node.js bridge)")
        except FileNotFoundError:
            logger.warning("app_settings.json not found.")
            self.twilio_config = {}
        except Exception as e:
            logger.error(f"Error loading Twilio config: {e}")
            self.twilio_config = {}
    
    def update_position_monitoring(self):
        """Update monitored positions (TP/SL alerts handled by Node.js bridge)"""
        # Position monitoring kept for potential future use
        # Twilio alerts are now handled by the Node.js bridge
        try:
            current_positions = self.get_positions()
            if isinstance(current_positions, dict) and 'error' in current_positions:
                return
            
            current_tickets = {pos['ticket'] for pos in current_positions}
            previous_tickets = set(self.monitored_positions.keys())
            
            # Update monitored positions (alerts handled by Node.js)
            for position in current_positions:
                ticket = position['ticket']
                self.monitored_positions[ticket] = position
                
        except Exception as e:
            logger.error(f"Error updating position monitoring: {e}")
        
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
        # SIMULATOR MODE: Return simulated positions (works without MT5 connection)
        if self.simulator_mode:
            # Update prices for all simulated positions if MT5 is connected
            sim_positions = self.simulator.get_positions()
            if self.connected_to_mt5:
                for pos in sim_positions:
                    symbol = pos['symbol']
                    tick = mt5.symbol_info_tick(symbol)
                    if tick:
                        current_price = tick.bid if pos['type'] == 'BUY' else tick.ask
                        # Try multiple approaches to get symbol info for .cash symbols
                        symbol_info = mt5.symbol_info(symbol)
                        
                        # If symbol_info is None, try with uppercase or alternative formats
                        if symbol_info is None:
                            # Try uppercase version (e.g., "US30.CASH")
                            symbol_upper = symbol.upper()
                            symbol_info = mt5.symbol_info(symbol_upper)
                        
                        if symbol_info is None:
                            # Try without .cash suffix (e.g., "US30")
                            if '.cash' in symbol.lower():
                                base_symbol = symbol.split('.')[0]
                                symbol_info = mt5.symbol_info(base_symbol)
                        
                        if symbol_info:
                            contract_size = symbol_info.trade_contract_size or 100000
                            tick_value = symbol_info.trade_tick_value or 1.0
                            tick_size = symbol_info.trade_tick_size or symbol_info.point or 0.00001
                        else:
                            # Fallback: Use appropriate defaults based on symbol type
                            if '.cash' in symbol.lower():
                                # Defaults for cash/index symbols
                                contract_size = 1.0
                                tick_value = 1.0
                                tick_size = 1.0
                            else:
                                # Defaults for forex symbols
                                contract_size = 100000
                                tick_value = 1.0
                                tick_size = 0.00001
                        self.simulator.update_position_prices(symbol, current_price, 
                                                             contract_size, tick_value, tick_size)
                
                # Check for TP/SL hits with symbol info for accurate P&L calculation
                # Build symbol info map for all positions
                symbol_info_map = {}
                for pos in sim_positions:
                    symbol = pos['symbol']
                    # Try multiple approaches to get symbol info for .cash symbols
                    symbol_info = mt5.symbol_info(symbol)
                    
                    # If symbol_info is None, try with uppercase or alternative formats
                    if symbol_info is None:
                        # Try uppercase version (e.g., "US30.CASH")
                        symbol_upper = symbol.upper()
                        symbol_info = mt5.symbol_info(symbol_upper)
                    
                    if symbol_info is None:
                        # Try without .cash suffix (e.g., "US30")
                        if '.cash' in symbol.lower():
                            base_symbol = symbol.split('.')[0]
                            symbol_info = mt5.symbol_info(base_symbol)
                    
                    if symbol_info:
                        symbol_info_map[symbol] = {
                            'tick_size': symbol_info.trade_tick_size or symbol_info.point or None,
                            'tick_value': symbol_info.trade_tick_value or None,
                            'contract_size': symbol_info.trade_contract_size or None
                        }
                self.simulator.check_tp_sl_hits(symbol_info_map)
            
            # Normalize simulator positions to match real position format
            result = []
            for pos in sim_positions:
                result.append({
                    "ticket": pos['ticket'],
                    "symbol": pos['symbol'],
                    "type": pos['type'],
                    "volume": pos['volume'],
                    "open_price": pos['open_price'],
                    "current_price": pos['current_price'],
                    "profit": pos['profit'],
                    "stop_loss": pos.get('sl', 0),  # Convert 'sl' to 'stop_loss'
                    "take_profit": pos.get('tp', 0)  # Convert 'tp' to 'take_profit'
                })
            return result
        
        # REAL MODE: Require MT5 connection
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
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
    
    def get_pending_orders(self):
        """Get pending orders (limit orders that haven't been executed)"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
        # Get pending orders from MT5
        orders = mt5.orders_get()
        if orders is None:
            return []
        
        result = []
        for order in orders:
            # Determine order type string
            if order.type == mt5.ORDER_TYPE_BUY_LIMIT:
                order_type_str = "BUY LIMIT"
            elif order.type == mt5.ORDER_TYPE_SELL_LIMIT:
                order_type_str = "SELL LIMIT"
            elif order.type == mt5.ORDER_TYPE_BUY_STOP:
                order_type_str = "BUY STOP"
            elif order.type == mt5.ORDER_TYPE_SELL_STOP:
                order_type_str = "SELL STOP"
            else:
                order_type_str = "UNKNOWN"
            
            result.append({
                "ticket": order.ticket,
                "symbol": order.symbol,
                "type": order_type_str,
                "volume": order.volume_initial,
                "volume_current": order.volume_current,
                "price": order.price_open,
                "stop_loss": order.sl,
                "take_profit": order.tp,
                "time_setup": order.time_setup,
                "time_expiration": order.time_expiration,
                "comment": order.comment
            })
        
        return result
    
    def cancel_pending_order(self, ticket):
        """Cancel a pending order"""
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
        # Prepare order deletion request
        request = {
            "action": mt5.TRADE_ACTION_REMOVE,
            "order": ticket,
            "magic": 234000,
        }
        
        logger.info(f"Cancelling pending order: ticket={ticket}")
        result = mt5.order_send(request)
        
        if result is None:
            logger.error("Order cancellation returned None")
            return {"success": False, "error": "Order cancellation failed - MT5 returned None"}
        
        logger.info(f"Order cancellation result: retcode={result.retcode}, comment={result.comment}")
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            error_msg = f"Order cancellation failed: {result.comment} (retcode: {result.retcode})"
            logger.error(error_msg)
            return {"success": False, "error": error_msg}
        
        logger.info(f"Pending order cancelled successfully: ticket={ticket}")
        return {
            "success": True,
            "ticket": ticket,
            "message": "Pending order cancelled successfully"
        }
    
    def modify_pending_order(self, ticket, sl=None, tp=None, price=None):
        """Modify stop loss, take profit, or price of a pending order"""
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
        # Get the existing order to retrieve current values
        orders = mt5.orders_get(ticket=ticket)
        if orders is None or len(orders) == 0:
            return {"success": False, "error": "Pending order not found"}
        
        order = orders[0]
        
        # Use existing values if not provided, allow 0 to remove SL/TP
        new_sl = order.sl if sl is None else float(sl)
        new_tp = order.tp if tp is None else float(tp)
        new_price = order.price_open if price is None else float(price)
        
        # Get symbol info for validation
        symbol_info = mt5.symbol_info(order.symbol)
        if symbol_info is None:
            return {"success": False, "error": f"Symbol {order.symbol} not found"}
        
        # Normalize prices to symbol's tick size
        tick_size = symbol_info.trade_tick_size
        if tick_size > 0:
            new_price = round(new_price / tick_size) * tick_size
            if new_sl > 0:
                new_sl = round(new_sl / tick_size) * tick_size
            if new_tp > 0:
                new_tp = round(new_tp / tick_size) * tick_size
        
        # Prepare order modification request
        request = {
            "action": mt5.TRADE_ACTION_MODIFY,
            "order": ticket,
            "price": new_price,
            "sl": new_sl,
            "tp": new_tp,
            "magic": 234000,
        }
        
        logger.info(f"Modifying pending order: ticket={ticket}, price={new_price}, sl={new_sl}, tp={new_tp}")
        result = mt5.order_send(request)
        
        if result is None:
            logger.error("Order modification returned None")
            return {"success": False, "error": "Order modification failed - MT5 returned None"}
        
        logger.info(f"Order modification result: retcode={result.retcode}, comment={result.comment}")
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            error_msg = f"Order modification failed: {result.comment} (retcode: {result.retcode})"
            logger.error(error_msg)
            return {"success": False, "error": error_msg}
        
        logger.info(f"Pending order modified successfully: ticket={ticket}")
        return {
            "success": True,
            "ticket": ticket,
            "message": "Pending order modified successfully"
        }
    
    def execute_order(self, symbol, order_type, volume, sl=0, tp=0, execution_type='MARKET', limit_price=None):
        """Execute a trading order (real or simulated)"""
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
        # SIMULATOR MODE: Execute simulated trade
        if self.simulator_mode:
            logger.info(f"[SIMULATOR] Executing order: {symbol} {order_type} {volume} SL:{sl} TP:{tp} ExecutionType:{execution_type}")
            
            # Get current market price
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                return {"success": False, "error": f"Failed to get current price for {symbol}"}
            
            # For limit orders in simulator, use limit price if provided, otherwise use market price
            if execution_type == 'LIMIT' and limit_price:
                open_price = limit_price
            else:
                # Use appropriate price based on order type
                open_price = tick.ask if order_type == "BUY" else tick.bid
            
            # Open simulated position
            result = self.simulator.open_position(symbol, order_type, volume, open_price, sl, tp)
            logger.info(f"[SIMULATOR] Order executed: {result}")
            return result
        
        # REAL MODE: Execute actual trade
        logger.info(f"Executing order: {symbol} {order_type} {volume} SL:{sl} TP:{tp} ExecutionType:{execution_type}")
        
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
        
        # Get current tick data (price) - needed for validation and market orders
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            logger.error(f"Failed to get tick for {symbol}")
            return {"success": False, "error": f"Failed to get current price for {symbol}"}
        
        # Handle LIMIT orders
        if execution_type == 'LIMIT':
            if not limit_price or limit_price <= 0:
                return {"success": False, "error": "Limit price is required for limit orders"}
            
            # Validate limit price
            if order_type == "BUY" and limit_price >= tick.ask:
                return {"success": False, "error": f"BUY limit price ({limit_price}) must be below current ask ({tick.ask})"}
            if order_type == "SELL" and limit_price <= tick.bid:
                return {"success": False, "error": f"SELL limit price ({limit_price}) must be above current bid ({tick.bid})"}
            
            # Normalize limit price to symbol's tick size
            tick_size = symbol_info.trade_tick_size
            if tick_size > 0:
                limit_price = round(limit_price / tick_size) * tick_size
            
            # Prepare limit order request
            request = {
                "action": mt5.TRADE_ACTION_PENDING,
                "symbol": symbol,
                "volume": volume,
                "type": mt5.ORDER_TYPE_BUY_LIMIT if order_type == "BUY" else mt5.ORDER_TYPE_SELL_LIMIT,
                "price": limit_price,
                "magic": 234000,
                "type_time": mt5.ORDER_TIME_GTC,
            }
            
            # Add SL/TP only if specified
            # Convert to float to handle string inputs from JSON
            sl_float = float(sl) if sl else 0
            tp_float = float(tp) if tp else 0
            if sl_float > 0:
                request["sl"] = sl_float
            if tp_float > 0:
                request["tp"] = tp_float
            
            logger.info(f"Sending limit order request: {request}")
            result = mt5.order_send(request)
            
            if result is None:
                logger.error("Limit order send returned None - Check MT5 connection and trading permissions")
                return {"success": False, "error": "Limit order send failed - MT5 returned None. Check connection and parameters."}
            
            logger.info(f"Limit order result: retcode={result.retcode}, comment={result.comment}")
            
            # Check if order was successful
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                error_msg = f"Limit order failed: {result.comment} (retcode: {result.retcode})"
                logger.error(error_msg)
                return {"success": False, "error": error_msg}
            
            logger.info(f"Limit order placed successfully: ticket={result.order}, price={limit_price}")
            return {
                "success": True,
                "ticket": result.order,
                "price": limit_price,
                "message": "Limit order placed successfully"
            }
        
        # Handle MARKET orders (existing logic)
        # Determine price based on order type
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
        # Convert to float to handle string inputs from JSON
        sl_float = float(sl) if sl else 0
        tp_float = float(tp) if tp else 0
        if sl_float > 0:
            request["sl"] = sl_float
        if tp_float > 0:
            request["tp"] = tp_float
        
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
            
            symbol = position['symbol']
            
            # Get current market price
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                return {"success": False, "error": "Failed to get current price"}
            
            close_price = tick.bid if position['type'] == 'BUY' else tick.ask
            
            # Get symbol info for accurate P&L calculation
            # Try multiple approaches to get symbol info for .cash symbols
            symbol_info = mt5.symbol_info(symbol)
            
            # If symbol_info is None, try with uppercase or alternative formats
            if symbol_info is None:
                # Try uppercase version (e.g., "US30.CASH")
                symbol_upper = symbol.upper()
                symbol_info = mt5.symbol_info(symbol_upper)
            
            if symbol_info is None:
                # Try without .cash suffix (e.g., "US30")
                if '.cash' in symbol.lower():
                    base_symbol = symbol.split('.')[0]
                    symbol_info = mt5.symbol_info(base_symbol)
            
            if symbol_info:
                tick_size = symbol_info.trade_tick_size or symbol_info.point or None
                tick_value = symbol_info.trade_tick_value or None
                contract_size = symbol_info.trade_contract_size or None
            else:
                # Fallback: Use appropriate defaults based on symbol type
                # For .cash symbols (indices), use index defaults
                if '.cash' in symbol.lower():
                    # Defaults for cash/index symbols
                    tick_size = 1.0  # Indices typically move in whole numbers
                    tick_value = 1.0  # 1 point = 1 currency unit per lot
                    contract_size = 1.0  # Contract size is typically 1 for indices
                else:
                    # Defaults for forex symbols
                    tick_size = 0.00001
                    tick_value = 1.0
                    contract_size = 100000
            
            return self.simulator.close_position(ticket, close_price, tick_size, tick_value, contract_size)
        
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
        # SIMULATOR MODE: Modify simulated position (works without MT5 connection)
        if self.simulator_mode:
            return self.simulator.modify_position(ticket, sl, tp)
        
        # REAL MODE: Require MT5 connection
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
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
            
            # Update npnmwith new data (convert from old format to new format)
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
            
            # Reload configuration
            self.load_twilio_config()
            
            return {"success": True, "message": "Twilio configuration updated"}
            
        except Exception as e:
            logger.error(f"Error updating Twilio config: {e}")
            return {"success": False, "error": str(e)}
    
    def load_simulator_mode(self):
        """Load simulator mode from settings file"""
        try:
            with open('app_settings.json', 'r') as f:
                settings = json.load(f)
                # Check if simulator mode is stored in settings
                simulator_mode = settings.get('simulatorMode', False)
                self.simulator_mode = simulator_mode
                if simulator_mode:
                    logger.info("Simulator mode loaded from settings: ENABLED")
                else:
                    logger.info("Simulator mode loaded from settings: DISABLED")
        except FileNotFoundError:
            logger.warning("app_settings.json not found. Using default simulator mode (DISABLED).")
            self.simulator_mode = False
        except Exception as e:
            logger.error(f"Error loading simulator mode from settings: {e}")
            self.simulator_mode = False
    
    def save_simulator_mode(self, enabled):
        """Save simulator mode to settings file"""
        try:
            # Load existing settings
            try:
                with open('app_settings.json', 'r') as f:
                    settings = json.load(f)
            except FileNotFoundError:
                settings = {}
            
            # Update simulator mode
            settings['simulatorMode'] = enabled
            
            # Save updated settings
            with open('app_settings.json', 'w') as f:
                json.dump(settings, f, indent=2)
            
            logger.info(f"Simulator mode saved to settings: {'ENABLED' if enabled else 'DISABLED'}")
        except Exception as e:
            logger.error(f"Error saving simulator mode to settings: {e}")
    
    def toggle_simulator_mode(self, enabled):
        """Toggle simulator mode on/off"""
        self.simulator_mode = enabled
        self.save_simulator_mode(enabled)  # Persist to settings
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
    
    def convert_symbol_to_alpha_vantage(self, mt5_symbol):
        """
        Convert MetaTrader 5 symbol format to Alpha Vantage compatible format.
        
        Common conversions:
        - HK50.cash -> HK50
        - JP225.cash -> JP225
        - US30.cash -> US30
        - UK100.cash -> UK100
        - Standard forex pairs (EURUSD, GBPUSD, etc.) remain unchanged
        - Crypto symbols (BTCUSD, ETHUSD, etc.) remain unchanged
        
        Args:
            mt5_symbol: MetaTrader 5 symbol (e.g., 'HK50.cash', 'EURUSD')
            
        Returns:
            Alpha Vantage compatible symbol (e.g., 'HK50', 'EURUSD')
        """
        if not mt5_symbol:
            return mt5_symbol
        
        symbol = str(mt5_symbol).strip()
        original_symbol = symbol
        
        # Remove common MetaTrader suffixes (case-insensitive)
        # .cash, .CASH, .m, .M, etc.
        suffixes_to_remove = ['.cash', '.CASH', '.m', '.M', '.x', '.X']
        for suffix in suffixes_to_remove:
            if symbol.lower().endswith(suffix.lower()):
                symbol = symbol[:-len(suffix)]
                break
        
        # Special symbol mappings for indices and other instruments
        # These are common MetaTrader to Alpha Vantage mappings
        symbol_mappings = {
            # Indices - remove .cash suffix already handled above
            'HK50': 'HK50',  # Hang Seng Index
            'JP225': 'JP225',  # Nikkei 225
            'US30': 'DJI',  # Dow Jones - Alpha Vantage uses DJI
            'UK100': 'FTSE',  # FTSE 100 - Alpha Vantage uses FTSE
            'GER40': 'GDAXI',  # DAX - Alpha Vantage uses GDAXI
            'FRA40': 'FCHI',  # CAC 40 - Alpha Vantage uses FCHI
            'AUS200': 'AORD',  # ASX 200 - Alpha Vantage uses AORD
            'SPX500': 'SPY',  # S&P 500 - Alpha Vantage uses SPY (ETF) or ^GSPC
            'NAS100': 'QQQ',  # NASDAQ 100 - Alpha Vantage uses QQQ (ETF) or ^IXIC
            
            # Crypto - usually match but ensure uppercase
            'BTCUSD': 'BTCUSD',
            'ETHUSD': 'ETHUSD',
            
            # Forex pairs - usually match, keep as-is
            # EURUSD, GBPUSD, USDJPY, etc. remain unchanged
        }
        
        # Check if we have a direct mapping
        symbol_upper = symbol.upper()
        if symbol_upper in symbol_mappings:
            mapped_symbol = symbol_mappings[symbol_upper]
            if mapped_symbol != original_symbol:
                logger.info(f"Symbol mapping: {original_symbol} -> {mapped_symbol}")
            return mapped_symbol
        
        # For forex pairs and other symbols, return cleaned symbol (uppercase)
        # Alpha Vantage typically expects uppercase symbols
        result = symbol.upper()
        
        if result != original_symbol:
            logger.info(f"Symbol conversion: {original_symbol} -> {result}")
        
        return result
    
    def get_alpha_vantage_data(self, symbol, function='GLOBAL_QUOTE', api_key='', interval='1min', outputsize='compact', 
                               series_type='close', time_period=14, fastperiod=12, slowperiod=26, signalperiod=9):
        """Get data from Alpha Vantage API for the specified symbol"""
        try:
            # Convert MetaTrader symbol to Alpha Vantage format
            av_symbol = self.convert_symbol_to_alpha_vantage(symbol)
            logger.info(f"Fetching Alpha Vantage data for {symbol} (mapped to {av_symbol}): function={function}, interval={interval}")
            
            if not api_key:
                return {"error": "Alpha Vantage API key is required"}
            
            # Alpha Vantage API base URL
            base_url = "https://www.alphavantage.co/query"
            
            # Build request parameters
            params = {
                'function': function,
                'apikey': api_key
            }
            
            params['symbol'] = av_symbol
            
            # Add interval for intraday functions and technical indicators
            if function in ['TIME_SERIES_INTRADAY', 'TIME_SERIES_INTRADAY_EXTENDED']:
                params['interval'] = interval
            elif function in ['MACD', 'RSI', 'BBANDS', 'STOCH', 'ADX', 'CCI', 'AROON', 'AD', 'OBV', 'ATR', 'HT_SINE', 'HT_TRENDLINE', 'HT_DCPERIOD', 'HT_DCPHASE', 'HT_PHASOR']:
                params['interval'] = interval
            
            # Add outputsize for time series functions
            if function.startswith('TIME_SERIES_'):
                params['outputsize'] = outputsize
            
            # Add series_type for technical indicators
            if function in ['MACD', 'RSI', 'BBANDS', 'STOCH', 'ADX', 'CCI', 'AROON', 'AD', 'OBV', 'ATR', 'HT_SINE', 'HT_TRENDLINE', 'HT_DCPERIOD', 'HT_DCPHASE', 'HT_PHASOR']:
                params['series_type'] = series_type
            
            # Add time_period for RSI and other indicators
            if function in ['RSI', 'BBANDS', 'STOCH', 'ADX', 'CCI', 'AROON', 'ATR', 'HT_SINE', 'HT_TRENDLINE', 'HT_DCPERIOD', 'HT_DCPHASE', 'HT_PHASOR']:
                params['time_period'] = time_period
            
            # Add MACD-specific parameters
            if function == 'MACD':
                params['fastperiod'] = fastperiod
                params['slowperiod'] = slowperiod
                params['signalperiod'] = signalperiod
            
            # Make API request
            response = requests.get(base_url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            # Check for API errors
            if 'Error Message' in data:
                return {"error": data['Error Message']}
            if 'Note' in data:
                return {"error": "API call frequency limit reached. Please wait a moment."}
            
            # Parse response based on function type
            if function == 'GLOBAL_QUOTE':
                if 'Global Quote' not in data or not data['Global Quote']:
                    return {"error": f"No quote data available for symbol {av_symbol} (original: {symbol})"}
                
                quote = data['Global Quote']
                result_value = f"Price: {quote.get('05. price', 'N/A')}, " \
                              f"Change: {quote.get('09. change', 'N/A')}, " \
                              f"Change%: {quote.get('10. change percent', 'N/A')}, " \
                              f"Volume: {quote.get('06. volume', 'N/A')}"
                
                return {
                    "success": True,
                    "symbol": symbol,  # Return original symbol for user reference
                    "av_symbol": av_symbol,  # Include mapped symbol for debugging
                    "function": function,
                    "value": result_value,
                    "timestamp": datetime.now().isoformat()
                }
            
            elif function == 'TIME_SERIES_INTRADAY':
                if 'Time Series' not in data or not data.get('Time Series'):
                    return {"error": f"No intraday data available for symbol {av_symbol} (original: {symbol})"}
                
                time_series = data['Time Series']
                # Get the most recent data point
                latest_time = max(time_series.keys())
                latest_data = time_series[latest_time]
                
                result_value = f"Time: {latest_time}, " \
                              f"Open: {latest_data.get('1. open', 'N/A')}, " \
                              f"High: {latest_data.get('2. high', 'N/A')}, " \
                              f"Low: {latest_data.get('3. low', 'N/A')}, " \
                              f"Close: {latest_data.get('4. close', 'N/A')}, " \
                              f"Volume: {latest_data.get('5. volume', 'N/A')}"
                
                return {
                    "success": True,
                    "symbol": symbol,
                    "function": function,
                    "value": result_value,
                    "timestamp": datetime.now().isoformat()
                }
            
            elif function == 'TIME_SERIES_DAILY':
                if 'Time Series (Daily)' not in data or not data.get('Time Series (Daily)'):
                    return {"error": f"No daily data available for symbol {av_symbol} (original: {symbol})"}
                
                time_series = data['Time Series (Daily)']
                latest_date = max(time_series.keys())
                latest_data = time_series[latest_date]
                
                result_value = f"Date: {latest_date}, " \
                              f"Open: {latest_data.get('1. open', 'N/A')}, " \
                              f"High: {latest_data.get('2. high', 'N/A')}, " \
                              f"Low: {latest_data.get('3. low', 'N/A')}, " \
                              f"Close: {latest_data.get('4. close', 'N/A')}, " \
                              f"Volume: {latest_data.get('5. volume', 'N/A')}"
                
                return {
                    "success": True,
                    "symbol": symbol,
                    "function": function,
                    "value": result_value,
                    "timestamp": datetime.now().isoformat()
                }
            
            elif function == 'OVERVIEW':
                if 'Symbol' not in data:
                    return {"error": f"No overview data available for symbol {symbol}"}
                
                result_value = f"Name: {data.get('Name', 'N/A')}, " \
                              f"Sector: {data.get('Sector', 'N/A')}, " \
                              f"Market Cap: {data.get('MarketCapitalization', 'N/A')}, " \
                              f"PE Ratio: {data.get('PERatio', 'N/A')}, " \
                              f"Dividend Yield: {data.get('DividendYield', 'N/A')}"
                
                return {
                    "success": True,
                    "symbol": symbol,
                    "function": function,
                    "value": result_value,
                    "timestamp": datetime.now().isoformat()
                }
            
            elif function == 'MACD':
                if 'Technical Analysis: MACD' not in data or not data.get('Technical Analysis: MACD'):
                    return {"error": f"No MACD data available for symbol {symbol}"}
                
                macd_data = data['Technical Analysis: MACD']
                # Get the most recent data point
                latest_date = max(macd_data.keys())
                latest_macd = macd_data[latest_date]
                
                result_value = f"Date: {latest_date}, " \
                              f"MACD: {latest_macd.get('MACD', 'N/A')}, " \
                              f"MACD Signal: {latest_macd.get('MACD_Signal', 'N/A')}, " \
                              f"MACD Hist: {latest_macd.get('MACD_Hist', 'N/A')}"
                
                return {
                    "success": True,
                    "symbol": symbol,
                    "function": function,
                    "value": result_value,
                    "timestamp": datetime.now().isoformat()
                }
            
            elif function == 'RSI':
                if 'Technical Analysis: RSI' not in data or not data.get('Technical Analysis: RSI'):
                    return {"error": f"No RSI data available for symbol {symbol}"}
                
                rsi_data = data['Technical Analysis: RSI']
                # Get the most recent data point
                latest_date = max(rsi_data.keys())
                latest_rsi = rsi_data[latest_date]
                
                rsi_value = latest_rsi.get('RSI', 'N/A')
                result_value = f"Date: {latest_date}, RSI: {rsi_value}"
                
                return {
                    "success": True,
                    "symbol": symbol,
                    "function": function,
                    "value": result_value,
                    "timestamp": datetime.now().isoformat()
                }
            
            else:
                # For other functions, return JSON string
                return {
                    "success": True,
                    "symbol": symbol,
                    "function": function,
                    "value": json.dumps(data, indent=2),
                    "timestamp": datetime.now().isoformat()
                }
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching Alpha Vantage data for {symbol}: {e}")
            return {"error": f"API request failed: {str(e)}"}
        except Exception as e:
            logger.error(f"Error fetching Alpha Vantage data for {symbol}: {e}")
            return {"error": str(e)}
    
    def call_llm(self, model='gpt-3.5-turbo', prompt='Hello', max_tokens=150, temperature=0.7, api_key='', base_url='https://api.openai.com/v1'):
        """Call LLM API (OpenAI compatible) with the given prompt"""
        try:
            logger.info(f"Calling LLM with model: {model}, base_url: {base_url}, prompt length: {len(prompt)}")
            
            if not api_key:
                return {"error": "API key is required for LLM calls"}
            
            import requests
            
            # Use provided base URL or default to OpenAI
            url = f"{base_url.rstrip('/')}/chat/completions"
            
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": model,
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": max_tokens,
                "temperature": temperature
            }
            
            logger.info(f"Sending request to OpenAI API...")
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if 'choices' in result and len(result['choices']) > 0:
                    llm_response = result['choices'][0]['message']['content']
                    logger.info(f"LLM response received: {llm_response[:100]}...")
                    
                    return {
                        "success": True,
                        "model": model,
                        "response": llm_response,
                        "usage": result.get('usage', {}),
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    return {"error": "No response from LLM"}
            else:
                error_msg = f"API request failed with status {response.status_code}: {response.text}"
                logger.error(error_msg)
                return {"error": error_msg}
                
        except Exception as e:
            logger.error(f"Error calling LLM: {e}")
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
    
    def firecrawl_scrape(self, url='', scrape_type='scrape', api_key='', base_url='https://api.firecrawl.dev/v0', 
                        include_raw_html=False, only_main_content=False, max_pages=1, 
                        wait_for='networkidle', timeout=30000, extractor_schema=None):
        """Scrape web content using Firecrawl API"""
        try:
            logger.info(f"Firecrawling URL: {url}, type: {scrape_type}")
            
            if not api_key:
                return {"error": "Firecrawl API key is required"}
            
            if not url:
                return {"error": "URL is required for scraping"}
            
            import requests
            
            # Prepare headers
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            # Prepare payload based on scrape type
            if scrape_type == 'scrape':
                payload = {
                    "url": url,
                    "formats": ["markdown"],
                    "includeRawHtml": include_raw_html,
                    "onlyMainContent": only_main_content,
                    "waitFor": wait_for,
                    "timeout": timeout
                }
                
                if extractor_schema:
                    payload["extractorOptions"] = {
                        "mode": "llm-extraction",
                        "extractionPrompt": extractor_schema.get("prompt", "Extract key information from this content"),
                        "extractionSchema": extractor_schema.get("schema", {})
                    }
                
                endpoint = f"{base_url.rstrip('/')}/scrape"
                
            elif scrape_type == 'crawl':
                payload = {
                    "url": url,
                    "formats": ["markdown"],
                    "includeRawHtml": include_raw_html,
                    "onlyMainContent": only_main_content,
                    "waitFor": wait_for,
                    "timeout": timeout,
                    "limit": max_pages
                }
                
                if extractor_schema:
                    payload["extractorOptions"] = {
                        "mode": "llm-extraction",
                        "extractionPrompt": extractor_schema.get("prompt", "Extract key information from this content"),
                        "extractionSchema": extractor_schema.get("schema", {})
                    }
                
                endpoint = f"{base_url.rstrip('/')}/crawl"
                
            else:
                return {"error": f"Invalid scrape_type: {scrape_type}. Must be 'scrape' or 'crawl'"}
            
            logger.info(f"Sending request to Firecrawl API: {endpoint}")
            response = requests.post(endpoint, json=payload, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Firecrawl request successful for {url}")
                
                # Extract relevant data from response
                if scrape_type == 'scrape':
                    scraped_data = {
                        "success": True,
                        "url": url,
                        "scrape_type": scrape_type,
                        "content": result.get("data", {}).get("markdown", ""),
                        "metadata": result.get("data", {}).get("metadata", {}),
                        "raw_html": result.get("data", {}).get("html", "") if include_raw_html else None,
                        "extracted_data": result.get("data", {}).get("llm_extraction", None) if extractor_schema else None
                    }
                else:  # crawl
                    scraped_data = {
                        "success": True,
                        "url": url,
                        "scrape_type": scrape_type,
                        "pages": len(result.get("data", [])),
                        "content": "\n\n--- PAGE BREAK ---\n\n".join([
                            page.get("markdown", "") for page in result.get("data", [])
                        ]),
                        "metadata": [page.get("metadata", {}) for page in result.get("data", [])],
                        "raw_html": [page.get("html", "") for page in result.get("data", [])] if include_raw_html else None,
                        "extracted_data": [page.get("llm_extraction", None) for page in result.get("data", [])] if extractor_schema else None
                    }
                
                return scraped_data
                
            else:
                error_msg = f"Firecrawl API error: {response.status_code} - {response.text}"
                logger.error(error_msg)
                return {"error": error_msg}
                
        except requests.exceptions.Timeout:
            error_msg = "Firecrawl request timed out"
            logger.error(error_msg)
            return {"error": error_msg}
            
        except requests.exceptions.RequestException as e:
            error_msg = f"Firecrawl request failed: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg}
            
        except Exception as e:
            error_msg = f"Error in Firecrawl scraping: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg}
    
    def execute_python_script(self, script='', input_data='', input_var_name='input_data'):
        """Execute custom Python script and return the result as a string"""
        try:
            logger.info(f"Executing Python script with input variable: {input_var_name}")
            
            if not script or not script.strip():
                return {"error": "Python script is required"}
            
            # Create a safe execution environment with limited globals
            safe_globals = {
                '__builtins__': {
                    'print': print,
                    'len': len,
                    'str': str,
                    'int': int,
                    'float': float,
                    'bool': bool,
                    'list': list,
                    'dict': dict,
                    'tuple': tuple,
                    'set': set,
                    'range': range,
                    'enumerate': enumerate,
                    'zip': zip,
                    'map': map,
                    'filter': filter,
                    'sum': sum,
                    'min': min,
                    'max': max,
                    'abs': abs,
                    'round': round,
                    'sorted': sorted,
                    'reversed': reversed,
                    'any': any,
                    'all': all,
                },
                'datetime': datetime,
                'json': json,
                'math': __import__('math'),
                're': __import__('re'),
            }
            
            # Add input data to the execution environment
            local_vars = {
                input_var_name: input_data,
                'result': ''  # Default result variable
            }
            
            # Execute the script
            exec(script, safe_globals, local_vars)
            
            # Get the result - check for 'result' variable
            if 'result' in local_vars:
                output = str(local_vars['result'])
            else:
                output = "Script executed successfully (no 'result' variable set)"
            
            logger.info(f"Python script executed successfully, output length: {len(output)}")
            
            return {
                "success": True,
                "output": output
            }
            
        except SyntaxError as e:
            error_msg = f"Python syntax error: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg}
            
        except NameError as e:
            error_msg = f"Python name error: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg}
            
        except Exception as e:
            error_msg = f"Error executing Python script: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg}
    
    def get_sentiment_analysis(self, symbol='BTC', days_back=7, max_results=30, newsapi_key=''):
        """Sentiment analysis is now handled in JavaScript - this method is deprecated"""
        logger.warning("Sentiment analysis is now handled in JavaScript. This Python method is deprecated.")
        return {
            "error": "Sentiment analysis is now handled in JavaScript. Please use the JavaScript implementation."
        }
    
    def get_rsi_graph(self, symbol='EURUSD', period=14, bars=500, timeframe='H1', show_graph=True):
        """Generate RSI graph for the specified symbol and return data with base64 image"""
        try:
            import pandas as pd
            import matplotlib
            matplotlib.use('Agg')  # Use non-interactive backend
            import matplotlib.pyplot as plt
            import numpy as np
            import base64
            from io import BytesIO
            import os
            
            logger.info(f"Generating RSI graph for {symbol}, period={period}, bars={bars}, timeframe={timeframe}")
            
            if not self.connected_to_mt5:
                return {"error": "Not connected to MT5"}
            
            # Map timeframe string to MT5 constant
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
            
            mt5_timeframe = timeframe_map.get(timeframe, mt5.TIMEFRAME_H1)
            
            # Get historical data
            rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, bars)
            
            if rates is None or len(rates) == 0:
                return {"error": f"Failed to get data for {symbol}"}
            
            # Convert to DataFrame
            df = pd.DataFrame(rates)
            df['time'] = pd.to_datetime(df['time'], unit='s')
            
            # Calculate RSI
            delta = df['close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            
            rs = gain / loss
            df['rsi'] = 100 - (100 / (1 + rs))
            
            # Get current RSI value
            current_rsi = df['rsi'].iloc[-1]
            
            # Determine status
            if current_rsi > 70:
                status = "OVERBOUGHT"
            elif current_rsi < 30:
                status = "OVERSOLD"
            else:
                status = "NEUTRAL"
            
            result = {
                "success": True,
                "symbol": symbol,
                "period": period,
                "timeframe": timeframe,
                "bars": bars,
                "current_rsi": float(current_rsi) if not np.isnan(current_rsi) else None,
                "status": status
            }
            
            # Generate graph if requested
            if show_graph:
                # Create figure with subplots
                fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10), 
                                                gridspec_kw={'height_ratios': [2, 1]})
                fig.suptitle(f'{symbol} - Price and RSI({period})', fontsize=16, fontweight='bold')
                
                # Set dark theme
                fig.patch.set_facecolor('#1e1e1e')
                for ax in [ax1, ax2]:
                    ax.set_facecolor('#2a2a2a')
                    ax.tick_params(colors='white')
                    ax.xaxis.label.set_color('white')
                    ax.yaxis.label.set_color('white')
                    ax.title.set_color('white')
                    for spine in ax.spines.values():
                        spine.set_color('#444')
                
                # Plot price
                ax1.plot(df['time'], df['close'], label='Close Price', color='#2962FF', linewidth=1.5)
                ax1.set_ylabel('Price', fontsize=12, color='white')
                ax1.grid(True, alpha=0.3, color='#444')
                ax1.legend(loc='upper left', facecolor='#2a2a2a', labelcolor='white')
                ax1.set_title('Price Chart', fontsize=12, color='white')
                
                # Plot RSI
                ax2.plot(df['time'], df['rsi'], label=f'RSI({period})', color='#FF6D00', linewidth=1.5)
                ax2.axhline(y=70, color='#ff5722', linestyle='--', alpha=0.7, label='Overbought (70)')
                ax2.axhline(y=30, color='#4CAF50', linestyle='--', alpha=0.7, label='Oversold (30)')
                ax2.axhline(y=50, color='gray', linestyle='-', alpha=0.3)
                ax2.fill_between(df['time'], 30, 70, alpha=0.1, color='gray')
                ax2.set_ylabel('RSI', fontsize=12, color='white')
                ax2.set_xlabel('Time', fontsize=12, color='white')
                ax2.set_ylim(0, 100)
                ax2.grid(True, alpha=0.3, color='#444')
                ax2.legend(loc='upper left', facecolor='#2a2a2a', labelcolor='white')
                ax2.set_title(f'RSI Indicator (Period: {period})', fontsize=12, color='white')
                
                # Format x-axis
                plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45, ha='right', color='white')
                plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45, ha='right', color='white')
                
                plt.tight_layout()
                
                # Save to buffer and convert to base64
                buffer = BytesIO()
                plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', 
                           facecolor='#1e1e1e', edgecolor='none')
                buffer.seek(0)
                image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                plt.close(fig)
                
                result['image_base64'] = image_base64
                
                # Also save to file
                charts_dir = os.path.join(os.path.dirname(__file__), 'charts')
                os.makedirs(charts_dir, exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f'rsi_{symbol}_{period}_{timestamp}.png'
                filepath = os.path.join(charts_dir, filename)
                
                buffer.seek(0)
                with open(filepath, 'wb') as f:
                    f.write(buffer.getvalue())
                
                result['image_path'] = filepath
                
                logger.info(f"RSI graph generated successfully for {symbol}, saved to {filepath}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error generating RSI graph for {symbol}: {e}")
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
                
            elif action == 'getPendingOrders':
                response['data'] = self.get_pending_orders()
                
            elif action == 'cancelPendingOrder':
                result = self.cancel_pending_order(data.get('ticket'))
                response['data'] = result
                
            elif action == 'modifyPendingOrder':
                result = self.modify_pending_order(
                    data.get('ticket'),
                    data.get('stopLoss'),
                    data.get('takeProfit'),
                    data.get('price')
                )
                response['data'] = result
                
            elif action == 'executeOrder':
                result = self.execute_order(
                    data.get('symbol'),
                    data.get('type'),
                    data.get('volume'),
                    data.get('stopLoss', 0),
                    data.get('takeProfit', 0),
                    data.get('executionType', 'MARKET'),
                    data.get('limitPrice')
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
                # Twilio alerts are handled by Node.js bridge, not Python
                response['data'] = {"success": False, "error": "Twilio alerts handled by Node.js bridge"}
            
            elif action == 'updateTwilioConfig':
                config_data = data.get('config', {})
                result = self.update_twilio_config(config_data)
                response['data'] = result
            
            elif action == 'getTwilioConfig':
                # Return config from settings file (actual status handled by Node.js bridge)
                response['data'] = {
                    "enabled": self.twilio_config.get('enabled', False),
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
            
            elif action == 'getAlphaVantageData':
                symbol = data.get('symbol')
                function = data.get('function', 'GLOBAL_QUOTE')
                api_key = data.get('apiKey', '')
                interval = data.get('interval', '1min')
                outputsize = data.get('outputsize', 'compact')
                series_type = data.get('seriesType', 'close')
                time_period = data.get('timePeriod', 14)
                fastperiod = data.get('fastPeriod', 12)
                slowperiod = data.get('slowPeriod', 26)
                signalperiod = data.get('signalPeriod', 9)
                result = self.get_alpha_vantage_data(symbol, function, api_key, interval, outputsize, 
                                                     series_type, time_period, fastperiod, slowperiod, signalperiod)
                response['data'] = result
            
            elif action == 'callLLM':
                model = data.get('model', 'gpt-3.5-turbo')
                prompt = data.get('prompt', 'Hello')
                max_tokens = data.get('maxTokens', 150)
                temperature = data.get('temperature', 0.7)
                api_key = data.get('apiKey', '')
                base_url = data.get('baseUrl', 'https://api.openai.com/v1')
                result = self.call_llm(model, prompt, max_tokens, temperature, api_key, base_url)
                response['data'] = result
            
            elif action == 'firecrawlScrape':
                url = data.get('url', '')
                scrape_type = data.get('scrapeType', 'scrape')
                api_key = data.get('apiKey', '')
                base_url = data.get('baseUrl', 'https://api.firecrawl.dev/v0')
                include_raw_html = data.get('includeRawHtml', False)
                only_main_content = data.get('onlyMainContent', False)
                max_pages = data.get('maxPages', 1)
                wait_for = data.get('waitFor', 'networkidle')
                timeout = data.get('timeout', 30000)
                extractor_schema = data.get('extractorSchema', None)
                result = self.firecrawl_scrape(url, scrape_type, api_key, base_url, 
                                            include_raw_html, only_main_content, max_pages,
                                            wait_for, timeout, extractor_schema)
                response['data'] = result
            
            elif action == 'executePythonScript':
                script = data.get('script', '')
                input_data = data.get('inputData', '')
                input_var_name = data.get('inputVarName', 'input_data')
                result = self.execute_python_script(script, input_data, input_var_name)
                response['data'] = result
            
            elif action == 'getSentimentAnalysis':
                # Sentiment analysis is now handled in JavaScript - no longer processed here
                response['data'] = {
                    "error": "Sentiment analysis is now handled in JavaScript. This action should not be sent to Python bridge."
                }
            
            elif action == 'getRSIGraph':
                symbol = data.get('symbol', 'EURUSD')
                period = data.get('period', 14)
                bars = data.get('bars', 500)
                timeframe = data.get('timeframe', 'H1')
                show_graph = data.get('showGraph', True)
                result = self.get_rsi_graph(symbol, period, bars, timeframe, show_graph)
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
