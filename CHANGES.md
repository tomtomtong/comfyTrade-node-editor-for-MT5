# Recent Changes

## Simplified Node System - Trigger-Only Inputs/Outputs (Latest)

### Summary
Completely redesigned the node system to use only trigger inputs and trigger outputs for all nodes, creating a simplified and consistent execution flow system.

### Key Changes
1. **Unified Connection System**: All nodes now use `trigger` input and `trigger` output types
2. **Simplified Node Definitions**: Removed complex input/output type management
3. **Consistent Execution Flow**: All nodes execute in a linear trigger chain
4. **Updated Documentation**: Comprehensive guide for the new trigger-based system

### Node Type Updates
- **Manual Trigger**: No inputs, `trigger` output (entry point)
- **Period Trigger**: No inputs, `trigger` output (entry point)  
// Market Data node removed
- **Indicators (MA, RSI)**: `trigger` input, `trigger` output
- **Logic Gates (AND, OR)**: `trigger1` + `trigger2` inputs, `trigger` output
- **Conditional Check**: `trigger` input, `trigger` output (with symbol price comparison)
- **Trade Signal**: `trigger` input, no outputs (end point)

### Benefits
- **Simplified Connections**: No more complex type matching between nodes
- **Consistent Interface**: All nodes follow the same input/output pattern
- **Clear Execution Flow**: Easy to understand trigger-based execution chains
- **Reduced Complexity**: Eliminated type validation and matching logic
- **Better UX**: Users can connect any trigger output to any trigger input

### Files Modified
1. **node-editor.js**
   - Updated `getNodeConfig()` to use only trigger types
   - Modified socket drawing to show "trigger" labels (with "trigger1/trigger2" for logic gates)
   - Added connection validation for trigger types
   - Enhanced execution flow with `executeNode()` method
   - Updated trigger chain execution logic
   - **Fixed Logic Gates**: AND and OR gates now have two trigger inputs as expected
   - **Enhanced Compare Node**: Changed to "Conditional Check" with symbol price comparison functionality

2. **index.html**
   - Updated canvas hints to reflect trigger-only connections
   - Clarified connection instructions for users

3. **TRIGGER_NODES.md**
   - Complete rewrite with all node types documented
   - Added input/output specifications for each node
   - Updated usage instructions for trigger-based flows
   - Added connection rules and examples

### Usage
1. Start with a trigger node (Manual or Period)
2. Add processing nodes (Indicators, Logic)
3. Connect trigger outputs to trigger inputs
4. End with action nodes (Trade Signal)
5. All nodes execute in sequence when triggered

---

## Enhanced Conditional Check Node (Latest)

### Summary
Replaced the generic "Compare" node with a practical "Conditional Check" node that allows price-based conditions for specific trading symbols.

### Key Features
1. **Symbol Selection**: Choose any trading symbol (EURUSD, GBPUSD, etc.)
2. **Price Comparison**: Compare current market price with target price
3. **Multiple Operators**: Support for >, <, >=, <=, ==, != operators
4. **Conditional Execution**: Only passes trigger if condition is met
5. **Precise Price Input**: Decimal precision up to 5 decimal places
6. **Get Current Price Button**: Fetch live market price from MT5 with one click

### Parameters
- **symbol** (string): Trading symbol to monitor
- **operator** (string): Comparison operator with user-friendly labels
- **price** (number): Target price for comparison

### Use Cases
- **Entry Conditions**: "Buy when EURUSD > 1.1000"
- **Support/Resistance**: "Sell when GBPUSD < 1.2500"
- **Breakout Detection**: "Execute when USDJPY >= 150.00"
- **Price Thresholds**: Monitor specific price levels

### Files Modified
1. **node-editor.js**: Updated node definition and execution logic
2. **index.html**: Changed button text to "Conditional Check"
3. **renderer.js**: 
   - Added specialized property panel with dropdown operators and number input
   - Added "Get Current Price" button in property panel
   - Added `getCurrentPriceForNode()` function to fetch live MT5 prices
4. **TRIGGER_NODES.md**: Complete documentation update with button feature
5. **CHANGES.md**: Added this enhancement section

---

## Removal: Market Data Node

### Summary
Removed the standalone Market Data node to simplify the node library and avoid redundancy with the Conditional Check node's built-in price fetch capability.

### Changes
- node-editor.js: Removed `market-data` node definition and execution case
- index.html: Removed "Market Data" button from Data Sources
- TRIGGER_NODES.md: Removed Market Data section and renumbered subsequent nodes

---

## Pip-Based Loss Calculation with MT5 Contract Data

### Summary
Updated loss calculation to use proper pip-based methodology with real contract information retrieved from MetaTrader 5 for accurate calculations.

### Important Fix (Latest Update)
**Fixed tick vs pip confusion:**
- MT5 returns **tick size** (0.00001 for EUR/USD = 1 point) and **tick value** ($1 per point)
- We need **pip size** (0.0001 for EUR/USD = 10 points) and **pip value** ($10 per pip)
- Now correctly converts: `pip value = tick value × (pip size / tick size)`
- Example: $1/tick × (0.0001/0.00001) = $10/pip ✓

### Features Added
1. **Real MT5 Contract Data Retrieval**
   - Retrieves `trade_tick_size` (smallest price movement) from MT5
   - Retrieves `trade_tick_value` ($ value per tick) from MT5
   - Retrieves `trade_contract_size` (contract size) from MT5
   - **Converts tick values to pip values** for proper calculation

2. **Proper Pip-Based Calculation**
   - Step 1: Retrieve real contract specifications from MT5
   - Step 2: Calculate 1% price decrease in pips
   - Step 3: Apply formula: `Loss = Number of pips × Pip value × Lot size`
   
3. **Smart Fallback System**
   - If MT5 is not connected, uses intelligent fallback calculations
   - Detects yen pairs (JPY) automatically for correct pip sizing
   - Applies simplified pip values for USD quote currencies

### Changes Made
1. **renderer.js**
   - Updated `calculateVolumeLoss()`: Now retrieves symbol info from MT5 API
   - Updated `testVolumeLossFromNode()`: Same MT5 contract data retrieval
   - Added fallback calculations for offline/disconnected scenarios
   - Enhanced logging to show pip size, pip value, and contract size
   - **Enhanced popup UI**: Now displays all MT5 contract details in the volume loss reminder

2. **index.html**
   - Added MT5 Contract Details section to volume loss popup
   - Shows tick size, pip size, tick value, pip value, contract size, ticks per pip, and price change in pips

### Formula
The proper pip-based formula for 1% price move loss:
```
Step 1: Get pip size and pip value from MT5
Step 2: Calculate price change in pips = (Current Price × 0.01) / Pip Size
Step 3: Loss = Price Change in Pips × Pip Value × Volume
```

### Examples

**EUR/USD at 1.1000 with 1 lot:**
- Pip size: 0.0001
- Pip value: $10 per pip for 1 lot
- 1% price change: 110 pips
- Loss: 110 × $10 × 1 = **$1,100**

**USD/JPY at 150.00 with 1 lot:**
- Pip size: 0.01
- Pip value: $6.67 per pip for 1 lot
- 1% price change: 150 pips
- Loss: 150 × $6.67 × 1 = **$1,000**

### Benefits
- More accurate calculations using real broker specifications
- Correctly handles different symbol types (forex pairs, metals, indices, etc.)
- Accounts for actual tick sizes and values from MT5
- Fallback ensures functionality even when disconnected

---

# Position Management Features Added

## Summary
Added support for closing positions and modifying stop loss/take profit levels for open MT5 positions.

## Changes Made

### 1. Python Bridge (mt5_bridge.py)
- Added `modify_position()` method to modify SL/TP of existing positions
- Updated message handler to support 'modifyPosition' action
- Uses MT5's TRADE_ACTION_SLTP for position modifications

### 2. JavaScript Bridge (mt5-bridge.js)
- Added `modifyPosition(ticket, stopLoss, takeProfit)` method
- Sends modify requests to Python bridge via WebSocket

### 3. Main Process (main.js)
- Added IPC handler for 'mt5:modifyPosition' 
- Passes modification requests from renderer to MT5 bridge

### 4. Preload Script (preload.js)
- Exposed `modifyPosition` API to renderer process
- Maintains security with contextBridge

### 5. Renderer UI (renderer.js)
- Enhanced `handleRefreshPositions()` to display:
  - Current SL/TP values
  - Modify and Close buttons for each position
- Added `closePosition(ticket)` function with confirmation dialog
- Added `showModifyModal()` to display modification dialog
- Added `handleModifyPosition()` to process SL/TP changes
- Added `createModifyModal()` to dynamically create the modal
- Made functions globally available for onclick handlers

### 6. Styles (styles.css)
- Added `.position-actions` styling for button container
- Added `.btn-small` for compact buttons
- Added `#modifyModal` styling for the modification dialog
- Styled form inputs for SL/TP entry

## Features

### Close Position
- Click "Close" button on any open position
- Confirmation dialog prevents accidental closes
- Automatically refreshes account info and positions after close
- Shows success/error messages

### Modify Position
- Click "Modify" button on any open position
- Modal dialog shows current SL/TP values
- Enter new values (0 or empty for none)
- Supports decimal precision up to 5 places
- Automatically refreshes positions after modification
- Shows success/error messages

## Usage

1. Connect to MT5
2. Open positions will display with current SL/TP
3. Click "Modify" to change SL/TP values
4. Click "Close" to close the position
5. All changes are reflected immediately in the UI
