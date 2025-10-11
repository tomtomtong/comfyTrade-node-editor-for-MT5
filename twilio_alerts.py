"""
Twilio Alert Service for MT5 Trading Application
Sends SMS/WhatsApp notifications for take profit and other trading events
"""

import os
import logging
from twilio.rest import Client
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class TwilioAlerts:
    def __init__(self, account_sid: str = None, auth_token: str = None, from_number: str = None):
        """
        Initialize Twilio client
        
        Args:
            account_sid: Twilio Account SID (can also be set via TWILIO_ACCOUNT_SID env var)
            auth_token: Twilio Auth Token (can also be set via TWILIO_AUTH_TOKEN env var)
            from_number: Twilio phone number (can also be set via TWILIO_FROM_NUMBER env var)
        """
        self.account_sid = account_sid or os.getenv('TWILIO_ACCOUNT_SID')
        self.auth_token = auth_token or os.getenv('TWILIO_AUTH_TOKEN')
        self.from_number = from_number or os.getenv('TWILIO_FROM_NUMBER')
        
        if not all([self.account_sid, self.auth_token, self.from_number]):
            logger.warning("Twilio credentials not fully configured. Alerts will be disabled.")
            self.client = None
            self.enabled = False
        else:
            try:
                self.client = Client(self.account_sid, self.auth_token)
                self.enabled = True
                logger.info("Twilio client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Twilio client: {e}")
                self.client = None
                self.enabled = False
    
    def is_enabled(self) -> bool:
        """Check if Twilio alerts are enabled and configured"""
        return self.enabled and self.client is not None
    
    def send_sms(self, to_number: str, message: str) -> Dict[str, Any]:
        """
        Send SMS notification
        
        Args:
            to_number: Recipient phone number (e.g., '+1234567890')
            message: Message content
            
        Returns:
            Dict with success status and message details
        """
        if not self.is_enabled():
            return {"success": False, "error": "Twilio not configured"}
        
        try:
            message_obj = self.client.messages.create(
                body=message,
                from_=self.from_number,
                to=to_number
            )
            
            logger.info(f"SMS sent successfully to {to_number}, SID: {message_obj.sid}")
            return {
                "success": True,
                "sid": message_obj.sid,
                "status": message_obj.status,
                "message": "SMS sent successfully"
            }
            
        except Exception as e:
            logger.error(f"Failed to send SMS to {to_number}: {e}")
            return {"success": False, "error": str(e)}
    
    def send_whatsapp(self, to_number: str, message: str) -> Dict[str, Any]:
        """
        Send WhatsApp notification
        
        Args:
            to_number: Recipient WhatsApp number (e.g., 'whatsapp:+1234567890')
            message: Message content
            
        Returns:
            Dict with success status and message details
        """
        if not self.is_enabled():
            return {"success": False, "error": "Twilio not configured"}
        
        # Ensure WhatsApp format
        if not to_number.startswith('whatsapp:'):
            to_number = f'whatsapp:{to_number}'
        
        from_whatsapp = f'whatsapp:{self.from_number}'
        
        try:
            message_obj = self.client.messages.create(
                body=message,
                from_=from_whatsapp,
                to=to_number
            )
            
            logger.info(f"WhatsApp sent successfully to {to_number}, SID: {message_obj.sid}")
            return {
                "success": True,
                "sid": message_obj.sid,
                "status": message_obj.status,
                "message": "WhatsApp sent successfully"
            }
            
        except Exception as e:
            logger.error(f"Failed to send WhatsApp to {to_number}: {e}")
            return {"success": False, "error": str(e)}
    
    def send_take_profit_alert(self, position_data: Dict[str, Any], to_number: str, method: str = "sms") -> Dict[str, Any]:
        """
        Send take profit alert notification
        
        Args:
            position_data: Dictionary containing position information
            to_number: Recipient phone number
            method: 'sms' or 'whatsapp'
            
        Returns:
            Dict with success status and message details
        """
        try:
            # Format the alert message
            symbol = position_data.get('symbol', 'Unknown')
            ticket = position_data.get('ticket', 'Unknown')
            profit = position_data.get('profit', 0)
            volume = position_data.get('volume', 0)
            order_type = position_data.get('type', 'Unknown')
            take_profit = position_data.get('take_profit', 0)
            current_price = position_data.get('current_price', 0)
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            message = f"""🎯 TAKE PROFIT HIT!

Symbol: {symbol}
Ticket: {ticket}
Type: {order_type}
Volume: {volume}
Profit: ${profit:.2f}
TP Level: {take_profit}
Current Price: {current_price}

Time: {timestamp}

MT5 Trader Alert"""
            
            if method.lower() == "whatsapp":
                return self.send_whatsapp(to_number, message)
            else:
                return self.send_sms(to_number, message)
                
        except Exception as e:
            logger.error(f"Failed to send take profit alert: {e}")
            return {"success": False, "error": str(e)}
    
    def send_stop_loss_alert(self, position_data: Dict[str, Any], to_number: str, method: str = "sms") -> Dict[str, Any]:
        """
        Send stop loss alert notification
        
        Args:
            position_data: Dictionary containing position information
            to_number: Recipient phone number
            method: 'sms' or 'whatsapp'
            
        Returns:
            Dict with success status and message details
        """
        try:
            symbol = position_data.get('symbol', 'Unknown')
            ticket = position_data.get('ticket', 'Unknown')
            profit = position_data.get('profit', 0)
            volume = position_data.get('volume', 0)
            order_type = position_data.get('type', 'Unknown')
            stop_loss = position_data.get('stop_loss', 0)
            current_price = position_data.get('current_price', 0)
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            message = f"""🛑 STOP LOSS HIT!

Symbol: {symbol}
Ticket: {ticket}
Type: {order_type}
Volume: {volume}
Loss: ${profit:.2f}
SL Level: {stop_loss}
Current Price: {current_price}

Time: {timestamp}

MT5 Trader Alert"""
            
            if method.lower() == "whatsapp":
                return self.send_whatsapp(to_number, message)
            else:
                return self.send_sms(to_number, message)
                
        except Exception as e:
            logger.error(f"Failed to send stop loss alert: {e}")
            return {"success": False, "error": str(e)}
    
    def send_position_opened_alert(self, position_data: Dict[str, Any], to_number: str, method: str = "sms") -> Dict[str, Any]:
        """
        Send position opened alert notification
        
        Args:
            position_data: Dictionary containing position information
            to_number: Recipient phone number
            method: 'sms' or 'whatsapp'
            
        Returns:
            Dict with success status and message details
        """
        try:
            symbol = position_data.get('symbol', 'Unknown')
            ticket = position_data.get('ticket', 'Unknown')
            volume = position_data.get('volume', 0)
            order_type = position_data.get('type', 'Unknown')
            open_price = position_data.get('price', 0)
            stop_loss = position_data.get('sl', 0)
            take_profit = position_data.get('tp', 0)
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            message = f"""📈 POSITION OPENED!

Symbol: {symbol}
Ticket: {ticket}
Type: {order_type}
Volume: {volume}
Entry Price: {open_price}
Stop Loss: {stop_loss if stop_loss > 0 else 'None'}
Take Profit: {take_profit if take_profit > 0 else 'None'}

Time: {timestamp}

MT5 Trader Alert"""
            
            if method.lower() == "whatsapp":
                return self.send_whatsapp(to_number, message)
            else:
                return self.send_sms(to_number, message)
                
        except Exception as e:
            logger.error(f"Failed to send position opened alert: {e}")
            return {"success": False, "error": str(e)}
    
    def send_custom_alert(self, message: str, to_number: str, method: str = "sms") -> Dict[str, Any]:
        """
        Send custom alert message
        
        Args:
            message: Custom message content
            to_number: Recipient phone number
            method: 'sms' or 'whatsapp'
            
        Returns:
            Dict with success status and message details
        """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        formatted_message = f"{message}\n\nTime: {timestamp}\nMT5 Trader Alert"
        
        if method.lower() == "whatsapp":
            return self.send_whatsapp(to_number, formatted_message)
        else:
            return self.send_sms(to_number, formatted_message)