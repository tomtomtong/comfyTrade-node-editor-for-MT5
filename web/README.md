# MT5 Strategy Builder - Web Demo

A web-based demo version of the MT5 Trading Strategy Builder that runs on Railway.

## Features

- 🎨 Visual node-based strategy builder
- 📊 Simulated trading with demo market data
- 💰 Paper trading without real money
- 📈 Real-time price updates (simulated)
- 💾 Save/Load strategy graphs

## Deploy to Railway

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/mt5-trader)

### Manual Deploy

1. Fork this repository
2. Create a new project on [Railway](https://railway.app)
3. Connect your GitHub repository
4. Railway will auto-detect and deploy

### Environment Variables (Optional)

No environment variables required for the demo version.

## Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open http://localhost:3000
```

## How to Use

1. Click "Connect Demo" to start the simulator
2. Add nodes from the left panel by clicking them
3. Connect nodes by dragging from output sockets to input sockets
4. Configure node parameters in the right panel
5. Use "New Trade" to execute simulated trades
6. Save your strategies with the "Save" button

## Node Types

### Triggers
- **Trigger**: Starting point for strategy execution

### Data
- **String Input**: Custom text input
- **String Output**: Display text output
- **MT5 Data**: Market data from MT5 (simulated)

### Indicators
- **Moving Average**: Calculate MA
- **RSI**: Relative Strength Index

### Logic
- **Conditional Check**: Price conditions
- **AND Gate**: Both inputs must be true
- **OR Gate**: Either input can be true

### Trading
- **Open Position**: Execute buy/sell orders
- **Close Position**: Close existing positions
- **Modify Position**: Change SL/TP

### Control
- **End Strategy**: Stop strategy execution

## Demo Limitations

This is a demo version with simulated data:
- No real MT5 connection
- Simulated market prices
- Paper trading only
- Limited symbol selection

For full MT5 integration, use the desktop Electron version.

## Tech Stack

- Node.js + Express
- Vanilla JavaScript
- HTML5 Canvas for node editor
- No database (in-memory storage)

## License

MIT
