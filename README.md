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

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [User Guide](#-user-guide)
- [Twilio Alerts Setup](#-twilio-alerts-setup)
- [Developer Guide](#-developer-guide)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## ✨ Features

### Core Trading Features
- **Visual Strategy Building**: Node-based drag-and-drop interface for creating trading strategies without coding
- **MT5 Integration**: Direct connection to MetaTrader 5 for real-time trading and data access
- **Historical Backtesting**: Import and test strategies against historical data from MT5 or CSV files
- **Risk Management**: Built-in pip-based loss calculations and position management tools
- **Real-time Trading**: Execute trades with customizable parameters and monitor positions

### Advanced Features
- **Quick Symbols**: One-click access to frequently used trading symbols
- **Node Editor**: Triggers, indicators (MA, RSI), conditional logic, and trade execution nodes
- **Historical Data Import**: Support for 8 timeframes with data persistence
- **Symbol Input**: Autocomplete and MT5 symbol fetching
- **Account Monitoring**: Real-time account and position management
- **Trailing Stops**: Advanced position management with risk warnings
- **Backtest Mode**: Visual indicators and strategy testing

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
│  │ Node Editor │  │ Trade Dialog│  │ Quick Symbols│        │
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
│   ├── quick-symbols.js        # Quick symbol buttons component
│   ├── overtrade-control.js    # Risk management controls
│   └── styles.css              # Application styling and themes
│
├── Backend Files (Electron + Python)
│   ├── main.js                 # Electron main process and window management
│   ├── preload.js              # Secure API bridge between renderer and main
│   ├── mt5-bridge.js           # WebSocket client for Python communication
│   ├── mt5_bridge.py           # Python bridge for MT5 API integration
│   └── twilio_alerts.py        # Twilio notification service
│
├── Configuration Files
│   ├── package.json            # Node.js dependencies and build scripts
│   ├── requirements.txt        # Python dependencies
│   ├── config.js               # Application configuration management
│   ├── sample_history.csv      # Example CSV format for data import
│   └── twilio_config.json      # Twilio settings (auto-generated)
│
├── Documentation
│   └── README.md               # This comprehensive guide
│
└── Build & Distribution
    ├── dist/                   # Build output directory (generated)
    └── node_modules/           # Node.js dependencies (generated)
```

## 📖 User Guide

### Getting Started with Quick Symbols

Quick symbols provide one-click access to your favorite trading symbols throughout the application.

#### Setting Up Quick Symbols

1. **Open Settings**: Click the **⚙ Settings** button in the top toolbar
2. **Navigate to Quick Symbols**: Click the "Quick Symbols" tab
3. **Add Symbols**: 
   - Type a symbol name (e.g., `XAUUSD`) in the search box
   - Press Enter or click **Add** to add the symbol
   - Use autocomplete when connected to MT5 for symbol suggestions
4. **Remove Symbols**: Click the **×** button next to any symbol
5. **Reset**: Click **Reset to Defaults** to restore default symbols
6. **Save**: Click **Close** to save your changes

#### Using Quick Symbols

Quick symbol buttons appear in:
- **Trade Dialog**: Below the symbol input field
- **Node Properties**: When editing trade nodes
- **Settings**: Enhanced symbol search with autocomplete

#### Common Symbols to Add

**Forex Majors**: EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD  
**Forex Crosses**: EURJPY, EURGBP, GBPJPY, AUDJPY, EURAUD  
**Metals**: XAUUSD (Gold), XAGUSD (Silver)  
**Indices**: US30 (Dow Jones), NAS100 (Nasdaq), SPX500 (S&P 500)  
**Crypto**: BTCUSD, ETHUSD, XRPUSD (if supported by broker)

### Trading Features

#### Node-Based Strategy Builder
1. **Create Nodes**: Drag and drop from the node palette
2. **Connect Nodes**: Link outputs to inputs to create strategy flow
3. **Configure Parameters**: Double-click nodes to set parameters
4. **Test Nodes**: Use test buttons to verify functionality before running
5. **Test Strategy**: Use backtest mode with historical data

#### Available Node Types
- **Trigger Nodes**: Start strategy execution
- **Conditional Check**: Test market conditions (price, percentage change)
- **Logic Gates**: AND/OR gates for complex conditions
- **Trade Nodes**: Open, close, and modify positions
- **Twilio Alert**: Send SMS/WhatsApp notifications

#### Historical Data Import
1. **From MT5**: Connect to MT5 and import data for 8 timeframes
2. **From CSV**: Import custom historical data files
3. **Backtest Mode**: Test strategies against historical data
4. **Data Persistence**: Historical data is saved locally

#### Risk Management
1. **Position Sizing**: Calculate position sizes based on risk percentage
2. **Stop Loss/Take Profit**: Set automatic exit levels
3. **Trailing Stops**: Dynamic stop loss adjustment
4. **Overtrade Control**: Monitor and limit trading frequency

### Test Buttons Guide

Each trading node includes test functionality to verify behavior before running your strategy:

#### 🧪 Test Condition (Conditional Check Node)
- Tests if condition evaluates to TRUE or FALSE
- Shows current price and comparison
- Indicates if trigger will continue or stop

#### 🧪 Test Logic (AND/OR Gate Nodes)
- Shows connected inputs and gate behavior
- Displays truth table for understanding
- Helps debug multi-condition logic

#### 🧪 Test Close (Close Position Node)
- Tests position closure functionality
- Works with specific tickets or "close all"
- Shows detailed results for each position

#### 🧪 Test Modify (Modify Position Node)
- Tests SL/TP modification with validation
- Checks position type compatibility
- Shows before/after comparison

#### 📱 Test Alert (Twilio Alert Node)
- Sends test notification with current parameters
- Includes account/position info if enabled
- Verifies Twilio configuration

## 📱 Twilio Alerts Setup

### Prerequisites
1. **Twilio Account**: Sign up at [twilio.com](https://www.twilio.com)
2. **Phone Number**: Purchase a Twilio phone number
3. **Credentials**: Get Account SID and Auth Token from Twilio Console

### Quick Setup

1. **Install Dependencies** (already included):
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure in Application**:
   - Open MT5 Trader → Settings → Twilio Alerts tab
   - Enter your Twilio credentials:
     - Account SID
     - Auth Token  
     - From Number (your Twilio phone number)
   - Set recipient number and notification method
   - Choose which events trigger alerts
   - Test configuration with "Send Test Message"
   - Save settings

3. **Start Trading**: Alerts will be sent automatically when:
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

#### Custom Strategy Alert
```
Strategy signal triggered for EURUSD

Account Info:
Balance: $10,000.00
Equity: $10,250.50
Profit: $250.50

Time: 2024-10-10 14:30:25
MT5 Trader Alert
```

### Cost Considerations
- **SMS**: ~$0.0075 per message
- **WhatsApp**: ~$0.005 per message  
- **Free Trial**: Twilio provides free credits for testing
- **Typical Usage**: 10-20 alerts per day = $0.05-$0.15 daily cost

## 👨‍💻 Developer Guide

### Unified Persistence System

Both Twilio settings and Quick Symbols use the same localStorage-based persistence system through `AppConfig`:

```javascript
// Quick Symbols
AppConfig.addQuickSymbol('XAUUSD');
AppConfig.removeQuickSymbol('XAUUSD');
const symbols = AppConfig.getQuickSymbols();

// Twilio Settings
AppConfig.updateTwilioSettings({
  enabled: true,
  accountSid: 'AC...',
  authToken: '...',
  fromNumber: '+1234567890'
});
const settings = AppConfig.getTwilioSettings();
```

### Adding Quick Symbols to New Components

#### Method 1: With SymbolInput Component
```javascript
const symbolInput = new SymbolInput(inputContainer, options);
QuickSymbols.createForSymbolInput(quickSymbolsContainer, symbolInput);
```

#### Method 2: With Custom Callback
```javascript
QuickSymbols.create(quickSymbolsContainer, (symbol) => {
  console.log('Selected:', symbol);
  myInput.value = symbol;
});
```

### Module Architecture

#### File Dependencies
```
index.html
    │
    ├─▶ config.js (loaded first)
    │       └─▶ Defines AppConfig with unified persistence
    │
    ├─▶ quick-symbols.js (loaded second)
    │       └─▶ Uses AppConfig for symbol management
    │
    ├─▶ symbol-input.js
    ├─▶ node-editor.js
    └─▶ renderer.js (loaded last)
            └─▶ Implements UI logic and Twilio integration
```

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

2. **Add Execution Logic**:
```javascript
case 'my-custom-node':
  // Your node logic here
  break;
```

3. **Add UI Components** in `renderer.js` and `index.html`

4. **Add Test Functionality** (recommended)

### Python Bridge Development

#### Adding New MT5 Functions
1. Add function to `mt5_bridge.py`
2. Update WebSocket message handling
3. Add corresponding JavaScript client code in `mt5-bridge.js`
4. Update UI components as needed

#### Twilio Integration
The Twilio system is fully integrated with automatic position monitoring:

```python
# Position monitoring runs every 5 seconds
async def monitor_positions():
    current_positions = mt5.positions_get()
    # Compare with previous positions
    # Detect TP/SL hits
    # Send appropriate alerts
```

## 📚 API Reference

### AppConfig Object (Unified Configuration)

#### Quick Symbols Methods
```javascript
AppConfig.getQuickSymbols()           // Get symbol array
AppConfig.addQuickSymbol(symbol)      // Add symbol
AppConfig.removeQuickSymbol(symbol)   // Remove symbol
```

#### Twilio Settings Methods
```javascript
AppConfig.getTwilioSettings()         // Get Twilio config
AppConfig.updateTwilioSettings(data)  // Update Twilio config
```

### QuickSymbols Class

#### Static Methods
```javascript
QuickSymbols.create(container, callback, options)
QuickSymbols.createForSymbolInput(container, symbolInput)
QuickSymbols.update(container)
```

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

#### Test Button vs Strategy Execution
| Aspect | Test Button | Strategy Execution |
|--------|-------------|-------------------|
| Requires trigger | ❌ No | ✅ Yes |
| Requires connection | ❌ No | ✅ Yes |
| Checks overtrade | Varies | ✅ Yes |
| Shows detailed feedback | ✅ Yes | ⚠️ Limited |

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

#### WhatsApp Not Working
**Setup Required**:
1. Complete WhatsApp sandbox setup in Twilio Console
2. Send activation message from your phone
3. Use correct number format

### Quick Symbols Issues

#### Symbols Not Appearing
- Check MT5 connection for autocomplete
- Verify configuration in Settings
- Clear browser data if needed

#### Symbol Input Not Working
```javascript
// Debug and fix in console
debugSymbolInput();
fixSymbolInput();
```

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

### Settings Save Issues

#### "No handler registered" Error
**Solution**: Complete application restart required
1. Close all MT5 Trader windows
2. End all processes in Task Manager
3. Restart application fresh
4. Test with console commands

#### Unified Persistence Benefits
- No backend dependency for saving
- Immediate localStorage persistence
- Graceful degradation when offline
- Consistent API across features

### Performance Issues

#### Memory Usage
- Historical data stored in localStorage
- Complex strategies may impact rendering
- Monitor WebSocket connection stability

#### Storage Management
```javascript
// Check localStorage usage
console.log(JSON.stringify(localStorage).length + ' characters');

// Clear specific data if needed
localStorage.removeItem('historicalData');
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
- Test all quick symbol functionality
- Verify MT5 integration
- Test node editor operations
- Validate historical data import
- Test Twilio alerts (SMS and WhatsApp)
- Verify settings persistence

#### Test Files Available
- Various HTML test files for specific components
- Console debug functions for troubleshooting
- Test buttons in node properties panels

### Pull Request Guidelines

1. **Feature Branch**: Create from `main` branch
2. **Clear Description**: Explain what the PR does and why
3. **Test Coverage**: Include relevant tests
4. **Documentation**: Update README if needed
5. **Code Review**: Address feedback promptly

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
console.log(AppConfig.getQuickSymbols())
console.log(AppConfig.getTwilioSettings())
```

---

**Built with ❤️ for the trading community**

*This application provides a comprehensive trading platform with visual strategy building, real-time notifications, and advanced risk management. The unified persistence system ensures your settings are always saved, while the extensive testing features help you build reliable trading strategies.*