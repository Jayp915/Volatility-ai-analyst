# Volatility AI Analyst V5.0

## Core strategy
- Closed-candle BOS/CHoCH breakout detection.
- Breakout → retest (maximum 10 completed candles) → later closed-candle confirmation.
- Reject invalidated, stale, or overextended setups.
- Balanced structure-quality and multi-timeframe scoring.
- Scan detected Deriv Volatility indices across seven timeframes and rank by structure-quality score.
- Track signals against subsequent closed candles; same-candle stop/target ambiguity is conservatively counted as a loss.
- WebSocket heartbeat, stale-connection watchdog, and exponential reconnect handling.

## Trading controls
- This browser analyst is research/signal software; it does not place broker orders.
- The separate Deriv MT5 EA remains manual-approval only with 0.25% initial risk per trade.

## Validation status
- Source assembled from the latest retest-engine upgrade branch.
- Not yet independently browser-tested against a live Deriv session.
- Historical signal tracking is not a verified walk-forward backtest and does not establish profitability.
- Demo-test before relying on any signal.