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
        
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            return {"success": False, "error": f"Symbol {symbol} not found"}
        
        if not symbol_info.visible:
            if not mt5.symbol_select(symbol, True):
                return {"success": False, "error": f"Failed to select {symbol}"}
        
        point = symbol_info.point
        price = mt5.symbol_info_tick(symbol).ask if order_type == "BUY" else mt5.symbol_info_tick(symbol).bid
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": mt5.ORDER_TYPE_BUY if order_type == "BUY" else mt5.ORDER_TYPE_SELL,
            "price": price,
            "sl": sl,
            "tp": tp,
            "deviation": 20,
            "magic": 234000,
            "comment": "Electron MT5 Bridge",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request)
        
        if result is None:
            return {"success": False, "error": "Order send failed - MT5 returned None. Check connection and parameters."}
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {"success": False, "error": f"Order failed: {result.comment}"}
        
        return {
            "success": True,
            "ticket": result.order,
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
            "comment": "Close position",
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
