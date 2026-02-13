# Cross-Exchange Arbitrage Bot (CEAB)

Kimchi premium arbitrage simulator spanning Binance and Bithumb per the CLAUDE/AGENTS technical spec. The repo mirrors the mandated folder layout and ships with simulation connectors, automation placeholders, and monitoring hooks.

## Getting Started

```bash
npm install
npm run dev
```

Populate `.env` from `.env.example` or point to `config/*.yaml` values for deployment.

## Available Scripts

- `npm run dev` – start the bot in simulation mode via `ts-node`.
- `npm run build` – compile TypeScript to `dist/`.
- `npm run start` – run the compiled bundle.
- `npm run lint` – type-check via `tsc --noEmit`.
- `npm run test` – execute the Vitest suite (unit, integration, e2e).

## Project Structure

See the “Project Folder Structure” section in `AGENTS.md`; the repository matches it verbatim (core engines, exchanges, automation, services, monitoring, configs, utils, tests, scripts, config, logs, docs).

## Deployment

Use `scripts/deploy.sh` or PM2 via `ecosystem.config.js`. Combine with `config/production.yaml` and real API credentials.
