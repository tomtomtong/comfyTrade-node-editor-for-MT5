# MT5 Trading Strategy Executor

A comprehensive Electron desktop application that provides a visual trading platform for MetaTrader 5, featuring a node-based strategy builder, historical data backtesting, advanced risk management tools, and real-time Twilio notifications.

## 🚀 Quick Start

### Prerequisites
- **Node.js** 16+ and npm
- **Python** 3.8+ with pip
- **MetaTrader 5** terminal installed and running
- **Twilio Account** (optional, for SMS/WhatsApp alerts)

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd mt5-trader
   npm install
   pip install -r requirements.txt
   ```

2. **Start the application:**
   ```bash
   npm start          # Launch application
   npm run dev        # Launch with DevTools enabled
   ```

3. **Build for distribution:**
   ```bash
   npm run build      # Build for current platform
   npm run build:win  # Build for Windows
   npm run dist       # Build without publishing
   ```

## ✨ Features

### Core Trading Features
- **Visual Strategy Building**: Node-based drag-and-drop interface for creating trading strategies without coding
- **MT5 Integration**: Direct connection to MetaTrader 5 for real-time trading and data access
- **Historical Backtesting**: Import and test strategies against historical data from MT5 or CSV files
- **Risk Management**: Built-in pip-based loss calculations and position management tools
- **Real-time Trading**: Execute trades with customizable parameters and monitor positions

### Advanced Features
- **Multi-Flow Management**: Run multiple trading strategies simultaneously with independent control
- **Simulator Mode**: Practice trading with real market data without financial risk

- **Node Editor**: Triggers, indicators (MA, RSI), conditional logic, and trade execution nodes
- **Historical Data Import**: Support for 8 timeframes with data persistence
- **Symbol Input**: Autocomplete and MT5 symbol fetching
- **Account Monitoring**: Real-time account and position management
- **Trailing Stops**: Advanced position management with risk warnings
- **Backtest Mode**: Visual indicators and strategy testing
- **TradingView Integration**: Automatically opens TradingView charts when positions are opened

### Notification Features
- **Twilio Alerts**: SMS and WhatsApp notifications for trading events
- **Real-time Monitoring**: Automatic position monitoring every 5 seconds
- **Smart Detection**: Intelligent take profit and stop loss hit detection
- **Custom Alerts**: Send custom notifications at any point in your strategy
- **Multiple Methods**: Support for both SMS and WhatsApp delivery

## 🏗 Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Frontend                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Node Editor │  │ Trade Dialog│  │             │        │
│  │             │  │             │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────┼───────────────────────────────────────┘
                      │ WebSocket (port 8765)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Python Bridge                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ MT5 API     │  │ WebSocket   │  │ Twilio      │        │
│  │ Integration │  │ Server      │  │ Alerts      │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────┼───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 MetaTrader 5 Terminal                       │
└─────────────────────────────────────────────────────────────┘
```

### Communication Flow
```
Electron UI ↔ WebSocket (port 8765) ↔ Python Bridge ↔ MT5 API
                                    ↕
                                Twilio API ↔ SMS/WhatsApp
```

## 🛠 Technology Stack

### Frontend Stack
- **Electron**: ^28.0.0 - Desktop application framework
- **HTML/CSS/JavaScript**: UI implementation
- **Canvas API**: Node editor rendering and interactions
- **WebSocket**: Real-time communication with Python bridge
- **LocalStorage**: Unified persistence system for all settings

### Backend Stack
- **Node.js**: Electron main process and IPC handling
- **Python 3.8+**: MT5 integration bridge
- **MetaTrader5 Python API**: >=5.0.45 - Direct MT5 terminal communication
- **WebSockets**: >=12.0 - Async communication between Electron and Python
- **Twilio**: >=8.10.0 - SMS and WhatsApp notifications

### Key Dependencies
- **ws**: ^8.18.3 (WebSocket client)
- **electron-builder**: ^24.13.3 (Application packaging)
- **twilio**: ^8.10.0 (Notification service)

## 📁 Project Structure

```
mt5-trader/
├── Frontend Files (UI)
│   ├── index.html              # Main UI structure and layout
│   ├── renderer.js             # Main application logic and UI controllers
│   ├── node-editor.js          # Node-based strategy builder engine
│   ├── history-import.js       # Historical data import functionality
│   ├── symbol-input.js         # Symbol input with autocomplete

│   ├── overtrade-control.js    # Risk management controls
│   └── styles.css              # Application styling and themes
│
├── Backend Files (Electron + Python)
│   ├── main.js                 # Electron main process and window management
│   ├── preload.js              # Secure API bridge between renderer and main
│   ├── mt5-bridge.js           # WebSocket client for Python communication
│   ├── mt5_bridge.py           # Python bridge for MT5 API integration
│   └── simulator.py            # Simulator mode for risk-free practice
│
├── Configuration Files
│   ├── package.json            # Node.js dependencies and build scripts
│   ├── requirements.txt        # Python dependencies
│   ├── config.js               # Application configuration management
│   ├── sample_history.csv      # Example CSV format for data import
│   └── twilio_config.json      # Twilio settings (auto-generated)
│
└── Build & Distribution
    ├── dist/                   # Build output directory (generated)
    └── node_modules/           # Node.js dependencies (generated)
```

## 📖 User Guide

### Multi-Flow Management

Run multiple trading strategies simultaneously with independent control over each flow.

#### Starting Multiple Flows

1. **Build Your Strategy**: Add trigger nodes and connect them to your trading logic
2. **Run First Strategy**: Click "▶ Run Strategy" → "Run Periodically" → Set interval
3. **Create Second Strategy**: Modify nodes or create new strategy
4. **Run Second Strategy**: Click "▶ Run Strategy" again with different interval
5. **Both flows run in parallel**

#### Managing Flows

1. **Open Flow Manager**: Click "📊 Manage Flows (X)" button
2. **View Flow Details**: See runtime, intervals, trigger information
3. **Stop Individual Flows**: Click "Stop" next to any flow
4. **Stop All Flows**: Use "Stop All Flows" button

#### Common Use Cases
- **Multi-Timeframe**: 1-minute scalping + 1-hour swing trades
- **Multi-Symbol**: EURUSD strategy + GBPUSD strategy
- **Strategy Comparison**: Test aggressive vs conservative approaches
- **Diversified Trading**: Trend following + mean reversion + breakout

### Simulator Mode - Practice Without Risk

Practice trading strategies using real MT5 market data without executing actual trades.

#### 🚀 Quick Start Guide

**Get Started in 3 Steps:**

1. **Connect to MT5**
   - Click "Connect MT5" button
   - Enter your MT5 credentials (or leave blank for default)
   - Wait for connection confirmation

2. **Enable Simulator Mode**
   - Click "⚙ Settings" button
   - In "General" tab, find "🎮 Simulator Mode"
   - Change dropdown to "Simulator Mode (Practice)"
   - See "🎮 SIMULATOR MODE" badge appear

3. **Start Trading!**
   - Click "New Trade" button
   - Enter symbol, volume, SL/TP
   - Click "Execute Trade"
   - Position appears with "SIM" badge

#### Simulator Features
- ✅ Real market data from MT5
- ✅ Local position storage in `simulator_positions.json`
- ✅ Real-time P&L calculation
- ✅ Auto TP/SL execution
- ✅ Trade history tracking
- ✅ Risk-free practice environment

#### 📊 Monitor Your Performance

Go to **Settings → General → Simulator Mode** to see:
- Balance & Equity
- Open & Closed Positions
- Total Profit/Loss

#### 🔄 Reset Anytime

Want to start fresh? **Settings → General → Simulator Mode → Reset Simulator**

#### 🎯 Practice Tips
- **Practice strategies** before going live
- **Test different symbols** without risk
- **Learn position management** safely
- **Track your progress** over time

**⚠️ Remember**: Simulator positions are NOT real trades. Switch back to "Real Trading" when ready.


4. **Remove Symbols**: Click × button next to any symbol
5. **Save Changes**: Click Close to save

#### Common Symbols to Add
- **Forex Majors**: EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD
- **Metals**: XAUUSD (Gold), XAGUSD (Silver)
- **Indices**: US30 (Dow Jones), NAS100 (Nasdaq), SPX500 (S&P 500)

### Node-Based Strategy Builder

#### Available Node Types
- **Trigger Nodes**: Start strategy execution
- **Conditional Check**: Test market conditions (price, percentage change)
- **Logic Gates**: AND/OR gates for complex conditions
- **Trade Nodes**: Open, close, and modify positions
- **Twilio Alert**: Send SMS/WhatsApp notifications
- **yFinance Data**: Fetch real-time stock data from Yahoo Finance (price, volume, company info, daily change)
- **Trigger Output**: Convert string data to trigger signals with customizable conditions
- **String Input**: Provide custom text messages for alerts

#### Test Buttons Guide
Each trading node includes test functionality:
- **🧪 Test Condition**: Tests if condition evaluates to TRUE or FALSE
- **🧪 Test Logic**: Shows connected inputs and gate behavior
- **🧪 Test Close**: Tests position closure functionality
- **🧪 Test Modify**: Tests SL/TP modification with validation
- **📱 Test Alert**: Sends test notification with current parameters

### TradingView Integration

Automatically opens TradingView charts when you open positions for instant visual analysis.

#### How It Works
- **Manual Trades**: TradingView opens automatically when executing trades
- **Node-based Trades**: Charts open after successful trade execution
- **Symbol Mapping**: Converts MT5 symbols to TradingView format
- **Trade Confirmation**: Manual trades require confirmation after chart review

#### Configuration
1. **Open Settings**: Click ⚙ Settings → General tab
2. **Toggle Feature**: Set "Open TradingView on Position Open" to Enabled/Disabled
3. **Save Settings**: Click Save Settings to apply changes

## 📱 Twilio Alerts Setup

### Prerequisites
1. **Twilio Account**: Sign up at [twilio.com](https://www.twilio.com)
2. **Phone Number**: Purchase a Twilio phone number
3. **Credentials**: Get Account SID and Auth Token from Twilio Console

### Quick Setup

1. **Configure in Application**:
   - Open Settings → Twilio Alerts tab
   - Enter your Twilio credentials (Account SID, Auth Token, From Number)
   - Set recipient number and notification method
   - Choose which events trigger alerts
   - Test configuration with "Send Test Message"
   - Save settings

2. **Start Trading**: Alerts will be sent automatically when:
   - Take Profit levels are hit
   - Stop Loss levels are hit
   - Positions are opened/closed (if enabled)
   - Custom alerts from Twilio Alert nodes

### Alert Message Examples

#### Take Profit Alert
```
🎯 TAKE PROFIT HIT!

Symbol: EURUSD
Ticket: 123456789
Type: BUY
Volume: 0.1
Profit: $25.50
TP Level: 1.1250
Current Price: 1.1251

Time: 2024-10-10 14:30:25
MT5 Trader Alert
```

### Cost Considerations
- **SMS**: ~$0.0075 per message
- **WhatsApp**: ~$0.005 per message
- **Free Trial**: Twilio provides free credits for testing
- **Typical Usage**: 10-20 alerts per day = $0.05-$0.15 daily cost

## 👨‍💻 Developer Guide

### Persistence System

Twilio settings use localStorage-based persistence through `AppConfig`:

```javascript
// Twilio Settings
AppConfig.updateTwilioSettings({
  enabled: true,
  accountSid: 'AC...',
  authToken: '...',
  fromNumber: '+1234567890'
});
const settings = AppConfig.getTwilioSettings();
```

### Data Source Nodes

#### yFinance Data Node
Fetches real-time financial data from Yahoo Finance API.

**Features:**
- **Multiple Data Types**: Current price, company info, volume, daily change percentage
- **Dual Outputs**: String output (data value) + Trigger output (for flow control)
- **Flexible Periods**: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y
- **Various Intervals**: 1m, 2m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo

**Usage Example:**
1. Add yFinance Data node
2. Set symbol (e.g., "AAPL", "TSLA", "MSFT")
3. Choose data type (price, info, volume, change)
4. Connect string output to Twilio Alert for notifications
5. Connect trigger output to continue strategy flow

#### Trigger Output Node
Converts string data into trigger signals with conditional logic.

**Conditions:**
- **Always**: Always triggers regardless of input
- **Not Empty**: Triggers when input string is not empty
- **Contains**: Triggers when input contains specific text
- **Numeric Greater Than**: Triggers when numeric input exceeds threshold

**Usage Example:**
1. Connect yFinance Data (string output) to Trigger Output (string input)
2. Set condition (e.g., "Numeric Greater Than" with threshold "100")
3. Connect Trigger Output to trade execution nodes
4. Strategy triggers trades only when stock price > $100

### Adding New Node Types

1. **Define Node Configuration** in `node-editor.js`:
```javascript
{
  type: 'my-custom-node',
  inputs: 1,
  outputs: 1,
  params: {
    myParam: 'default value'
  }
}
```

2. **Add Execution Logic** and **UI Components**

### Debug Functions

#### Console Commands for Testing
```javascript
// Test open position functionality
window.testOpenPositionNode()

// Test modify position with specific parameters
window.testModifyPositionNode(ticketId, stopLoss, takeProfit)

// Debug symbol input issues
window.debugSymbolInput()
window.fixSymbolInput()

// Debug strategy execution
window.debugStrategy()
```

## 🔧 Troubleshooting

### Strategy Execution Issues

#### Strategy Not Executing Trades
**Quick Diagnosis**: Run `window.debugStrategy()` in console

**Common Issues**:
1. **Nodes Not Connected**: Ensure trigger connects to trade nodes
2. **Trigger Disabled**: Check trigger node is enabled
3. **Overtrade Control**: Check limits in Settings
4. **MT5 Connection**: Verify MT5 is connected

### Multi-Flow Issues

#### Flow Not Starting?
- Check: Do you have trigger nodes?
- Check: Is MT5 connected?
- Check: Any errors in console log?

#### Can't Edit Nodes?
- Note: Nodes are locked while flows run
- Solution: Stop flows to edit nodes

### Simulator Issues

#### Positions Not Updating
- Ensure MT5 is connected
- Check that symbols are available in MT5
- Refresh positions manually

#### Can't Switch Modes
- Ensure you're connected to MT5
- Check console for errors
- Restart the application if needed

### Twilio Issues

#### Settings Don't Persist
**Solution**: Settings now use unified localStorage system
- Check `twilio_config.json` exists
- Verify localStorage permissions
- Use "Save Settings" button

#### Alerts Not Received
**Common Fixes**:
1. Check Twilio configuration in Settings
2. Verify phone number format (+1234567890)
3. Ensure positions have TP/SL levels set
4. Check Twilio account balance

### Python Bridge Issues

#### Connection Problems
1. **Check Dependencies**: `pip install -r requirements.txt`
2. **Verify MT5**: Ensure MetaTrader 5 is installed
3. **Port Conflicts**: Check port 8765 availability
4. **Firewall**: Allow WebSocket connections

#### Manual Testing
```bash
# Run Python bridge manually
python mt5_bridge.py

# Test MT5 connection
python -c "import MetaTrader5 as mt5; print(mt5.initialize())"
```

## 🤝 Contributing

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone <your-fork-url>
   cd mt5-trader
   ```

2. **Install Dependencies**
   ```bash
   npm install
   pip install -r requirements.txt
   ```

3. **Development Mode**
   ```bash
   npm run dev  # Launches with DevTools
   ```

### Code Style Guidelines

- **JavaScript**: ES6+ features, consistent indentation
- **Python**: PEP 8 guidelines
- **HTML/CSS**: Semantic markup, consistent class naming
- **File Naming**: Kebab-case for JS files, snake_case for Python

### Testing Checklist

#### Manual Testing

- Verify MT5 integration
- Test node editor operations
- Validate historical data import
- Test Twilio alerts (SMS and WhatsApp)
- Verify settings persistence
- Test multi-flow management
- Test simulator mode

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

### Getting Help

For issues, questions, or contributions:
1. Check this comprehensive documentation
2. Use console debug functions for troubleshooting
3. Search through existing issues
4. Create a new issue with detailed information
5. Include system information and error logs

### Debug Information to Include

When reporting issues, include:
- Console output from relevant debug functions
- Error messages from browser console
- MT5 connection status
- Twilio configuration status (without credentials)
- Steps to reproduce the issue

### Common Debug Commands

```javascript
// Strategy execution issues
window.debugStrategy()

// Position testing
window.testOpenPositionNode()
window.testModifyPositionNode()

// Symbol input issues  
window.debugSymbolInput()

// Configuration check
console.log(AppConfig.getTwilioSettings())
```

---

**Built with ❤️ for the trading community**

*This application provides a comprehensive trading platform with visual strategy building, real-time notifications, advanced risk management, multi-flow execution, and risk-free simulator mode. The unified persistence system ensures your settings are always saved, while extensive testing features help you build reliable trading strategies.*