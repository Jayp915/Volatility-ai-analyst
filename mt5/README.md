# Nextrade AI MT5 Expert Advisor

## File
`Nextrade_AI_EA.mq5` — approval-only Expert Advisor for MetaTrader 5.

## Strategy logic
1. Finds confirmed swing highs/lows using a configurable left/right fractal wing.
2. Detects BOS or CHoCH only after a candle closes beyond the latest confirmed swing.
3. Waits for price to retest the broken level.
4. Requires a retest candle to touch the level and close directionally back beyond it.
5. Shows an approval prompt on the chart. It does not send an order until the user clicks **APPROVE TRADE**.
6. On approval, recalculates entry, stop distance, broker minimum stop distance and lot size. It skips trades if the minimum broker lot would exceed the risk budget.

## Default controls
- Risk: 0.25% of account balance per trade.
- Reward:risk: 2:1.
- ATR: 14 periods.
- Retest expiry: 6 closed bars.
- Stop buffer: 0.15 ATR.
- Minimum/maximum stop distance: 0.50–3.00 ATR.
- One position per symbol; manual and other-EA positions on the same symbol also block entry.
- No automatic execution mode.

## Install in MT5
1. Open MetaTrader 5 → File → Open Data Folder.
2. Open `MQL5/Experts`.
3. Copy `Nextrade_AI_EA.mq5` into that folder.
4. Open MetaEditor, compile the file, and check the Errors tab.
5. Attach the EA to a Deriv Volatility Index chart and the timeframe you want to test.
6. Enable Algo Trading only when you are ready to test. The EA still waits for the chart's **APPROVE TRADE** button before every order.
7. Start on a Deriv demo account. Verify the symbol's contract size, minimum volume, volume step, tick value, stops level and execution behaviour.

## Important limitations before live use
- This source has not yet been compiled in MetaEditor or validated on a Deriv MT5 demo account. A successful GitHub commit is not a compile or execution test.
- BOS/CHoCH structure detection is a first implementation using confirmed fractal pivots; it needs chart-by-chart review and tuning.
- This version uses a simple directional candle close for retest confirmation. It does not yet implement the full web dashboard's multi-timeframe ranking, market-quality scoring, or advanced candle-pattern confirmation.
- The EA is attached to one chart/symbol/timeframe at a time.
- Risk sizing uses MT5 `OrderCalcProfit` for the entry-to-stop loss estimate and rounds volume down to broker steps. Commissions, slippage and gaps can still make realised loss exceed the planned amount.
- Broker rejection, market closure, price movement and unsupported filling modes can prevent an order.
- Do not use on a live account until it compiles cleanly, passes Strategy Tester checks, and completes substantial demo forward testing.

This is an initial EA implementation for controlled testing, not a claim of profitability or financial advice.
