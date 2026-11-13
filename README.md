# Volatility AI — Deriv Market Analyst

A browser-based, analysis-only dashboard for Deriv Volatility Indices.

## Features
- Public Deriv WebSocket market-data connection (no account token required).
- Automatic discovery of active Volatility markets.
- Live tick display and multi-timeframe candle retrieval.
- EMA trend alignment, RSI, ATR and recent-range support/resistance estimates.
- Rule-based BUY SETUP / SELL SETUP / WAIT assessment with an explanatory checklist.
- Illustrative entry, stop and 2R target; no orders are ever submitted.

## Deploy with GitHub Pages
The workflow in `.github/workflows/pages.yml` deploys the repository root on pushes to `main`.
In GitHub, open **Settings → Pages**, choose **GitHub Actions** as the build and deployment source if prompted, then check **Actions** for the deployment result.

The site URL should be:
https://jayp915.github.io/Volatility-ai-analyst/

## Important
This is a rule-based technical-analysis prototype, not financial advice and not a validated profitable strategy. Support/resistance are estimates from recent candles. It does not inspect order flow, guarantee fills, or place trades. Verify all signals on Deriv MT5/Deriv Trader and test on demo first.
