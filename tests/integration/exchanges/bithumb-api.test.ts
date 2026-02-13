import { describe, expect, it } from 'vitest';
import { BithumbConnector } from '../../../src/exchanges/bithumb/bithumb-connector';
import config from '../../../src/config/config';

describe('BithumbConnector', () => {
  it('fetches simulated order book', async () => {
    const connector = new BithumbConnector(config);
    const book = await connector.fetchOrderBook('BTC/KRW');
    expect(book.asks.length).toBeGreaterThan(0);
  });
});
