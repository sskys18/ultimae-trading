import { describe, expect, it } from 'vitest';
import { BinanceConnector } from '../../../src/exchanges/binance/binance-connector';
import { BithumbConnector } from '../../../src/exchanges/bithumb/bithumb-connector';
import config from '../../../src/config/config';

const binance = new BinanceConnector(config);
const bithumb = new BithumbConnector(config);

describe('Cross-exchange spreads', () => {
  it('computes simulated premium', async () => {
    const [binanceBook, bithumbBook] = await Promise.all([
      binance.fetchOrderBook('BTC/USDT'),
      bithumb.fetchOrderBook('BTC/KRW')
    ]);
    const effectiveBithumb = bithumbBook.asks[0][0] / 1350;
    const premium = ((effectiveBithumb - binanceBook.asks[0][0]) / binanceBook.asks[0][0]) * 10000;
    expect(Number.isFinite(premium)).toBe(true);
  });
});
