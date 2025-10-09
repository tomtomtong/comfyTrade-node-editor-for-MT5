# Test Buttons Guide

## Overview

Each trading node now has a **Test Button** that lets you test its functionality before running your full strategy. This helps you catch errors early and understand what's happening.

## Available Test Buttons

### 🧪 Test Condition (Conditional Check Node)
### 🧪 Test Condition (Conditional Check Node)
- Tests if condition evaluates to TRUE or FALSE
- Shows current price and comparison
- Indicates if trigger will continue or stop

### 🧪 Test Logic (AND/OR Gate Nodes)
- Shows connected inputs
- Explains gate behavior with truth table
- Helps understand multi-condition logic

### 🧪 Test Close (Close Position Node)
- Tests position closure functionality
- Works with specific tickets or "close all"
- Shows detailed results for each position

### 🧪 Test Modify (Modify Position Node)
- Tests SL/TP modification
- Validates values before execution
- Shows clear success/error messages



### 🧪 Test Close (Close Position Node)

**Location:** Properties panel when a Close Position node is selected

**What it does:**
- Validates MT5 connection
- Checks if position exists
- Closes the specified position or all positions
- Shows detailed results

**When to use:**
- To verify a position can be closed
- To test "close all" functionality
- Before adding to your strategy

**Example output:**
```
✅ Position Closed Successfully!

Ticket: 123456789
```

**For "Close All" mode:**
```
Close All Results:

✅ Closed ticket 123456789
✅ Closed ticket 123456790
❌ Failed ticket 123456791: Position not found

Success: 2
Failed: 1
```

---

### 🧪 Test Condition (Conditional Check Node)

**Location:** Properties panel when a Conditional Check node is selected

**What it does:**
- Gets current price from MT5
- Evaluates the condition (price or percentage change)
- Shows whether condition passes (TRUE) or fails (FALSE)
- Displays detailed comparison

**When to use:**
- To verify your condition logic is correct
- To check if current market conditions would trigger
- To debug why your strategy isn't executing
- To understand when the condition will pass

**Example output (Price Check):**
```
💰 Price Check

Symbol: EURUSD
Current Price: 1.08500
Target Price: 1.08000

Condition: 1.08500 > 1.08000

✅ CONDITION PASSED!

The trigger will continue to the next node.
Connected nodes will be executed.
```

**Example output (Percentage Change):**
```
📊 Percentage Change Check

Symbol: EURUSD
Timeframe: M1
Current Price: 1.08500
Percentage Change: 0.0234%

Condition: 0.0234% > 0.02%

✅ CONDITION PASSED!

The trigger will continue to the next node.
Connected nodes will be executed.
```

**Failed condition:**
```
❌ CONDITION FAILED!

The trigger will STOP here.
Connected nodes will NOT be executed.
```

**Common errors and solutions:**

| Error | Solution |
|-------|----------|
| No symbol specified | Enter a symbol in node properties |
| Could not get current price | Check symbol name in Market Watch |
| Could not get percentage change | Check timeframe and historical data |
| MT5 not connected | Connect to MT5 first |

---

### 🧪 Test Logic (AND/OR Gate Nodes)

**Location:** Properties panel when an AND Gate or OR Gate node is selected

**What it does:**
- Shows how many inputs are connected
- Explains the logic gate behavior
- Displays truth table
- Provides usage examples

**When to use:**
- To verify inputs are connected correctly
- To understand how the gate will behave
- To learn the difference between AND and OR
- Before running complex multi-condition strategies

**Example output (AND Gate):**
```
🔌 AND Gate Configuration

Connected Inputs: 2

Input 1: Conditional Check (conditional-check)
Input 2: Conditional Check (conditional-check)

📋 How AND Gate Works:

AND Gate: ALL inputs must be TRUE
• If Input1 = TRUE and Input2 = TRUE → Output = TRUE ✅
• If Input1 = TRUE and Input2 = FALSE → Output = FALSE ❌
• If Input1 = FALSE and Input2 = TRUE → Output = FALSE ❌
• If Input1 = FALSE and Input2 = FALSE → Output = FALSE ❌

Use Case: Execute trade only if BOTH conditions are met
Example: Price > 1.08 AND RSI < 30
```

**Example output (OR Gate):**
```
🔌 OR Gate Configuration

Connected Inputs: 2

Input 1: Conditional Check (conditional-check)
Input 2: Conditional Check (conditional-check)

📋 How OR Gate Works:

OR Gate: ANY input can be TRUE
• If Input1 = TRUE and Input2 = TRUE → Output = TRUE ✅
• If Input1 = TRUE and Input2 = FALSE → Output = TRUE ✅
• If Input1 = FALSE and Input2 = TRUE → Output = TRUE ✅
• If Input1 = FALSE and Input2 = FALSE → Output = FALSE ❌

Use Case: Execute trade if EITHER condition is met
Example: Price > 1.08 OR Price < 1.06
```

---

### 🧪 Test Modify (Modify Position Node)

**Location:** Properties panel when a Modify Position node is selected

**What it does:**
- Validates MT5 connection
- Checks if position exists and is valid
- Validates SL/TP values against current price and position type
- Performs comprehensive pre-modification checks
- Modifies Stop Loss and Take Profit
- Shows detailed before/after comparison

**When to use:**
- To verify SL/TP values are valid for the position type
- To test modification before adding to strategy
- To check if values are too close to current price
- To validate position still exists before modification

**Enhanced validation checks:**
- Position existence and validity
- SL/TP direction validation (BUY vs SELL positions)
- Price level reasonableness
- Minimum distance requirements

**Example output (Success):**
```
✅ Position Modified Successfully!

Ticket: 123456789
Symbol: EURUSD
Type: BUY
Volume: 0.10

Changes:
Stop Loss: 1.07500 → 1.08000
Take Profit: None → 1.09000

💡 The position has been successfully updated in MT5.
```

**Example output (Validation Error):**
```
❌ Validation Errors:

• Stop Loss (1.09000) must be below current price (1.08500) for BUY positions
• Take Profit (1.07000) must be above current price (1.08500) for BUY positions

💡 Current Position Info:
Symbol: EURUSD
Type: BUY
Current Price: 1.08500
Current SL: 1.07500
Current TP: None
```

---

## How to Use Test Buttons

### Step 1: Select a Node
Click on any trading node (Open Position, Close Position, or Modify Position) in the canvas.

### Step 2: Configure Parameters
In the properties panel on the right, set your parameters:
- **Open Position:** Symbol, Action (BUY/SELL), Volume
- **Close Position:** Ticket or "Close All"
- **Modify Position:** Ticket, Stop Loss, Take Profit

### Step 3: Click Test Button
Click the test button for that node type:
- 🧪 **Test Condition** - for Conditional Check
- 🧪 **Test Logic** - for AND/OR Gates
- 🧪 **Test Close** - for Close Position
- 🧪 **Test Modify** - for Modify Position

### Step 4: Review Results
A modal will appear showing:
- ✅ Success message with details
- ❌ Error message with explanation and solutions

### Step 5: Fix Issues (if any)
If the test fails, the error message will tell you:
- What went wrong
- Why it happened
- How to fix it

### Step 6: Run Your Strategy
Once the test passes, you can confidently run your full strategy!

---

## Benefits of Testing

### 1. **Catch Errors Early**
Find configuration issues before running your strategy.

### 2. **Understand Behavior**
See exactly what will happen when the node executes.

### 3. **Verify Connection**
Confirm MT5 is connected and working properly.

### 4. **Save Time**
No need to run the full strategy to test one node.

### 5. **Learn from Errors**
Detailed error messages help you understand MT5 trading.

---

## Test vs. Strategy Execution

| Aspect | Test Button | Strategy Execution |
|--------|-------------|-------------------|
| Tests conditions | ✅ Yes (safe) | ✅ Yes |
| Tests logic gates | ✅ Yes (safe) | ✅ Yes |
| Tests position closure | ✅ Yes (real action) | ✅ Yes (real action) |
| Tests position modification | ✅ Yes (real action) | ✅ Yes (real action) |
| Shows detailed feedback | ✅ Yes (modal) | ⚠️ Limited (console) |
| Requires trigger | ❌ No | ✅ Yes |
| Follows connections | ❌ No | ✅ Yes |

**Note:** Some test buttons perform real actions (close/modify positions). Condition and logic tests are safe.

---

## Tips

### 💡 Test in Order
1. Test Conditional Check first (safe)
2. Test Logic Gates (safe)
3. Test Close/Modify Position (real actions)

### 💡 Safe Testing
Condition and Logic tests are safe - they don't execute trades or modify positions.

### 💡 Check Console
Open Developer Console (`Ctrl+Shift+I`) to see detailed logs.

### 💡 Test After Changes
Re-test whenever you change node parameters.

### 💡 Test Connection
If tests fail, check MT5 connection status first.

---

## Troubleshooting

### Test button doesn't appear
- Make sure you've selected the correct node type
- Check that the properties panel is visible

### Test button is grayed out
- This shouldn't happen - try restarting the app

### Modal doesn't show
- Check browser console for errors
- Try clicking the test button again

### Test passes but strategy fails
- Check node connections
- Verify trigger node is enabled
- Check overtrade control settings

---

## Example Workflow

```
1. Add Open Position node to canvas
2. Select the node
3. Configure:
   - Symbol: EURUSD
   - Action: BUY
   - Volume: 0.01
4. Click "🧪 Test Condition" (for conditional check)
5. Review result:
   ✅ Condition passed!
6. Add Close Position node
7. Select ticket from dropdown
8. Click "🧪 Test Close"
9. Review result:
   ✅ Position closed!
10. Now connect nodes and run strategy
```

---

## Console Debug Functions

For advanced testing and debugging, you can use these console functions:

### `window.testModifyPositionNode(ticketId, stopLoss, takeProfit)`

**Purpose:** Test modify position functionality from console with custom parameters

**Parameters:**
- `ticketId` (optional): Specific position ticket to test with
- `stopLoss` (optional): Custom stop loss value
- `takeProfit` (optional): Custom take profit value

**Usage examples:**
```javascript
// Test with first available position (auto-calculated SL/TP)
window.testModifyPositionNode()

// Test specific position with auto-calculated SL/TP
window.testModifyPositionNode(123456789)

// Test with custom SL/TP values
window.testModifyPositionNode(123456789, 1.08000, 1.09000)

// Test with only stop loss
window.testModifyPositionNode(123456789, 1.08000, null)
```

**What it does:**
- Lists all available positions
- Validates parameters comprehensively
- Calculates reasonable default values if not provided
- Shows detailed before/after comparison
- Provides extensive logging for debugging

**When to use:**
- When you need to test with specific values
- For debugging position modification issues
- To understand how SL/TP validation works
- When the UI test button isn't sufficient

---

## Need Help?

If you encounter issues:
1. Check the error message in the modal
2. Look at the console logs (`Ctrl+Shift+I`)
3. Try the console debug functions for more detailed information
4. Verify MT5 connection
5. Check `TROUBLESHOOTING_OPEN_POSITION.md` for detailed help
