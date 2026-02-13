# Testing Guide

## Unit Tests
- Located in `tests/unit`.
- Run with `npm run test -- tests/unit`.

## Integration Tests
- Exchange adapters: `tests/integration/exchanges/*`.
- Automation flows: `tests/integration/automation/*`.
- Strategy flows: `tests/integration/flows/*`.

## End-to-End
- `tests/e2e/full-cycle.test.ts` and `paper-trading.test.ts` simulate complete arbitrage loops.
- Execute with `npm run test -- tests/e2e` in simulation mode.
