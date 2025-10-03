# Node System Technical Specification

## Overview
This document describes the improved node-based visual programming system for the MT5 Strategy Builder, including data type validation, connection management, and trigger flow execution.

## Data Type System

### Supported Data Types
The node system supports the following data types:

| Type | Color | Description | Usage |
|------|-------|-------------|-------|
| `trigger` | Green (#4CAF50) | Execution trigger signal | Initiates node execution flow |
| `price` | Blue (#2196F3) | Market price data | OHLC prices from market data |
| `number` | Orange (#FF9800) | Numeric values | Volume, periods, constants |
| `boolean` | Red (#F44336) | True/false values | Comparison results, conditions |
| `signal` | Purple (#9C27B0) | Trading signals | Buy/sell decision signals |
| `indicator` | Cyan (#00BCD4) | Technical indicators | MA, RSI, other indicators |
| `any` | Gray (#757575) | Universal type | Accepts any connection |

### Type Compatibility Rules

1. **Exact Match**: Same types can always connect (e.g., `price` → `price`)
2. **Any Type**: `any` type is compatible with all other types
3. **Price to Number**: `price` can connect to `number` inputs
4. **Indicator to Number**: `indicator` can connect to `number` inputs
5. **Number Accepts**: `number` inputs can accept `price` and `indicator` outputs

### Type Validation
- Connections are validated in real-time when creating them
- Invalid connections show an error message with type names
- Type mismatch prevents connection creation
- Socket colors provide visual feedback for compatibility

## Node Configurations

### Trigger Nodes

#### Manual Trigger
- **Inputs**: None
- **Outputs**: `trigger` (Trigger)
- **Parameters**:
  - `enabled`: boolean - Enable/disable the trigger button
  - `description`: string - Optional description
- **Behavior**: Executes on button click

#### Period Trigger
- **Inputs**: None
- **Outputs**: `trigger` (Trigger)
- **Parameters**:
  - `enabled`: boolean - Start/stop automatic execution
  - `interval`: number - How often to trigger
  - `unit`: string - Time unit (seconds, minutes, hours)
- **Behavior**: Executes automatically at specified intervals

### Data Source Nodes

#### Market Data
- **Inputs**: `trigger` (Trigger) - When to fetch data
- **Outputs**: 
  - `price` (Price) - Current market price
  - `volume` (Number) - Trading volume
- **Parameters**:
  - `symbol`: string - Trading symbol (e.g., EURUSD)

#### Constant Value
- **Inputs**: None
- **Outputs**: `value` (Number)
- **Parameters**:
  - `value`: number - Constant numeric value

### Indicator Nodes

#### Moving Average
- **Inputs**: `price` (Price)
- **Outputs**: `indicator` (Indicator)
- **Parameters**:
  - `period`: number - MA period (default: 20)

#### RSI
- **Inputs**: `price` (Price)
- **Outputs**: `indicator` (Indicator)
- **Parameters**:
  - `period`: number - RSI period (default: 14)

### Logic Nodes

#### Compare
- **Inputs**: 
  - `value1` (Number)
  - `value2` (Number)
- **Outputs**: `result` (Boolean)
- **Parameters**:
  - `operator`: string - Comparison operator (>, <, ==, >=, <=, !=)

#### AND Gate
- **Inputs**: 
  - `input1` (Boolean)
  - `input2` (Boolean)
- **Outputs**: `output` (Boolean)
- **Behavior**: Returns true if both inputs are true

#### OR Gate
- **Inputs**: 
  - `input1` (Boolean)
  - `input2` (Boolean)
- **Outputs**: `output` (Boolean)
- **Behavior**: Returns true if either input is true

### Trading Nodes

#### Trade Signal
- **Inputs**: `signal` (Boolean) - Execute trade when true
- **Outputs**: None (terminal node)
- **Parameters**:
  - `action`: string - BUY or SELL
  - `symbol`: string - Trading symbol
  - `volume`: number - Trade volume in lots

## Connection Management

### Creating Connections
1. Click on an output socket (right side of node)
2. Drag to an input socket (left side of target node)
3. Release to create connection
4. System validates type compatibility
5. If compatible, connection is created
6. If incompatible, error message is shown

### Visual Feedback
- **Active Connection**: Colored line based on data type
- **Hovered Connection**: Orange highlight with glow effect
- **Selected Connection**: Orange highlight with glow effect
- **Creating Connection**: Dashed line follows mouse cursor
- **Socket Colors**: Match data type colors for visual matching

### Disconnecting Connections

Three methods to disconnect:

1. **Right-Click**: Right-click directly on a connection line
2. **Ctrl+Click**: Hold Ctrl and left-click on a connection
3. **Select & Delete**: 
   - Left-click to select a connection (turns orange)
   - Press Delete key to remove selected connection

### Connection Display Features
- Connection lines use bezier curves for smooth appearance
- Line thickness: 2px normal, 3px when hovered/selected
- Glow effect on hover for better visibility
- Cursor changes to pointer when hovering over connections

## Trigger Flow Execution

### Execution Flow
1. **Trigger Activation**:
   - Manual: User clicks "▶ EXECUTE" button
   - Period: Automatic at specified intervals

2. **Flow Propagation**:
   - System finds all nodes connected to trigger output
   - Executes connected nodes in sequence
   - Each node processes its inputs and produces outputs
   - Outputs flow to connected downstream nodes

3. **Execution Tracking**:
   - Visual feedback shows when trigger executes
   - Console logs show execution details
   - Connected node count is displayed

### Period Trigger Management
- **Start**: Set `enabled` to true in properties
- **Stop**: Set `enabled` to false in properties
- **Update**: Changes to interval/unit restart the timer
- **Visual Indicator**: Pulsing green dot shows active state
- **Auto-Stop**: All period triggers stop when canvas is cleared

### Execution Context
- If connected to MT5: Full strategy execution with real trades
- If not connected: Dry run for testing flow logic
- Error handling: Invalid nodes or connections show error messages

## Socket Visualization

### Socket Display
- **Size**: 6px radius circles
- **Border**: 1px black outline for definition
- **Color**: Matches data type color
- **Label**: Shows socket name next to the circle
- **Type Tag**: Small text showing type name in parentheses

### Socket Layout
- **Input Sockets**: Left side of node, evenly spaced
- **Output Sockets**: Right side of node, evenly spaced
- **Spacing**: 25px vertical spacing between sockets
- **Alignment**: Inputs align left, outputs align right

## Node Height Calculation
Nodes automatically calculate their height based on:
- Base height: 80px
- Input sockets: 25px per input
- Parameters: 15px per parameter (minimum 30px)
- Dynamic sizing ensures all content fits

## User Interface Features

### Canvas Interactions
- **Add Node**: Click node button in left sidebar
- **Select Node**: Left-click on node
- **Move Node**: Click and drag node
- **Connect**: Drag from output to input socket
- **Disconnect**: Right-click or Ctrl+click on connection
- **Zoom**: Mouse wheel (0.5x to 2x range)
- **Grid**: 20px grid for alignment reference

### Visual Indicators
- **Selected Node**: Green border (3px)
- **Normal Node**: Gray border (2px)
- **Trigger Node**: Green tint background
- **Active Trigger**: Pulsing green indicator
- **Hovered Connection**: Orange with glow
- **Type Mismatch**: Error message display

### Properties Panel
- **Node Selection**: Auto-updates when node is selected
- **Parameter Editing**: Real-time updates
- **Symbol Input**: Autocomplete for MT5 symbols
- **Trigger Controls**: Start/stop period triggers
- **Delete Button**: Remove selected node

## Error Handling

### Connection Errors
- Type mismatch: Shows specific type names in error
- Invalid socket: Prevents connection attempt
- Self-connection: Not allowed (validation in place)

### Execution Errors
- No MT5 connection: Warning message shown
- Empty graph: Error before execution
- Invalid parameters: Validated before execution

## Performance Considerations

### Optimization Features
- Canvas rendering: 60fps animation loop
- Connection detection: Bezier curve sampling (20 samples)
- Hover detection: 10px threshold for user-friendly interaction
- Type checking: O(1) lookup using object map

### Memory Management
- Node limit: Unlimited (limited by browser memory)
- Connection tracking: Array-based for O(n) operations
- Socket positions: Calculated on-demand (not stored)
- Grid rendering: Optimized with fixed pattern

## Future Enhancements

### Potential Improvements
1. **Multiple Outputs**: Support for multiple output sockets per node
2. **Group Nodes**: Collapse multiple nodes into reusable groups
3. **Node Templates**: Save and load common node patterns
4. **Execution Debugging**: Step-through execution with breakpoints
5. **Data Flow Preview**: Show values flowing through connections
6. **Node Search**: Quick search/filter in node palette
7. **Undo/Redo**: History management for node operations
8. **Copy/Paste**: Duplicate nodes and connections
9. **Mini-map**: Overview of large node graphs
10. **Performance Profiling**: Execution time for each node

## API Reference

### NodeEditor Class

#### Properties
- `nodes`: Array - All nodes in the graph
- `connections`: Array - All connections between nodes
- `dataTypes`: Object - Data type definitions with colors
- `selectedNode`: Node - Currently selected node
- `selectedConnection`: Connection - Currently selected connection

#### Methods
- `addNode(type, x, y)`: Create new node
- `addConnection(from, to, inputIndex, outputIndex)`: Create connection
- `removeNode(node)`: Delete node and its connections
- `removeConnection(connection)`: Delete connection
- `areTypesCompatible(fromType, toType)`: Check type compatibility
- `executeTrigger(node)`: Execute trigger node
- `exportGraph()`: Serialize graph to JSON
- `importGraph(data)`: Load graph from JSON

## Version History

### Version 2.0 (Current)
- Added data type system with 7 types
- Implemented type validation for connections
- Added connection disconnection UI (right-click, Ctrl+click, Delete key)
- Visual feedback for type compatibility
- Improved trigger node system with better flow tracking
- Socket coloring based on data types
- Connection hover and selection states
- Type labels on sockets

### Version 1.0 (Previous)
- Basic node system with no type checking
- Manual and period trigger nodes
- Simple connection system
- No connection deletion UI
- Basic visual styling

## Conclusion

The improved node system provides a robust, type-safe visual programming environment for building MT5 trading strategies. The data type system prevents logic errors at design time, while the improved UI makes it easy to manage complex node graphs. The trigger system enables both manual testing and automated execution, making it suitable for development and production use.

