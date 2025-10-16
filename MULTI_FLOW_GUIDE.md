# Multi-Flow Management Guide

## Overview

The MT5 Strategy Builder now supports running multiple strategy flows simultaneously. This allows you to execute different strategies in parallel, each with their own triggers and execution intervals.

## Key Features

### 1. Multiple Concurrent Flows
- Run multiple strategies at the same time
- Each flow operates independently with its own triggers
- No limit on the number of concurrent flows

### 2. Flow Manager Dashboard
- View all running flows in one place
- Monitor runtime, intervals, and trigger information
- Stop individual flows or all flows at once

### 3. Independent Flow Control
- Each flow can have different execution intervals
- Flows can be stopped individually without affecting others
- Real-time status updates for all running flows

## How to Use

### Starting a New Flow

1. **Build Your Strategy**
   - Add trigger nodes to the canvas
   - Connect them to indicators, logic gates, and trade actions
   - Configure node parameters as needed

2. **Run the Strategy**
   - Click the "▶ Run Strategy" button
   - Select "Run Periodically"
   - Set your desired interval (e.g., 60 seconds, 5 minutes, 1 hour)
   - Click "Run Strategy"

3. **Flow Created**
   - A new flow is created and starts executing
   - You'll see a success message with the flow details
   - The "Manage Flows" button appears in the toolbar

### Managing Running Flows

1. **Open Flow Manager**
   - Click the "📊 Manage Flows (X)" button in the toolbar
   - The number in parentheses shows how many flows are running

2. **View Flow Details**
   Each flow displays:
   - **Flow Name**: Auto-generated (e.g., "Flow 1 (2 triggers)")
   - **Status**: Running indicator
   - **Triggers**: List of trigger nodes in the flow
   - **Interval**: Execution frequency
   - **Runtime**: How long the flow has been running
   - **Started**: Time when the flow was started

3. **Stop Individual Flow**
   - Click the "Stop" button next to any flow
   - That specific flow will stop immediately
   - Other flows continue running

4. **Stop All Flows**
   - Click the "Stop All Flows" button at the bottom
   - Confirm the action
   - All running flows will stop

### Running Multiple Flows

You can run multiple flows simultaneously:

1. Create and run your first strategy flow
2. Modify your node graph or create a new strategy
3. Click "▶ Run Strategy" again
4. A new independent flow will start
5. Both flows run in parallel

**Example Use Cases:**
- Run a scalping strategy (1-minute intervals) and a swing strategy (1-hour intervals) simultaneously
- Test different symbol pairs with separate flows
- Execute multiple timeframe strategies in parallel

## Flow Manager Interface

### Flow Item Display

```
┌─────────────────────────────────────────────────┐
│ Flow 1 (2 triggers)        ● Running    [Stop] │
├─────────────────────────────────────────────────┤
│ Triggers: Trigger, Trigger                      │
│ Interval: Every 60 seconds                      │
│ Runtime: 5m 23s                                 │
│ Started: 2:45:30 PM                             │
└─────────────────────────────────────────────────┘
```

### Real-Time Updates

- Runtime counter updates every second
- Flow status is monitored continuously
- Changes reflect immediately in the UI

## Technical Details

### Flow Management System

**Data Structure:**
```javascript
{
  id: 1,
  name: "Flow 1 (2 triggers)",
  triggers: [{ id: 123, title: "Trigger" }],
  startTime: Date,
  interval: 60,
  unit: "seconds",
  intervalIds: [intervalId1, intervalId2],
  triggerNodes: [node1, node2]
}
```

**Key Functions:**
- `handleRunStrategy()`: Creates and starts new flows
- `stopFlow(flowId)`: Stops a specific flow
- `stopAllFlows()`: Stops all running flows
- `updateFlowManagerDisplay()`: Updates the UI

### Interval Management

Each trigger in a flow has its own interval:
- Stored in `node.intervalId`
- Managed by `setInterval()` in JavaScript
- Cleared when flow is stopped

### UI State Management

- `runningFlows` Map: Stores all active flows
- `flowIdCounter`: Auto-increments for unique flow IDs
- `isStrategyRunning`: Boolean flag for any running flows
- Auto-updates every second when Flow Manager is open

## Best Practices

### 1. Flow Organization
- Use descriptive trigger names for easy identification
- Group related triggers in the same flow
- Keep flows focused on specific strategies

### 2. Performance Considerations
- Avoid running too many flows with very short intervals
- Monitor system resources when running multiple flows
- Consider the MT5 API rate limits

### 3. Flow Monitoring
- Regularly check the Flow Manager to monitor active flows
- Stop unused flows to free up resources
- Review runtime to ensure flows are executing as expected

### 4. Strategy Testing
- Test strategies individually before running multiple flows
- Use "Run Once" to verify strategy logic before periodic execution
- Monitor the first few executions of each flow

## Troubleshooting

### Flow Not Starting
- **Check**: Ensure you have at least one trigger node
- **Check**: Verify MT5 connection is active
- **Check**: Review console log for errors

### Flow Stops Unexpectedly
- **Check**: Look for errors in the console log
- **Check**: Verify MT5 connection is still active
- **Check**: Ensure trigger nodes are properly configured

### Multiple Flows Interfering
- **Note**: Each flow operates independently
- **Note**: Flows share the same MT5 connection
- **Tip**: Use different symbols or timeframes to avoid conflicts

### Flow Manager Not Updating
- **Check**: Ensure the modal is open
- **Check**: Refresh by closing and reopening the Flow Manager
- **Note**: Updates occur every second automatically

## Keyboard Shortcuts

- **Ctrl+Z**: Undo node deletion (when not running)
- **Delete**: Remove selected node (when not running)

## Limitations

- Flows cannot be paused (only stopped)
- Flow names are auto-generated (not customizable)
- Node graph cannot be edited while flows are running
- All flows share the same MT5 connection and account

## Future Enhancements

Potential features for future versions:
- Custom flow names
- Flow pause/resume functionality
- Flow templates and presets
- Flow performance metrics
- Flow execution history
- Export/import flow configurations

## Related Documentation

- [README.md](README.md) - Main project documentation
- [TEST_BUTTONS_GUIDE.md](TEST_BUTTONS_GUIDE.md) - Testing features
- [STRATEGY_NOT_EXECUTING.md](STRATEGY_NOT_EXECUTING.md) - Troubleshooting guide

## Support

For issues or questions:
1. Check the console log (Show Log button)
2. Review the troubleshooting section above
3. Verify your node graph configuration
4. Test with a simple strategy first
