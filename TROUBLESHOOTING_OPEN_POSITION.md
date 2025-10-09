# Troubleshooting: Open Position Node Not Executing

## Quick Diagnosis

I've added enhanced logging and a test function to help diagnose the issue.

### Step 1: Open Developer Console

1. In your Electron app, press `Ctrl+Shift+I` (Windows) or `Cmd+Option+I` (Mac)
2. Go to the **Console** tab

### Step 2: Run the Test Function

In the console, type:
```javascript
// Test open position functionality
window.testOpenPositionNode()

// Test modify position functionality
window.testModifyPositionNode()

// Test modify position with specific parameters
window.testModifyPositionNode(123456789, 1.08000, 1.09000)
```

This will:
- ✅ Check if MT5 is connected
- ✅ Check if Open Position nodes exist
- ✅ Test overtrade control
- ✅ Validate configuration
- ✅ Show detailed logs at each step

### Step 3: Check the Output

The test will show you exactly where the problem is:

#### Possible Issues:

**1. MT5 Not Connected**
```
❌ MT5 is not connected! Please connect to MT5 first.
```
**Solution:** Click the "Connect to MT5" button and enter your credentials.

---

**2. No Open Position Nodes**
```
❌ No Open Position nodes found!
```
**Solution:** Add an "Open Position" node from the Trading section in the node palette.

---

**3. Overtrade Control Blocking**
```
⚠️ Trade blocked by overtrade control
```
**Solution:** 
- Check your open positions count
- Go to Settings → Overtrade Control
- Increase the max trades limit or disable overtrade control temporarily

---

**4. MT5 API Error**
```
❌ Trade execution failed
Error: Symbol EURUSD not found
```
**Solution:**
- Make sure the symbol exists in your MT5 Market Watch
- Check if the symbol name is correct (e.g., "EURUSD" vs "EURUSDm")
- Verify your MT5 account has permission to trade this symbol

---

**5. Insufficient Margin**
```
❌ Trade execution failed
Error: Not enough money
```
**Solution:**
- Reduce the volume (lot size)
- Check your account balance
- Close some existing positions

---

## Step 4: Run Your Strategy

Once the test passes, try running your actual strategy:

1. Make sure you have:
   - A **Trigger** node
   - An **Open Position** node
   - A connection between them

2. Click **"Run Strategy"**
3. Choose **"Execute Once"** for testing
4. Click **"Run Strategy"**

### Watch the Console

With the enhanced logging, you'll now see detailed output like:

```
=== TRADE-SIGNAL NODE EXECUTION START ===
Node params: {action: "BUY", symbol: "EURUSD", volume: 0.1, ...}
MT5 API available: true
Overtrade control available: true
MT5 API found, preparing order...
Checking overtrade control...
Overtrade control result: true
Sending order to MT5...
✓ Trade executed successfully via node: {ticket: 12345, price: 1.0850}
=== TRADE-SIGNAL NODE EXECUTION END ===
```

## Common Issues and Solutions

### Issue: "MT5 API not available"

**Check:**
```javascript
console.log('MT5 API:', window.mt5API);
console.log('Connected:', isConnected);
```

**Solution:** Restart the app and reconnect to MT5.

---

### Issue: Trade executes but no message appears

**Check:** Look for the green checkmark or red X on the node (appears for 2 seconds after execution)

---

### Issue: Modal appears asking to proceed

This is **normal** if you've reached your overtrade limit. Click "Proceed with Trade" to continue.

---

## Advanced Debugging

### Check Node Execution Flow

```javascript
// See all nodes
console.log('All nodes:', nodeEditor.nodes);

// See all connections
console.log('Connections:', nodeEditor.connections);

// Check if trigger is connected to trade node
const trigger = nodeEditor.nodes.find(n => n.type === 'trigger');
const tradeNode = nodeEditor.nodes.find(n => n.type === 'trade-signal');
const connection = nodeEditor.connections.find(c => c.from === trigger && c.to === tradeNode);
console.log('Trigger connected to trade node:', !!connection);
```

### Check MT5 Connection Status

```javascript
// Test MT5 connection
const accountInfo = await window.mt5API.getAccountInfo();
console.log('Account info:', accountInfo);

// Test symbol
const symbolInfo = await window.mt5API.getSymbolInfo('EURUSD');
console.log('Symbol info:', symbolInfo);
```

### Check Overtrade Control Status

```javascript
window.overtradeControl.getDetailedStatus()
```

## Still Not Working?

If the test function passes but your strategy still doesn't work:

1. **Check your node connections** - Make sure the Trigger node is connected to the Open Position node
2. **Check trigger settings** - Make sure the Trigger node is enabled
3. **Check the strategy execution mode** - Try "Execute Once" first before using periodic execution
4. **Check the console for errors** - Look for any red error messages

## Need More Help?

Share the console output from the relevant test function and any error messages you see:
- `window.testOpenPositionNode()` for open position issues
- `window.testModifyPositionNode()` for modify position issues
