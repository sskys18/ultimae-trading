import EventEmitter from 'eventemitter3';
import { ExchangeConnector } from '../exchanges/common/exchange-interface';
import { MarketSnapshot } from '../domain/models';
import { FX_BASE_RATE, FX_RANDOM_SPREAD } from '../config/config';

export type MarketDataEvents = {
  snapshot: [MarketSnapshot];
  error: [Error];
};

export class MarketDataService extends EventEmitter<MarketDataEvents> {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly binance: ExchangeConnector,
    private readonly bithumb: ExchangeConnector,
    private readonly pollIntervalMs: number
  ) {
    super();
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(async () => {
      try {
        const snapshot = await this.fetchSnapshot();
        this.emit('snapshot', snapshot);
      } catch (error) {
        this.emit('error', error as Error);
      }
    }, this.pollIntervalMs);
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async fetchSnapshot(): Promise<MarketSnapshot> {
    const [binanceBook, bithumbBook] = await Promise.all([
      this.binance.fetchOrderBook('BTC/USDT'),
      this.bithumb.fetchOrderBook('BTC/KRW')
    ]);

    const binancePrice = binanceBook.asks[0]?.[0] ?? 0;
    const bithumbPrice = bithumbBook.asks[0]?.[0] ?? 0;
    const krwPerUsdt = this.estimateKrwPerUsdt();

    return {
      timestamp: new Date(),
      binanceBtcUsdt: binancePrice,
      bithumbBtcKrw: bithumbPrice,
      krwPerUsdt
    };
  }

  private estimateKrwPerUsdt(): number {
    const delta = Math.random() * FX_RANDOM_SPREAD - FX_RANDOM_SPREAD / 2;
    return Number((FX_BASE_RATE + delta).toFixed(2));
  }
}
