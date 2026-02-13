# Troubleshooting

## No Opportunities Triggering
- Verify FX rate feed (`MarketDataService`) outputs realistic KRW/USDT values.
- Confirm thresholds in `config/*.yaml` are not overly high.

## Risk Blocks All Trades
- Inspect `RiskManager.snapshot()` via health endpoint.
- Adjust `riskLimits` or close stale positions.

## Telegram Alerts Missing
- Ensure `TELEGRAM_CHAT_ID` and bot token are valid.
- Check logs under `logs/errors` for `AlertService` failures.
