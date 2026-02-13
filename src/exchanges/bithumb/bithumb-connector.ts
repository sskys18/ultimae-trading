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

export const BITHUMB_PAIRS = {
  BTC_KRW: {
    symbol: 'BTC/KRW',
    base: 'BTC',
    quote: 'KRW',
    minNotional: 0.001,
    precision: 4
  },
  USDT_KRW: {
    symbol: 'USDT/KRW',
    base: 'USDT',
    quote: 'KRW',
    minNotional: 10,
    precision: 2
  }
} as const;

export class BithumbConnector implements ExchangeConnector {
  private readonly delegate: ExchangeConnector;

  constructor(config: AppConfig) {
    this.delegate = new SimulatedExchangeConnector({ name: 'BITHUMB', basePrice: 85000000 });
  }

  get name() {
    return 'BITHUMB' as const;
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

export type BithumbPair = keyof typeof BITHUMB_PAIRS;

export const getBithumbPair = (pair: BithumbPair) => BITHUMB_PAIRS[pair];
