import { AppConfig } from '../../config/config';
import {
  ExchangeConnector,
  BorrowRequest,
  BorrowResponse,
  OrderRequest,
  OrderResponse,
  TransferRequest,
  TransferResponse
} from '../common/exchange-interface';
import { SimulatedExchangeConnector } from '../common/simulated-exchange';
import { OrderBook } from '../../domain/models';

export const BINANCE_PAIRS = {
  BTC_USDT: {
    symbol: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    minNotional: 0.001,
    precision: 4
  }
} as const;

export class BinanceConnector implements ExchangeConnector {
  private readonly delegate: ExchangeConnector;

  constructor(config: AppConfig) {
    // Live REST client plumbing would replace this delegate when API keys are supplied.
    this.delegate = new SimulatedExchangeConnector({ name: 'BINANCE', basePrice: 63000 });
  }

  get name() {
    return 'BINANCE' as const;
  }

  fetchOrderBook(symbol: string): Promise<OrderBook> {
    return this.delegate.fetchOrderBook(symbol);
  }

  borrowAsset(request: BorrowRequest): Promise<BorrowResponse> {
    return this.delegate.borrowAsset(request);
  }

  placeOrder(request: OrderRequest): Promise<OrderResponse> {
    return this.delegate.placeOrder(request);
  }

  transferAsset(request: TransferRequest): Promise<TransferResponse> {
    return this.delegate.transferAsset(request);
  }

  repayLoan(loanId: string): Promise<void> {
    return this.delegate.repayLoan(loanId);
  }
}

export type BinancePair = keyof typeof BINANCE_PAIRS;

export const getBinancePair = (pair: BinancePair) => BINANCE_PAIRS[pair];
