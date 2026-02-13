import { describe, expect, it } from 'vitest';
import { StrategyEngine } from '../../../src/core/strategy-engine';
import { ExecutionEngine } from '../../../src/core/execution-engine';
import { RiskManager } from '../../../src/core/risk-manager';
import { BinanceConnector } from '../../../src/exchanges/binance/binance-connector';
import { BithumbConnector } from '../../../src/exchanges/bithumb/bithumb-connector';
import config from '../../../src/config/config';

const snapshot = {
  timestamp: new Date(),
  binanceBtcUsdt: 60000,
  bithumbBtcKrw: 55000 * 1350,
  krwPerUsdt: 1350
};

describe('Reverse flow', () => {
  it('runs reverse premium execution path', async () => {
    const strategy = new StrategyEngine({
      premiumThresholdBps: 50,
      reverseThresholdBps: 50,
      notionalBtc: 0.1
    });
    const opportunity = strategy.evaluate(snapshot as any);
    if (!opportunity) {
      throw new Error('expected reverse opportunity');
    }
    const risk = new RiskManager(config.riskLimits);
    const decision = risk.evaluate(opportunity);
    expect(decision.allow).toBe(true);
    const execution = new ExecutionEngine({
      binance: new BinanceConnector(config),
      bithumb: new BithumbConnector(config)
    });
    const plan = execution.buildPlan(opportunity);
    const result = await execution.execute(plan, opportunity);
    expect(result.status).toBe('COMPLETED');
  });
});
