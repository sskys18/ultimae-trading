# Deployment Guide

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment**
   - Copy `config/production.yaml` to your secrets store.
   - Export API keys: `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BITHUMB_API_KEY`, `BITHUMB_API_SECRET`.
3. **Build artifacts**
   ```bash
   npm run build
   ```
4. **Launch service**
   ```bash
   npm run start
   ```
5. **Monitoring**
   - Health: `curl localhost:4600`.
   - Telegram alerts configured via `TELEGRAM_CHAT_ID`.
