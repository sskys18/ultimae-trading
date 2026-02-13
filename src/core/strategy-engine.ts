import { randomUUID } from 'crypto';
import { MarketSnapshot, Opportunity } from '../domain/models';
import { premiumBps, round } from '../utils/math-utils';

export interface StrategyConfig {
  premiumThresholdBps: number;
  reverseThresholdBps: number;
  notionalBtc: number;
  feeRateBps?: number;
}

export class StrategyEngine {
  constructor(private readonly config: StrategyConfig) {}

  evaluate(snapshot: MarketSnapshot): Opportunity | null {
    const effectiveBithumbPrice = snapshot.bithumbBtcKrw / snapshot.krwPerUsdt;
    const premium = premiumBps(effectiveBithumbPrice, snapshot.binanceBtcUsdt);
    const notional = this.config.notionalBtc;

    if (premium >= this.config.premiumThresholdBps) {
      return this.buildOpportunity('KIMCHI', premium, snapshot, notional, effectiveBithumbPrice);
    }
    if (premium <= -this.config.reverseThresholdBps) {
      return this.buildOpportunity('REVERSE', premium, snapshot, notional, effectiveBithumbPrice);
    }
    return null;
  }

  private buildOpportunity(
    type: Opportunity['type'],
    premium: number,
    snapshot: MarketSnapshot,
    notional: number,
    effectiveBithumbPrice: number
  ): Opportunity {
    const gross = (Math.abs(premium) / 10000) * snapshot.binanceBtcUsdt * notional;
    const fees = (this.config.feeRateBps ?? 15) / 10000 * snapshot.binanceBtcUsdt * notional * 2;
    return {
      id: randomUUID(),
      type,
      premium,
      effectiveBithumbPrice,
      binancePrice: snapshot.binanceBtcUsdt,
      notional,
      expectedProfit: round(gross - fees, 2)
    };
  }
}
