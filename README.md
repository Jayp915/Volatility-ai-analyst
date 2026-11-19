# Nextrade AI V5.0

A browser-based, analysis-only dashboard for Deriv Volatility Indices.

## Features
- Public Deriv WebSocket market-data connection (no account token required).
- Automatic discovery of active Volatility markets.
- Live tick display and multi-timeframe candle retrieval.
- EMA trend alignment, RSI, ATR and recent-range support/resistance estimates.
- Closed-candle BOS/CHoCH breakout → retest → confirmation signal logic.
- Market-structure quality scoring and multi-timeframe alignment.
- Signal tracking against later closed candles.
- Connection heartbeat, stale-connection watchdog and automatic reconnect.

## Open the live app
https://jayp915.github.io/Volatility-ai-analyst/

## Deploy with GitHub Pages
The workflow in `.github/workflows/pages.yml` deploys the repository root on pushes to `main`.
In GitHub, open **Settings → Pages**, choose **GitHub Actions** as the build and deployment source if prompted, then check **Actions** for the deployment result.

## Important
Nextrade AI is analysis and signal software; it does not submit broker orders. It is not financial advice and the strategy is not yet independently validated as profitable. Historical signal tracking is not a substitute for a proper out-of-sample walk-forward backtest. Verify all signals on Deriv and test on demo before live trading.
