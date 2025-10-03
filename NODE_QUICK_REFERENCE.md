# Node System Quick Reference Guide

## 🎨 Data Type Colors

| Color | Type | Description |
|-------|------|-------------|
| 🟢 Green | Trigger | Starts execution flow |
| 🔵 Blue | Price | Market price data |
| 🟠 Orange | Number | Numeric values |
| 🔴 Red | Boolean | True/false conditions |
| 🟣 Purple | Signal | Trading decisions |
| 🔵 Cyan | Indicator | Technical indicators |
| ⚪ Gray | Any | Universal type |

---

## 🔌 Connection Quick Actions

### ➕ Create Connection
1. Click output socket (right side)
2. Drag to input socket (left side)
3. Release to connect

### ➖ Remove Connection (3 Ways)

| Method | How | When to Use |
|--------|-----|-------------|
| **Right-Click** | Right-click on connection | Quick removal |
| **Ctrl+Click** | Hold Ctrl + Left-click | Quick removal |
| **Delete Key** | Click to select → Press Delete | Precise selection |

---

## 📊 Node Library

### 🟢 Trigger Nodes

#### Manual Trigger
- **Outputs**: Trigger
- **Use**: Click button to execute
- **Tip**: Great for testing

#### Period Trigger  
- **Outputs**: Trigger
- **Use**: Auto-execute every X seconds/minutes/hours
- **Tip**: Set `enabled` to start/stop

---

### 📈 Data Source Nodes

#### Market Data
- **Inputs**: Trigger (when to fetch)
- **Outputs**: Price, Volume
- **Use**: Get current market data
- **Tip**: Connect trigger first

#### Constant Value
- **Outputs**: Number
- **Use**: Fixed numeric value
- **Tip**: Use for thresholds

---

### 📊 Indicator Nodes

#### Moving Average (MA)
- **Inputs**: Price
- **Outputs**: Indicator
- **Parameters**: Period (default: 20)
- **Tip**: Can connect to Compare as number

#### RSI
- **Inputs**: Price
- **Outputs**: Indicator  
- **Parameters**: Period (default: 14)
- **Tip**: Compare to 30/70 thresholds

---

### 🔀 Logic Nodes

#### Compare
- **Inputs**: Number, Number
- **Outputs**: Boolean
- **Parameters**: Operator (>, <, ==, etc.)
- **Use**: Compare two values

#### AND Gate
- **Inputs**: Boolean, Boolean
- **Outputs**: Boolean
- **Use**: Both conditions must be true

#### OR Gate
- **Inputs**: Boolean, Boolean
- **Outputs**: Boolean
- **Use**: Either condition can be true

---

### 💰 Trading Nodes

#### Trade Signal
- **Inputs**: Boolean (condition)
- **Outputs**: None (terminal node)
- **Parameters**: Action (BUY/SELL), Symbol, Volume
- **Use**: Execute trade when condition is true

---

## ✅ Type Compatibility Quick Check

### ✔️ Compatible Connections

```
✅ price → number (price is numeric)
✅ indicator → number (indicator value is numeric)
✅ any → everything (universal)
✅ same type → same type (exact match)
```

### ❌ Incompatible Connections

```
❌ trigger → number (wrong type)
❌ boolean → price (wrong type)
❌ number → trigger (wrong direction)
```

---

## 🎯 Common Patterns

### Pattern 1: Simple Strategy
```
Manual Trigger
  ↓ trigger
Market Data
  ↓ price
Compare (with Constant)
  ↓ boolean
Trade Signal
```

### Pattern 2: Indicator Strategy
```
Period Trigger (5 min)
  ↓ trigger
Market Data
  ↓ price
RSI
  ↓ indicator (→ number)
Compare (< 30)
  ↓ boolean
Trade Signal (BUY)
```

### Pattern 3: Multiple Conditions
```
Manual Trigger
  ↓ trigger
Market Data
  ↓ price
├─→ MA (fast) ─→ Compare ─┐
│                         ├→ AND Gate
└─→ MA (slow) ─→ Compare ─┘     ↓ boolean
                          Trade Signal
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Delete** | Remove selected connection |
| **Ctrl+Click** | Quick remove connection |
| **Mouse Wheel** | Zoom canvas (0.5x - 2x) |

---

## 🖱️ Mouse Actions

| Action | Result |
|--------|--------|
| **Left-Click Node** | Select node |
| **Left-Click + Drag** | Move node |
| **Left-Click Socket** | Start/end connection |
| **Left-Click Connection** | Select connection |
| **Right-Click Connection** | Remove connection |
| **Hover Connection** | Highlight connection |

---

## 💡 Pro Tips

### Tip 1: Test Before Automating
- Use Manual Trigger first
- Test your strategy logic
- Then switch to Period Trigger

### Tip 2: Follow the Colors
- Matching colors = compatible types
- Visual flow shows data path
- Type labels explain requirements

### Tip 3: Use Compare Nodes
- Connect indicators to Compare
- Set thresholds (e.g., RSI < 30)
- Output boolean for Trade Signal

### Tip 4: Multiple Strategies
- Create multiple trigger nodes
- Each can have different flow
- Enable/disable independently

### Tip 5: Save Your Work
- Click "Save" button regularly
- JSON file stores entire graph
- "Load" to restore saved strategy

---

## 🚨 Common Mistakes

### ❌ Mistake 1: Wrong Type Connection
**Problem**: Trying to connect incompatible types  
**Solution**: Check socket colors - they should match

### ❌ Mistake 2: No Trigger
**Problem**: Strategy never executes  
**Solution**: Add Manual or Period Trigger node

### ❌ Mistake 3: Trade Without Condition
**Problem**: Trade Signal with no input  
**Solution**: Connect boolean condition (from Compare or Logic)

### ❌ Mistake 4: Missing Market Data Input
**Problem**: Market Data not receiving trigger  
**Solution**: Connect trigger to Market Data input

---

## 🎓 Learning Path

### Beginner
1. Add Manual Trigger
2. Add Market Data (connect trigger)
3. Add Trade Signal (connect price)
4. Click Execute button

### Intermediate  
1. Add Period Trigger
2. Add Market Data + Indicator
3. Add Compare node
4. Add Trade Signal with condition
5. Enable period trigger

### Advanced
1. Multiple indicators
2. Logic gates (AND/OR)
3. Multiple conditions
4. Complex strategy flows
5. Save/load strategies

---

## 📱 UI Elements

### Left Sidebar
- **Node Library**: Click to add nodes
- **Categories**: Organized by function
- **Quick Add**: Drag or click

### Center Canvas
- **Grid**: Visual alignment guide
- **Nodes**: Drag to position
- **Connections**: Visual data flow
- **Hints**: Usage instructions at bottom

### Right Sidebar
- **Properties**: Edit selected node
- **Account Info**: Balance, equity, profit
- **Open Positions**: Current trades

### Top Toolbar
- **Connect MT5**: Start connection
- **New Trade**: Manual trade dialog
- **Show Log**: View system logs
- **Execute Strategy**: Run current graph
- **Save/Load/Clear**: Graph management

---

## 🔧 Troubleshooting

### Issue: Can't Connect Nodes
**Check**:
- Are the types compatible?
- Is input socket color matching output color?
- Is there already a connection to that input?

**Solution**: Check type colors and compatibility rules

### Issue: Trigger Not Executing
**Check**:
- Is `enabled` set to true?
- Is trigger button visible (Manual)?
- Is interval valid (Period)?

**Solution**: Check properties panel settings

### Issue: Strategy Not Working
**Check**:
- Is MT5 connected?
- Are all nodes properly connected?
- Are node parameters set correctly?

**Solution**: Test with Manual Trigger first

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `NODE_SYSTEM_SPEC.md` | Technical specification |
| `NODE_IMPROVEMENTS_SUMMARY.md` | Detailed improvements |
| `NODE_QUICK_REFERENCE.md` | This guide |
| `TRIGGER_NODES.md` | Trigger node details |
| `CHANGES.md` | Recent changes log |

---

## 🆘 Getting Help

1. **Hover over nodes** - See type information
2. **Check console log** - Error messages appear
3. **Read error messages** - They explain type mismatches
4. **Test incrementally** - Build strategy step by step
5. **Save often** - Prevent losing work

---

## ✨ Summary

### Remember:
- 🎨 **Colors = Types** - Matching colors can connect
- 🖱️ **Right-Click** - Quick way to disconnect
- ⌨️ **Delete Key** - Remove selected connection
- 🟢 **Triggers** - Required to execute strategy
- 💾 **Save** - Before testing or closing

### Happy Trading! 🚀

