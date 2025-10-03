# Recent Changes

## Node System Improvements - Data Types & Connection Management (Latest)

### Summary
Completely overhauled the node system with a robust data type system, type validation for connections, and improved UI for managing connections. This update makes the node-based strategy builder much more mature and user-friendly.

### Features Added

#### 1. **Data Type System**
Added 7 distinct data types with color coding:
- **Trigger** (Green): Execution flow signals
- **Price** (Blue): Market price data
- **Number** (Orange): Numeric values
- **Boolean** (Red): True/false conditions
- **Signal** (Purple): Trading signals
- **Indicator** (Cyan): Technical indicator values
- **Any** (Gray): Universal compatibility

#### 2. **Type Validation**
- Connections are validated in real-time when created
- Invalid type connections are prevented with error messages
- Type compatibility rules:
  - Exact match: Same types can connect
  - `any` type: Compatible with everything
  - `price` → `number`: Allowed conversion
  - `indicator` → `number`: Allowed conversion
  - Smart compatibility checking prevents logic errors

#### 3. **Connection Disconnection UI**
Three methods to remove connections:
- **Right-Click**: Right-click on any connection line
- **Ctrl+Click**: Hold Ctrl and left-click on connection
- **Select & Delete**: Click to select (turns orange), press Delete key

#### 4. **Visual Improvements**
- **Socket Colors**: Each socket colored by its data type
- **Connection Colors**: Lines colored based on data flowing through them
- **Type Labels**: Small text showing type name on each socket
- **Hover Effects**: Connections highlight orange with glow when hovered
- **Selection State**: Selected connections show orange highlight
- **Cursor Feedback**: Pointer cursor when hovering over connections
- **Dashed Preview**: When creating connections, shows dashed line with type color

#### 5. **Improved Node Configurations**
Updated all nodes with proper type definitions:
- **Market Data**: Now has `trigger` input, outputs `price` and `number` (volume)
- **Indicators**: Accept `price`, output `indicator` type
- **Compare**: Accepts two `number` inputs, outputs `boolean`
- **Logic Gates**: Accept `boolean` inputs, output `boolean`
- **Trade Signal**: Accepts `boolean` (signal) input
- **Constant**: Outputs `number` type

### Changes Made

#### 1. **node-editor.js**
- Added `dataTypes` object with color and name definitions
- Added `inputTypes` and `outputTypes` arrays to all node configs
- Implemented `areTypesCompatible()` method for type checking
- Updated `addConnection()` with type validation
- Added `removeConnection()` method
- Added `getConnectionAtPoint()` for click detection on bezier curves
- Updated `onMouseDown()` to handle connection clicks
- Added `onContextMenu()` for right-click support
- Updated `onMouseMove()` for hover detection and cursor changes
- Updated `onKeyDown()` to support Delete key for connections
- Enhanced `draw()` to show type colors and hover states
- Updated socket drawing with colored circles and type labels
- Added `selectedConnection` state tracking
- Added `hoveredConnection` state tracking

#### 2. **index.html**
- Updated canvas hint to explain new connection features
- Added information about color-coded data types

#### 3. **NODE_SYSTEM_SPEC.md** (New File)
- Comprehensive technical documentation
- Data type system explanation
- Node configurations with types
- Connection management guide
- Trigger flow execution details
- User interface features
- Error handling
- Performance considerations
- API reference

### Technical Details

#### Type Compatibility Matrix
```
From/To  | trigger | price | number | boolean | signal | indicator | any
---------|---------|-------|--------|---------|--------|-----------|-----
trigger  |    ✓    |   ✗   |   ✗    |    ✗    |   ✗    |     ✗     |  ✓
price    |    ✗    |   ✓   |   ✓    |    ✗    |   ✗    |     ✗     |  ✓
number   |    ✗    |   ✗   |   ✓    |    ✗    |   ✗    |     ✗     |  ✓
boolean  |    ✗    |   ✗   |   ✗    |    ✓    |   ✗    |     ✗     |  ✓
indicator|    ✗    |   ✗   |   ✓    |    ✗    |   ✗    |     ✓     |  ✓
any      |    ✓    |   ✓   |   ✓    |    ✓    |   ✓    |     ✓     |  ✓
```

#### Connection Detection Algorithm
- Uses bezier curve sampling (20 samples per curve)
- 10px threshold for user-friendly clicking
- Efficient O(n) search through all connections
- Hover detection updates every frame

### Benefits

1. **Type Safety**: Prevents logic errors at design time
2. **Better UX**: Color coding makes data flow visually clear
3. **Easy Editing**: Multiple ways to disconnect unwanted connections
4. **Professional Feel**: Smooth interactions and visual feedback
5. **Self-Documenting**: Type labels show what data each socket expects
6. **Flexible**: `any` type provides escape hatch when needed
7. **Scalable**: System designed to support additional types in future

### Example Workflows

#### Valid Connection Example:
```
Manual Trigger → Market Data → Moving Average → Compare → Trade Signal
   (trigger)       (trigger)      (price)        (number)   (boolean)
                     ↓              ↓              ↓
                   (price)      (indicator)    (boolean)
```

#### Invalid Connection Example (Prevented):
```
Manual Trigger → Compare (X - Type mismatch: Cannot connect Trigger to Number)
```

### Future Enhancements
- Multiple output sockets per node
- Visual data flow preview showing actual values
- Group nodes for reusable patterns
- Node search and filtering
- Copy/paste support
- Undo/redo functionality

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
