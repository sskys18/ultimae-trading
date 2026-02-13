import config from '../src/config/config';
import { BinanceConnector } from '../src/exchanges/binance/binance-connector';
import { BithumbConnector } from '../src/exchanges/bithumb/bithumb-connector';

const run = async () => {
  const binance = new BinanceConnector(config);
  const bithumb = new BithumbConnector(config);
  const [binanceBook, bithumbBook] = await Promise.all([
    binance.fetchOrderBook('BTC/USDT'),
    bithumb.fetchOrderBook('BTC/KRW')
  ]);
  console.log('Binance ask', binanceBook.asks[0]);
  console.log('Bithumb ask', bithumbBook.asks[0]);
};

run();
