# MT5 Trading Strategy Executor

A comprehensive Electron desktop application that provides a visual trading platform for MetaTrader 5, featuring a node-based strategy builder, historical data backtesting, and advanced risk management tools.

## 🚀 Quick Start

### Prerequisites
- **Node.js** 16+ and npm
- **Python** 3.8+ with pip
- **MetaTrader 5** terminal installed and running
- **uv** Python package manager (for MCP servers)

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
│  │ MT5 API     │  │ WebSocket   │  │ Data        │        │
│  │ Integration │  │ Server      │  │ Processing  │        │
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
```

## 🛠 Technology Stack

### Frontend Stack
- **Electron**: ^28.0.0 - Desktop application framework
- **HTML/CSS/JavaScript**: UI implementation
- **Canvas API**: Node editor rendering and interactions
- **WebSocket**: Real-time communication with Python bridge
- **LocalStorage**: Data persistence for historical data and settings

### Backend Stack
- **Node.js**: Electron main process and IPC handling
- **Python 3.8+**: MT5 integration bridge
- **MetaTrader5 Python API**: >=5.0.45 - Direct MT5 terminal communication
- **WebSockets**: >=12.0 - Async communication between Electron and Python

### Key Dependencies
- **ws**: ^8.18.3 (WebSocket client)
- **electron-builder**: ^24.13.3 (Application packaging)

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
│   └── mt5_bridge.py           # Python bridge for MT5 API integration
│
├── Configuration Files
│   ├── package.json            # Node.js dependencies and build scripts
│   ├── requirements.txt        # Python dependencies
│   ├── config.js               # Application configuration management
│   └── sample_history.csv      # Example CSV format for data import
│
├── Documentation
│   ├── README.md               # This comprehensive guide
│   ├── ARCHITECTURE_DIAGRAM.md # System architecture details
│   ├── IMPLEMENTATION_SUMMARY.md # Implementation overview
│   ├── QUICK_SYMBOLS_GUIDE.md  # Quick symbols feature guide
│   ├── QUICK_SYMBOLS_API.md    # API reference for quick symbols
│   ├── CONFIRMATION_MODAL_FIX.md # UI improvement documentation
│   └── SYMBOL_INPUT_FIX.md     # Bug fix documentation
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
2. **Manage Symbols**: 
   - **Add**: Type a symbol name (e.g., `XAUUSD`) and click **Add**
   - **Remove**: Click the **×** button next to any symbol
   - **Reset**: Click **Reset to Defaults** to restore default symbols
3. **Save**: Click **Close** to save your changes

#### Using Quick Symbols

Quick symbol buttons appear in:
- **Trade Dialog**: Below the symbol input field
- **Node Properties**: When editing trade nodes
- **Future Features**: Easily extensible to new areas

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
4. **Test Strategy**: Use backtest mode with historical data

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

## 👨‍💻 Developer Guide

### Adding Quick Symbols to New Components

#### Method 1: With SymbolInput Component
```javascript
const symbolInput = new SymbolInput(inputContainer, options);
QuickSymbols.createForSymbolInput(quickSymbolsContainer, symbolInput);
```

#### Method 2: With Custom Callback
```javascript
QuickSymbols.create(quickSymbolsContainer, (symbol) => {
  // Handle symbol selection
  console.log('Selected:', symbol);
  myInput.value = symbol;
});
```

#### Method 3: With Custom Options
```javascript
QuickSymbols.create(container, callback, {
  className: 'custom-quick-symbols',
  buttonClass: 'custom-btn',
  symbols: ['CUSTOM1', 'CUSTOM2'] // Override default symbols
});
```

### Configuration Management

#### Accessing Quick Symbols Configuration
```javascript
// Get current symbols
const symbols = AppConfig.getQuickSymbols();

// Add a symbol programmatically
AppConfig.addQuickSymbol('XAUUSD');

// Remove a symbol
AppConfig.removeQuickSymbol('XAUUSD');

// Save changes
AppConfig.saveToLocalStorage();
```

### Module Architecture

#### File Dependencies
```
index.html
    │
    ├─▶ config.js (loaded first)
    │       └─▶ Defines AppConfig
    │
    ├─▶ quick-symbols.js (loaded second)
    │       └─▶ Defines QuickSymbols class, Uses AppConfig
    │
    ├─▶ symbol-input.js
    ├─▶ node-editor.js
    └─▶ renderer.js (loaded last)
            └─▶ Uses QuickSymbols and AppConfig, Implements UI logic
```

#### Key Architectural Patterns
- **Single Responsibility**: Each JS file handles one major feature area
- **Separation of Concerns**: UI logic separate from business logic
- **Event-Driven**: Heavy use of event listeners and callbacks
- **Modular Design**: Reusable components with clear APIs

### Python Bridge Development

#### WebSocket Communication
```python
# mt5_bridge.py
import websockets
import MetaTrader5 as mt5

async def handle_client(websocket, path):
    async for message in websocket:
        # Process MT5 commands
        response = await process_command(message)
        await websocket.send(response)
```

#### Adding New MT5 Functions
1. Add function to `mt5_bridge.py`
2. Update WebSocket message handling
3. Add corresponding JavaScript client code in `mt5-bridge.js`
4. Update UI components as needed

## 📚 API Reference

### AppConfig Object

#### Properties
```javascript
AppConfig.quickSymbols  // Array of symbol strings
```

#### Methods

**`getQuickSymbols()`** - Returns current array of quick symbols
```javascript
const symbols = AppConfig.getQuickSymbols();
// Returns: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD']
```

**`addQuickSymbol(symbol)`** - Adds a new symbol to the list
```javascript
AppConfig.addQuickSymbol('XAUUSD');
// Automatically saves to localStorage
```

**`removeQuickSymbol(symbol)`** - Removes a symbol from the list
```javascript
AppConfig.removeQuickSymbol('XAUUSD');
// Automatically saves to localStorage
```

### QuickSymbols Class

#### Static Methods

**`create(container, onSymbolClick, options)`** - Creates quick symbol buttons

**Parameters:**
- `container` (HTMLElement) - Container to append buttons to
- `onSymbolClick` (Function) - Callback when symbol is clicked
- `options` (Object, optional) - Configuration options

**`createForSymbolInput(container, symbolInput)`** - Helper for SymbolInput integration

**`update(container)`** - Updates existing quick symbol buttons

### CSS Classes

**`.quick-symbols`** - Container for quick symbol buttons
```css
.quick-symbols {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
```

**`.quick-symbol-btn`** - Individual symbol button
```css
.quick-symbol-btn {
  padding: 4px 8px;
  background: #444;
  border: 1px solid #555;
  border-radius: 3px;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}
```

## 🔧 Troubleshooting

### Common Issues

#### Quick Symbols Not Appearing
- **Check MT5 Connection**: Ensure MetaTrader 5 is running and connected
- **Verify Configuration**: Open Settings and check if symbols are configured
- **Clear Browser Data**: If symbols disappeared, they'll reset to defaults

#### Symbol Input Not Working
If you can't type in symbol input fields after removing quick symbols:

```javascript
// Debug in browser console
debugSymbolInput();

// Attempt to fix
fixSymbolInput();
```

#### Python Bridge Connection Issues
1. **Check Python Dependencies**: `pip install -r requirements.txt`
2. **Verify MT5 Installation**: Ensure MetaTrader 5 is properly installed
3. **Port Conflicts**: Check if port 8765 is available
4. **Firewall**: Ensure WebSocket connections are allowed

#### Build Issues
```bash
# Clear node modules and reinstall
rm -rf node_modules
npm install

# Clear Python cache
pip cache purge
pip install -r requirements.txt --force-reinstall
```

### Debug Tools

#### Browser Console Commands
```javascript
// Check symbol input status
debugSymbolInput();

// Fix symbol input issues
fixSymbolInput();

// Inspect configuration
console.log(AppConfig.getQuickSymbols());

// Test quick symbols
QuickSymbols.create(document.body, console.log);
```

#### Python Bridge Debugging
```bash
# Run Python bridge manually
python mt5_bridge.py

# Check MT5 connection
python -c "import MetaTrader5 as mt5; print(mt5.initialize())"
```

### Performance Optimization

#### Memory Usage
- **Historical Data**: Large datasets are stored in localStorage
- **Node Editor**: Complex strategies may impact rendering performance
- **WebSocket**: Monitor connection stability for real-time features

#### Storage Management
```javascript
// Check localStorage usage
console.log(JSON.stringify(localStorage).length + ' characters');

// Clear historical data if needed
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

### Code Style

- **JavaScript**: Use ES6+ features, consistent indentation
- **Python**: Follow PEP 8 guidelines
- **HTML/CSS**: Semantic markup, consistent class naming
- **File Naming**: Kebab-case for JS files, snake_case for Python

### Testing

#### Manual Testing
- Test all quick symbol functionality
- Verify MT5 integration
- Test node editor operations
- Validate historical data import

#### Test Files
- `test-quick-symbols.html` - Quick symbols functionality
- `test-confirmation-modal.html` - Modal system testing
- `test-symbol-input-fix.html` - Symbol input validation

### Pull Request Guidelines

1. **Feature Branch**: Create from `main` branch
2. **Clear Description**: Explain what the PR does and why
3. **Test Coverage**: Include relevant tests
4. **Documentation**: Update README if needed
5. **Code Review**: Address feedback promptly

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues, questions, or contributions:
1. Check existing documentation
2. Search through issues
3. Create a new issue with detailed information
4. Include system information and error logs

---

**Built with ❤️ for the trading community**