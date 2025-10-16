# Multi-Flow Quick Start Guide

## What is Multi-Flow?

Multi-Flow allows you to run multiple trading strategies at the same time, each with its own triggers and execution schedule. Think of it as running multiple robots simultaneously, each following different rules.

## Quick Example

### Scenario: Running Two Strategies

**Strategy 1: Scalping (Fast)**
- Checks price every 30 seconds
- Looks for quick profit opportunities
- Uses 1-minute timeframe

**Strategy 2: Swing Trading (Slow)**
- Checks price every 1 hour
- Looks for larger trends
- Uses 1-hour timeframe

With Multi-Flow, both strategies run at the same time without interfering with each other!

## How to Use (3 Simple Steps)

### Step 1: Create Your First Strategy

1. Add trigger nodes to the canvas
2. Connect them to your trading logic
3. Click "▶ Run Strategy"
4. Choose "Run Periodically"
5. Set interval (e.g., 30 seconds)
6. Click "Run Strategy"

✅ **Flow 1 is now running!**

### Step 2: Create Your Second Strategy

1. Modify your nodes or create new strategy
2. Click "▶ Run Strategy" again
3. Choose "Run Periodically"
4. Set different interval (e.g., 1 hour)
5. Click "Run Strategy"

✅ **Flow 2 is now running alongside Flow 1!**

### Step 3: Manage Your Flows

1. Click "📊 Manage Flows (2)" button
2. See both flows running
3. Stop individual flows or all at once

## Visual Guide

```
┌─────────────────────────────────────────────────────┐
│  Toolbar                                            │
│  [▶ Run Strategy] [📊 Manage Flows (2)]            │
└─────────────────────────────────────────────────────┘

Click "Manage Flows" to see:

┌─────────────────────────────────────────────────────┐
│  📊 Running Flows Manager                           │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────┐ │
│  │ Flow 1 (2 triggers)    ● Running    [Stop]   │ │
│  │ Triggers: Trigger, Trigger                    │ │
│  │ Interval: Every 30 seconds                    │ │
│  │ Runtime: 5m 23s                               │ │
│  │ Started: 2:45:30 PM                           │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ Flow 2 (1 trigger)     ● Running    [Stop]   │ │
│  │ Triggers: Trigger                             │ │
│  │ Interval: Every 1 hour                        │ │
│  │ Runtime: 2m 10s                               │ │
│  │ Started: 2:48:43 PM                           │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  [Stop All Flows]  [Close]                         │
└─────────────────────────────────────────────────────┘
```

## Common Use Cases

### 1. Multi-Timeframe Trading
```
Flow 1: 1-minute scalping
Flow 2: 15-minute swing trades
Flow 3: 1-hour position trades
```

### 2. Multi-Symbol Trading
```
Flow 1: EURUSD strategy
Flow 2: GBPUSD strategy
Flow 3: XAUUSD (Gold) strategy
```

### 3. Strategy Comparison
```
Flow 1: Strategy A (aggressive)
Flow 2: Strategy B (conservative)
Compare results after 1 hour
```

### 4. Diversified Trading
```
Flow 1: Trend following
Flow 2: Mean reversion
Flow 3: Breakout trading
```

## Tips & Tricks

### ✅ Do's

- **Start Simple**: Begin with 1-2 flows
- **Different Intervals**: Use different timeframes for each flow
- **Monitor Regularly**: Check Flow Manager periodically
- **Test First**: Use "Run Once" before periodic execution

### ❌ Don'ts

- **Too Many Flows**: Avoid running 10+ flows simultaneously
- **Same Interval**: Don't run multiple flows with identical intervals
- **Ignore Monitoring**: Always check flow status regularly
- **Forget to Stop**: Stop unused flows to free resources

## Keyboard Shortcuts

- **Delete**: Remove selected node (when not running)
- **Ctrl+Z**: Undo node deletion

## Troubleshooting

### Flow Not Starting?
- Check: Do you have trigger nodes?
- Check: Is MT5 connected?
- Check: Any errors in console log?

### Flows Interfering?
- Note: Each flow is independent
- Tip: Use different symbols or timeframes
- Tip: Check overtrade settings

### Can't Edit Nodes?
- Note: Nodes are locked while flows run
- Solution: Stop flows to edit nodes

## Next Steps

1. ✅ Read this Quick Start
2. 📖 Read [MULTI_FLOW_GUIDE.md](MULTI_FLOW_GUIDE.md) for details
3. 🧪 Test with simple strategies
4. 🚀 Build your multi-flow trading system!

## Support

Need help?
1. Check [MULTI_FLOW_GUIDE.md](MULTI_FLOW_GUIDE.md)
2. Review console log (Show Log button)
3. Test with simple strategy first

---

**Happy Multi-Flow Trading! 🚀📈**
