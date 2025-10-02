# MT5 Bridge Setup Guide

## Prerequisites

1. **MetaTrader 5** - Install from https://www.metatrader5.com/
2. **Python 3.8+** - Install from https://www.python.org/
3. **Node.js** - Already installed (for Electron)

## Installation Steps

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- `MetaTrader5` - Python library for MT5 integration
- `websockets` - WebSocket server for communication

### 2. Install Node.js Dependencies

```bash
npm install
```

This installs the `ws` WebSocket client library.

### 3. Configure MT5

Make sure MetaTrader 5 is installed in one of these locations:
- `C:\Program Files\MetaTrader 5\terminal64.exe`
- `C:\Program Files (x86)\MetaTrader 5\terminal64.exe`

Or the app will assume MT5 is already running.

## How It Works

1. **Electron App Starts** → Automatically launches MT5 (if not running)
2. **Python Bridge Starts** → `mt5_bridge.py` connects to MT5 and starts WebSocket server
3. **WebSocket Connection** → Electron connects to Python bridge via WebSocket (port 8765)
4. **Communication Flow**:
   - Electron → WebSocket → Python → MT5
   - MT5 → Python → WebSocket → Electron

## Usage

### Start the Application

```bash
npm start
```

The app will:
1. Launch MT5 automatically
2. Start the Python bridge
3. Connect everything together

### Connect to MT5

In the app, use the connect form with your MT5 credentials:
- Login: Your MT5 account number
- Password: Your MT5 password
- Server: Your broker's server name

Or leave empty to connect to the default/demo account.

## Troubleshooting

### Python Bridge Not Starting
- Check Python is in your PATH: `python --version`
- Install dependencies: `pip install -r requirements.txt`

### MT5 Not Launching
- Verify MT5 is installed
- Check the installation path in `mt5-bridge.js`
- Or manually start MT5 before running the app

### Connection Issues
- Ensure MT5 is running and logged in
- Check firewall settings for localhost:8765
- Look at console logs for error messages

## API Methods Available

- `getAccountInfo()` - Get account balance, equity, margin
- `getPositions()` - Get all open positions
- `executeOrder(symbol, type, volume, sl, tp)` - Place a trade
- `closePosition(ticket)` - Close a position
- `getMarketData(symbol)` - Get current price data

## Security Notes

- The WebSocket server runs on localhost only
- Never commit credentials to version control
- Use environment variables for sensitive data in production
