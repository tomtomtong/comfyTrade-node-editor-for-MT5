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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MT5Bridge:
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.connected_to_mt5 = False
        self.websocket = None
        
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
        """Get MT5 account information"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
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
        """Get open positions"""
        if not self.connected_to_mt5:
            return {"error": "Not connected to MT5"}
        
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
        """Execute a trading order"""
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
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
        """Close a position by ticket"""
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
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
        """Modify stop loss and take profit of a position"""
        if not self.connected_to_mt5:
            return {"success": False, "error": "Not connected to MT5"}
        
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
            
            else:
                response['error'] = f"Unknown action: {action}"
            
            await websocket.send(json.dumps(response))
            
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await websocket.send(json.dumps({"error": str(e), "messageId": data.get('messageId') if 'data' in locals() else None}))
    
    async def start_server(self):
        """Start WebSocket server"""
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
        
        async with websockets.serve(handler, self.host, self.port):
            logger.info(f"WebSocket server started on ws://{self.host}:{self.port}")
            await asyncio.Future()  # Run forever
    
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
