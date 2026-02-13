import { randomUUID } from 'crypto';
import { ExecutionPlan, ExecutionResult, ExecutionLeg, Opportunity } from '../domain/models';
import { ExchangeConnector } from '../exchanges/common/exchange-interface';
import logger from '../utils/logger';

interface ExecutionEngineDeps {
  binance: ExchangeConnector;
  bithumb: ExchangeConnector;
}

export class ExecutionEngine {
  constructor(private readonly connectors: ExecutionEngineDeps) {}

  buildPlan(opportunity: Opportunity): ExecutionPlan {
    const legs: ExecutionLeg[] =
      opportunity.type === 'KIMCHI'
        ? this.buildKimchiLegs(opportunity)
        : this.buildReverseLegs(opportunity);

    return {
      id: randomUUID(),
      type: opportunity.type,
      legs,
      expectedProfit: opportunity.expectedProfit,
      status: 'PLANNED'
    };
  }

  async execute(plan: ExecutionPlan, opportunity: Opportunity): Promise<ExecutionResult> {
    logger.info({ planId: plan.id, type: plan.type }, 'Executing plan');
    plan.status = 'RUNNING';
    try {
      if (plan.type === 'KIMCHI') {
        await this.executeKimchi(opportunity);
      } else {
        await this.executeReverse(opportunity);
      }
      plan.status = 'COMPLETED';
      return { planId: plan.id, status: 'COMPLETED', realizedProfit: opportunity.expectedProfit };
    } catch (error) {
      logger.error({ planId: plan.id, error }, 'Plan execution failed');
      plan.status = 'FAILED';
      return { planId: plan.id, status: 'FAILED', error: (error as Error).message };
    }
  }

  private buildKimchiLegs(opportunity: Opportunity): ExecutionLeg[] {
    const amount = opportunity.notional;
    return [
      { description: 'Borrow BTC on Binance Margin', exchange: 'BINANCE', asset: 'BTC', amount },
      { description: 'Transfer BTC to Bithumb', exchange: 'BINANCE', asset: 'BTC', amount },
      { description: 'Sell BTC for KRW', exchange: 'BITHUMB', asset: 'BTC', amount },
      {
        description: 'Buy USDT with KRW',
        exchange: 'BITHUMB',
        asset: 'USDT',
        amount: amount * (opportunity.effectiveBithumbPrice / opportunity.binancePrice)
      },
      {
        description: 'Transfer USDT to Binance',
        exchange: 'BITHUMB',
        asset: 'USDT',
        amount: opportunity.notional * (opportunity.binancePrice / opportunity.effectiveBithumbPrice)
      },
      { description: 'Buy BTC on Binance', exchange: 'BINANCE', asset: 'BTC', amount },
      { description: 'Repay Binance loan', exchange: 'BINANCE', asset: 'BTC', amount }
    ];
  }

  private buildReverseLegs(opportunity: Opportunity): ExecutionLeg[] {
    const amount = opportunity.notional;
    return [
      { description: 'Borrow BTC on Bithumb Margin', exchange: 'BITHUMB', asset: 'BTC', amount },
      { description: 'Sell BTC for KRW', exchange: 'BITHUMB', asset: 'BTC', amount },
      {
        description: 'Buy USDT with KRW',
        exchange: 'BITHUMB',
        asset: 'USDT',
        amount: amount * (opportunity.effectiveBithumbPrice / opportunity.binancePrice)
      },
      {
        description: 'Transfer USDT to Binance',
        exchange: 'BITHUMB',
        asset: 'USDT',
        amount: opportunity.notional * (opportunity.binancePrice / opportunity.effectiveBithumbPrice)
      },
      { description: 'Buy BTC on Binance', exchange: 'BINANCE', asset: 'BTC', amount },
      { description: 'Transfer BTC back to Bithumb', exchange: 'BINANCE', asset: 'BTC', amount },
      { description: 'Repay Bithumb loan', exchange: 'BITHUMB', asset: 'BTC', amount }
    ];
  }

  private async executeKimchi(opportunity: Opportunity) {
    const { binance, bithumb } = this.connectors;
    const amount = opportunity.notional;
    const borrow = await binance.borrowAsset({ asset: 'BTC', amount });
    logger.debug({ borrow }, 'Borrowed BTC on Binance');
    await binance.transferAsset({ asset: 'BTC', amount, to: 'BITHUMB' });
    await bithumb.placeOrder({ symbol: 'BTC/KRW', side: 'SELL', amount, type: 'MARKET' });
    await bithumb.placeOrder({ symbol: 'USDT/KRW', side: 'BUY', amount: amount * opportunity.binancePrice, type: 'MARKET' });
    await bithumb.transferAsset({ asset: 'USDT', amount: opportunity.notional * opportunity.binancePrice, to: 'BINANCE' });
    await binance.placeOrder({ symbol: 'BTC/USDT', side: 'BUY', amount, type: 'MARKET' });
    await binance.repayLoan(borrow.loanId);
  }

  private async executeReverse(opportunity: Opportunity) {
    const { binance, bithumb } = this.connectors;
    const amount = opportunity.notional;
    const borrow = await bithumb.borrowAsset({ asset: 'BTC', amount });
    await bithumb.placeOrder({ symbol: 'BTC/KRW', side: 'SELL', amount, type: 'MARKET' });
    await bithumb.placeOrder({ symbol: 'USDT/KRW', side: 'BUY', amount: amount * opportunity.binancePrice, type: 'MARKET' });
    await bithumb.transferAsset({ asset: 'USDT', amount: opportunity.notional * opportunity.binancePrice, to: 'BINANCE' });
    await binance.placeOrder({ symbol: 'BTC/USDT', side: 'BUY', amount, type: 'MARKET' });
    await binance.transferAsset({ asset: 'BTC', amount, to: 'BITHUMB' });
    await bithumb.repayLoan(borrow.loanId);
  }
}
