# Simulator Mode - Practice Trading Without Risk

## Overview

Simulator Mode allows you to practice trading strategies using **real MT5 market data** without executing actual trades. All positions are stored locally on your disk, and profit/loss is calculated based on live market prices.

## Features

✅ **Real Market Data**: Fetches live prices from MT5  
✅ **Local Position Storage**: Positions saved in `simulator_positions.json`  
✅ **P&L Calculation**: Real-time profit/loss based on current market prices  
✅ **Full Trading Features**: Open, close, modify positions with SL/TP  
✅ **Auto TP/SL Execution**: Automatically closes positions when TP or SL is hit  
✅ **Trade History**: Track closed positions and performance  
✅ **Risk-Free Practice**: Perfect for testing strategies without financial risk  

## How to Use

### 1. Enable Simulator Mode

1. Click **⚙ Settings** in the toolbar
2. In the **General** tab, find the **🎮 Simulator Mode** section
3. Change **Trading Mode** dropdown to **"Simulator Mode (Practice)"**
4. The mode will activate immediately

### 2. Simulator Indicator

When simulator mode is active, you'll see:
- A **🎮 SIMULATOR MODE** badge in the top-right corner
- Simulated positions marked with a **SIM** badge
- Green border on simulator positions

### 3. Trading in Simulator Mode

Trade exactly as you would in real mode:
- Click **New Trade** to open positions
- Use the **Node Editor** to run strategies
- All trades will be simulated instead of sent to MT5

### 4. Monitor Performance

In Settings → General → Simulator Mode section, view:
- **Open Positions**: Current simulated positions
- **Closed Positions**: Historical trades
- **Balance**: Starting balance + closed P&L
- **Equity**: Balance + open position P&L
- **Profit**: Current unrealized P&L

### 5. Reset Simulator

To start fresh:
1. Go to Settings → General → Simulator Mode
2. Set desired starting balance (default: $10,000)
3. Click **Reset Simulator**
4. Confirms and clears all positions and history

## Technical Details

### Position Storage

Positions are stored in `simulator_positions.json` with:
```json
{
  "positions": [...],
  "closed_positions": [...],
  "next_ticket": 1000000,
  "initial_balance": 10000.0,
  "last_updated": "2025-10-22T..."
}
```

### Ticket Numbers

- Simulator positions use ticket numbers ≥ 1,000,000
- Real MT5 positions use lower ticket numbers
- This prevents conflicts between modes

### Price Updates

- Positions update prices every time you refresh
- Uses real MT5 bid/ask prices
- P&L calculated as: `(current_price - open_price) * volume * contract_size`

### TP/SL Auto-Execution

The simulator automatically:
- Checks if current price hits TP or SL
- Closes positions when targets are reached
- Records the close reason in history

## Use Cases

### 1. Strategy Testing
Test your trading strategies without risk before going live.

### 2. Learning
Practice trading mechanics and understand how P&L works.

### 3. Backtesting Alternative
While not true backtesting, you can practice on live data.

### 4. Demo Account Alternative
No need for MT5 demo account - practice directly in the app.

## Switching Between Modes

### From Real to Simulator
- Existing real positions remain in MT5
- New trades will be simulated
- Can switch back anytime

### From Simulator to Real
- Simulated positions remain stored locally
- New trades will execute on MT5
- Simulator positions don't affect real account

## Important Notes

⚠️ **Simulator positions are NOT real trades**  
⚠️ **Switching modes doesn't close existing positions**  
⚠️ **Simulator data is stored locally - backup if needed**  
⚠️ **Slippage and execution delays are not simulated**  
⚠️ **Spreads are based on current MT5 data**  

## Files Created

- `simulator_positions.json` - Position storage
- `simulator.py` - Simulator logic (Python)

## API Methods

### Toggle Simulator Mode
```javascript
await window.mt5API.toggleSimulatorMode(true/false);
```

### Get Simulator Status
```javascript
const status = await window.mt5API.getSimulatorStatus();
// Returns: { simulator_mode, positions_count, closed_positions_count, account_summary }
```

### Reset Simulator
```javascript
await window.mt5API.resetSimulator(initialBalance);
```

## Troubleshooting

### Positions not updating
- Ensure MT5 is connected
- Check that symbols are available in MT5
- Refresh positions manually

### Can't switch modes
- Ensure you're connected to MT5
- Check console for errors
- Restart the application if needed

### Lost simulator data
- Check for `simulator_positions.json` in app directory
- File is created on first simulated trade
- Backup this file to preserve history

## Future Enhancements

Potential improvements:
- [ ] Slippage simulation
- [ ] Commission/swap calculation
- [ ] Export simulator history to CSV
- [ ] Performance analytics dashboard
- [ ] Multiple simulator accounts
- [ ] Replay historical data

---

**Happy practicing! 🎮📈**
