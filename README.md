# Nextrade AI V5.1 — Reliability Edition

Browser-based, analysis-only research and market-structure dashboard for Deriv Volatility Indices.

## V5.1 reliability work
- Added the missing Donchian research engine referenced by the dashboard.
- Reproducible historical simulation: 20-bar breakout, completed 4H EMA 50/200 trend filter, next-bar-open entry, 2× ATR initial stop and 10-bar channel exit.
- Explicit modelled cost of 0.05 ATR per completed trade. This is a research assumption, not a measured Deriv spread or commission.
- Candle validation, duplicate-timestamp normalization and chronological ordering inside the research engine.
- Added Node automated tests; GitHub Pages build is gated on tests passing.
- Analysis-only: no broker order placement or account credentials.

## Research limitations
This engine is an initial reproducible baseline, not proof of profitability. It uses a single historical sample, fixed parameters and a simplified cost model. It does not model tick-level stop ordering, slippage, variable spreads, market impact or all execution constraints. Results must be followed by walk-forward/out-of-sample and demo forward testing before any live-money use.

## Open the app
https://jayp915.github.io/Volatility-ai-analyst/

## Deployment
GitHub Actions runs the strategy-engine test suite on pushes. GitHub Pages deployment is allowed only from main after tests pass. Set Settings → Pages → GitHub Actions if prompted.
