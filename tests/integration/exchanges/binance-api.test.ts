import { describe, expect, it } from 'vitest';
import { BinanceConnector } from '../../../src/exchanges/binance/binance-connector';
import config from '../../../src/config/config';

describe('BinanceConnector', () => {
  it('fetches simulated order book', async () => {
    const connector = new BinanceConnector(config);
    const book = await connector.fetchOrderBook('BTC/USDT');
    expect(book.asks.length).toBeGreaterThan(0);
  });
});
