# Trigger Flow Nodes

This document explains how to use the trigger flow nodes in the MT5 Strategy Builder.

## Overview

All nodes in the system now use trigger inputs and trigger outputs to create execution flows. This simplified approach ensures that all nodes can be connected in a consistent manner, creating clear execution chains for your trading strategies.

## Node Types

### 1. Manual Trigger ⚡

**Purpose**: Execute your strategy on-demand with a single click.

**Features**:
- Green "▶ EXECUTE" button appears at the bottom of the node
- Click the button to manually trigger the connected flow
- Useful for testing strategies or executing trades at specific moments
- Can be enabled/disabled via properties panel

**Inputs**: None (entry point)
**Outputs**: `trigger` - initiates execution flow

**Parameters**:
- `enabled` (boolean): Enable or disable the trigger
- `description` (string): Optional description of what this trigger does

**Use Cases**:
- Manual strategy execution when you see a trading opportunity
- Testing your node flow before automating it
- One-time trade executions based on your analysis

### 2. Period Trigger ⏱️

**Purpose**: Automatically execute your strategy at regular intervals.

**Features**:
- Pulsing green indicator shows when the trigger is active
- Automatically executes connected nodes at specified intervals
- Configurable time units (seconds, minutes, hours)
- Can be started/stopped via the enabled parameter

**Inputs**: None (entry point)
**Outputs**: `trigger` - initiates execution flow

**Parameters**:
- `enabled` (boolean): Start or stop the periodic execution
- `interval` (number): How often to trigger (e.g., 60)
- `unit` (string): Time unit - "seconds", "minutes", or "hours"

**Use Cases**:
- Automated strategy execution every X minutes/hours
- Regular market monitoring and analysis
- Scheduled trading based on time intervals
- Backtesting with time-based execution

### 3. Moving Average Node 📈

**Purpose**: Calculate moving average indicator values.

**Inputs**: `trigger` - receives execution signal
**Outputs**: `trigger` - passes execution to next node

**Parameters**:
- `period` (number): Moving average period (e.g., 20)

**Use Cases**:
- Technical analysis for trend identification
- Signal generation based on price averages

### 4. RSI Node 📊

**Purpose**: Calculate Relative Strength Index indicator.

**Inputs**: `trigger` - receives execution signal
**Outputs**: `trigger` - passes execution to next node

**Parameters**:
- `period` (number): RSI calculation period (e.g., 14)

**Use Cases**:
- Overbought/oversold market conditions
- Momentum-based trading signals

### 5. Conditional Check Node ⚖️

**Purpose**: Check if a symbol's current price meets a specified condition.

**Inputs**: `trigger` - receives execution signal
**Outputs**: `trigger` - passes execution to next node (only if condition is met)

**Parameters**:
- `symbol` (string): Trading symbol to check (e.g., EURUSD, GBPUSD)
- `operator` (string): Comparison operator (>, <, >=, <=, ==, !=)
- `price` (number): Target price to compare against

**Features**:
- **Get Current Price Button**: Click to fetch and set the current market price from MT5 as the threshold
- **Live Data**: Uses real-time bid price from MT5
- **Quick Setup**: Easily set price thresholds based on current market conditions

**Logic**:
- Fetches current market price for the specified symbol
- Compares current price with target price using the operator
- Only passes the trigger to connected nodes if condition is true
- If condition is false, execution stops at this node

**Use Cases**:
- Price-based entry conditions (e.g., "Buy when EURUSD > 1.1000")
- Support/resistance level checks
- Breakout detection
- Price threshold monitoring

### 6. Logic Gates 🔗

**Purpose**: Perform logical operations (AND, OR).

**Inputs**: 
- `trigger1` - first trigger input
- `trigger2` - second trigger input

**Outputs**: `trigger` - passes execution to next node

**Parameters**: None

**Logic**:
- **AND Gate**: Outputs trigger only when BOTH inputs are triggered
- **OR Gate**: Outputs trigger when EITHER input is triggered

**Use Cases**:
- Combine multiple conditions
- Complex decision logic in strategies
- Conditional branching based on multiple signals

### 7. Trade Signal Node 💰

**Purpose**: Execute trading orders based on strategy conditions.

**Inputs**: `trigger` - receives execution signal
**Outputs**: None (end point)

**Parameters**:
- `action` (string): BUY or SELL
- `symbol` (string): Trading symbol
- `volume` (number): Order volume

**Use Cases**:
- Execute actual trades
- Place orders based on strategy signals

## How to Use

### Creating Execution Flows

1. **Start with a Trigger**: Click on either "⚡ Manual Trigger" or "⏱️ Period Trigger" in the left sidebar
2. **Add Processing Nodes**: Add market data, indicators, logic, or other processing nodes
3. **Connect the Flow**: Connect trigger outputs (green sockets) to trigger inputs (blue sockets) to create execution chains
4. **End with Actions**: Connect to trade signal nodes to execute trades

### Node Connection Rules

- **Trigger Outputs** (green sockets) can only connect to **Trigger Inputs** (blue sockets)
- All nodes now use the same connection system for consistency
- Create linear flows or branching logic as needed
- Each node executes when it receives a trigger signal

### Configuring a Manual Trigger

1. Select the manual trigger node
2. In the properties panel (right sidebar):
   - Set `enabled` to "Enabled" to activate the button
   - Add a description if desired
3. Click the green "▶ EXECUTE" button on the node to trigger execution

### Configuring a Period Trigger

1. Select the period trigger node
2. In the properties panel (right sidebar):
   - Set `interval` to your desired number (e.g., 60)
   - Set `unit` to "seconds", "minutes", or "hours"
   - Set `enabled` to "Enabled" to start automatic execution
3. The node will show a pulsing green indicator when active
4. Set `enabled` to "Disabled" to stop automatic execution

## Example Workflows

### Example 1: Manual Trading Strategy

```
Manual Trigger → Market Data → Moving Average → Compare → Trade Signal
```

Click the manual trigger button when you want to check if conditions are met and execute a trade.

### Example 2: Automated Monitoring

```
Period Trigger (5 minutes) → Market Data → RSI → Compare → Trade Signal
```

Automatically checks RSI every 5 minutes and executes trades when conditions are met.

### Example 3: Multiple Triggers

You can have multiple trigger nodes in the same canvas:
- Manual trigger for immediate execution
- Period trigger (1 hour) for long-term strategy
- Period trigger (5 minutes) for short-term strategy

## Visual Indicators

### Manual Trigger
- **Green button**: Trigger is enabled and ready to execute
- **Node border**: Green tint indicates it's a trigger node

### Period Trigger
- **Solid green dot**: Trigger is enabled and running
- **Pulsing circle**: Animation shows the trigger is actively running
- **Gray dot**: Trigger is disabled

## Best Practices

1. **Start with Manual Triggers**: Test your strategy flow with manual triggers before automating
2. **Reasonable Intervals**: Don't set period triggers too frequently (avoid < 10 seconds) to prevent overloading
3. **Enable/Disable**: Use the enabled parameter to pause triggers without deleting them
4. **Multiple Strategies**: Use different triggers for different strategies on the same canvas
5. **Save Your Work**: Save your graph with triggers configured for later use

## Tips

- Period triggers continue running even when the node is not selected
- All period triggers are automatically stopped when you clear the canvas
- Trigger execution shows a message indicating how many nodes are connected
- If connected to MT5, triggers will execute the full strategy flow
- You can have multiple triggers connected to the same nodes

## Troubleshooting

**Manual trigger button not appearing?**
- Check that `enabled` is set to "Enabled" in properties

**Period trigger not executing?**
- Verify `enabled` is set to "Enabled"
- Check that interval is a positive number
- Ensure you're connected to MT5 if executing trades

**Trigger executes but nothing happens?**
- Make sure the trigger output is connected to other nodes
- Check that your strategy flow is properly configured
- Verify MT5 connection if executing trades
