"""
Simulator Module - Manages simulated trading positions
Stores positions locally and calculates P&L using real MT5 market data
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional

class TradingSimulator:
    def __init__(self, storage_file='app_settings.json'):
        self.storage_file = storage_file
        self.positions = []
        self.closed_positions = []
        self.next_ticket = 1000000  # Start with high ticket numbers to distinguish from real trades
        self.initial_balance = 10000.0  # Default starting balance
        self.load_positions()
    
    def load_positions(self):
        """Load positions from unified settings file"""
        if os.path.exists(self.storage_file):
            try:
                with open(self.storage_file, 'r') as f:
                    data = json.load(f)
                    simulator_data = data.get('simulator', {})
                    self.positions = simulator_data.get('positions', [])
                    self.closed_positions = simulator_data.get('closed_positions', [])
                    self.next_ticket = simulator_data.get('next_ticket', 1000000)
                    self.initial_balance = simulator_data.get('initial_balance', 10000.0)
            except Exception as e:
                print(f"Error loading simulator positions: {e}")
                self.positions = []
                self.closed_positions = []
    
    def save_positions(self):
        """Save positions to unified settings file"""
        try:
            # Load existing settings
            try:
                with open(self.storage_file, 'r') as f:
                    data = json.load(f)
            except FileNotFoundError:
                data = {}
            
            # Update simulator section
            data['simulator'] = {
                'positions': self.positions,
                'closed_positions': self.closed_positions,
                'next_ticket': self.next_ticket,
                'initial_balance': self.initial_balance,
                'last_updated': datetime.now().isoformat()
            }
            
            # Save back to unified settings
            with open(self.storage_file, 'w') as f:
                json.dump(data, f, indent=2)
                
            # Also maintain backward compatibility
            try:
                legacy_data = {
                    'positions': self.positions,
                    'closed_positions': self.closed_positions,
                    'next_ticket': self.next_ticket,
                    'initial_balance': self.initial_balance,
                    'last_updated': datetime.now().isoformat()
                }
                with open('simulator_positions.json', 'w') as f:
                    json.dump(legacy_data, f, indent=2)
            except Exception as e:
                print(f"Warning: Could not update legacy simulator file: {e}")
                
        except Exception as e:
            print(f"Error saving simulator positions: {e}")
    
    def get_next_ticket(self):
        """Generate next ticket number"""
        ticket = self.next_ticket
        self.next_ticket += 1
        self.save_positions()
        return ticket
    
    def open_position(self, symbol: str, order_type: str, volume: float, 
                     open_price: float, sl: float = 0, tp: float = 0) -> Dict:
        """Open a simulated position"""
        ticket = self.get_next_ticket()
        
        position = {
            'ticket': ticket,
            'symbol': symbol,
            'type': order_type.upper(),
            'volume': volume,
            'open_price': open_price,
            'current_price': open_price,
            'sl': sl,
            'tp': tp,
            'profit': 0.0,
            'open_time': datetime.now().isoformat(),
            'comment': 'SIMULATOR'
        }
        
        self.positions.append(position)
        self.save_positions()
        
        return {
            'success': True,
            'ticket': ticket,
            'price': open_price,
            'message': 'Simulated order executed successfully'
        }
    
    def update_position_prices(self, symbol: str, current_price: float, 
                              contract_size: float = 100000, tick_value: float = 1.0, tick_size: float = 0.00001):
        """Update current prices and calculate P&L for positions of a symbol"""
        for position in self.positions:
            if position['symbol'] == symbol:
                position['current_price'] = current_price
                
                # Calculate profit/loss
                price_diff = 0
                if position['type'] == 'BUY':
                    price_diff = current_price - position['open_price']
                else:  # SELL
                    price_diff = position['open_price'] - current_price
                
                # P&L = (price_diff / tick_size) * volume * tick_value
                # This correctly handles different symbol types (forex, indices, etc.)
                if tick_size > 0:
                    position['profit'] = (price_diff / tick_size) * position['volume'] * tick_value
                else:
                    # Fallback to old calculation if tick_size is invalid
                    position['profit'] = price_diff * position['volume'] * contract_size
        
        self.save_positions()
    
    def get_positions(self) -> List[Dict]:
        """Get all open simulated positions"""
        return self.positions
    
    def close_position(self, ticket: int, close_price: float, 
                      tick_size: float = None, tick_value: float = None, 
                      contract_size: float = None) -> Dict:
        """Close a simulated position
        
        Args:
            ticket: Position ticket number
            close_price: Price at which to close the position
            tick_size: Minimum price movement (e.g., 0.00001 for forex, 1.0 for indices)
            tick_value: Value of one tick per lot
            contract_size: Contract size (fallback if tick_size/tick_value not provided)
        """
        position = None
        for i, pos in enumerate(self.positions):
            if pos['ticket'] == ticket:
                position = self.positions.pop(i)
                break
        
        if not position:
            return {'success': False, 'error': 'Position not found'}
        
        # Update final price and profit
        position['current_price'] = close_price
        position['close_price'] = close_price
        position['close_time'] = datetime.now().isoformat()
        
        # Calculate final profit
        price_diff = 0
        if position['type'] == 'BUY':
            price_diff = close_price - position['open_price']
        else:  # SELL
            price_diff = position['open_price'] - close_price
        
        # Use proper calculation with tick_size and tick_value if available
        if tick_size is not None and tick_value is not None and tick_size > 0:
            # Correct formula: (price_diff / tick_size) * volume * tick_value
            position['profit'] = (price_diff / tick_size) * position['volume'] * tick_value
        elif contract_size is not None:
            # Fallback to contract_size calculation
            position['profit'] = price_diff * position['volume'] * contract_size
        else:
            # Last resort: assume forex standard lot (100000)
            # This is a fallback and may be incorrect for indices
            position['profit'] = price_diff * position['volume'] * 100000
        
        # Add to closed positions
        self.closed_positions.append(position)
        self.save_positions()
        
        return {'success': True, 'message': 'Simulated position closed'}
    
    def modify_position(self, ticket: int, sl: Optional[float] = None, 
                       tp: Optional[float] = None) -> Dict:
        """Modify SL/TP of a simulated position"""
        for position in self.positions:
            if position['ticket'] == ticket:
                if sl is not None:
                    position['sl'] = sl
                if tp is not None:
                    position['tp'] = tp
                self.save_positions()
                return {'success': True, 'message': 'Simulated position modified'}
        
        return {'success': False, 'error': 'Position not found'}
    
    def get_account_summary(self) -> Dict:
        """Calculate account summary from simulated positions"""
        total_profit = sum(pos['profit'] for pos in self.positions)
        closed_profit = sum(pos['profit'] for pos in self.closed_positions)
        
        balance = self.initial_balance + closed_profit
        equity = balance + total_profit
        
        return {
            'balance': round(balance, 2),
            'equity': round(equity, 2),
            'profit': round(total_profit, 2),
            'margin': 0.0,  # Simplified for simulator
            'free_margin': round(equity, 2),
            'leverage': 100,
            'currency': 'USD'
        }
    
    def get_closed_positions(self, days_back: int = 7) -> List[Dict]:
        """Get closed simulated positions"""
        from datetime import timedelta
        
        cutoff_date = datetime.now() - timedelta(days=days_back)
        
        filtered_positions = []
        for pos in self.closed_positions:
            try:
                close_time = datetime.fromisoformat(pos['close_time'])
                if close_time >= cutoff_date:
                    # Calculate duration
                    open_time = datetime.fromisoformat(pos['open_time'])
                    duration = (close_time - open_time).total_seconds() / 60
                    
                    filtered_positions.append({
                        'ticket': pos['ticket'],
                        'symbol': pos['symbol'],
                        'type': pos['type'],
                        'volume': pos['volume'],
                        'open_price': pos['open_price'],
                        'close_price': pos['close_price'],
                        'open_time': pos['open_time'],
                        'close_time': pos['close_time'],
                        'profit': round(pos['profit'], 2),
                        'swap': 0.0,
                        'commission': 0.0,
                        'comment': pos.get('comment', 'SIMULATOR'),
                        'duration_minutes': round(duration, 1)
                    })
            except Exception as e:
                print(f"Error processing closed position: {e}")
                continue
        
        # Sort by close time (most recent first)
        filtered_positions.sort(key=lambda x: x['close_time'], reverse=True)
        
        return filtered_positions
    
    def reset_simulator(self, initial_balance: float = 10000.0):
        """Reset simulator to initial state"""
        self.positions = []
        self.closed_positions = []
        self.next_ticket = 1000000
        self.initial_balance = initial_balance
        self.save_positions()
        
        return {
            'success': True,
            'message': f'Simulator reset with balance: {initial_balance}'
        }
    
    def check_tp_sl_hits(self, symbol_info_map: Optional[Dict[str, Dict]] = None):
        """Check if any positions hit TP or SL and auto-close them
        
        Args:
            symbol_info_map: Optional dict mapping symbol to {tick_size, tick_value, contract_size}
        """
        positions_to_close = []
        
        for position in self.positions:
            current_price = position['current_price']
            tp = position.get('tp', 0)
            sl = position.get('sl', 0)
            
            should_close = False
            close_reason = ''
            
            if position['type'] == 'BUY':
                if tp > 0 and current_price >= tp:
                    should_close = True
                    close_reason = 'Take Profit'
                elif sl > 0 and current_price <= sl:
                    should_close = True
                    close_reason = 'Stop Loss'
            else:  # SELL
                if tp > 0 and current_price <= tp:
                    should_close = True
                    close_reason = 'Take Profit'
                elif sl > 0 and current_price >= sl:
                    should_close = True
                    close_reason = 'Stop Loss'
            
            if should_close:
                # Get symbol info if available
                symbol_info = symbol_info_map.get(position['symbol'], {}) if symbol_info_map else {}
                positions_to_close.append((
                    position['ticket'], 
                    current_price, 
                    close_reason,
                    symbol_info.get('tick_size'),
                    symbol_info.get('tick_value'),
                    symbol_info.get('contract_size')
                ))
        
        # Close positions that hit TP/SL
        closed_tickets = []
        for ticket, close_price, reason, tick_size, tick_value, contract_size in positions_to_close:
            result = self.close_position(ticket, close_price, tick_size, tick_value, contract_size)
            if result['success']:
                closed_tickets.append({'ticket': ticket, 'reason': reason})
        
        return closed_tickets
