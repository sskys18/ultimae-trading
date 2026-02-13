import { randomUUID } from 'crypto';
import { ExchangeConnector, BorrowRequest, BorrowResponse, OrderRequest, OrderResponse, TransferRequest, TransferResponse } from './exchange-interface';
import { OrderBook } from '../../domain/models';
import { Exchange } from '../../domain/models';

interface Options {
  name: Exchange;
  basePrice: number;
  volatilityBps?: number;
}

const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

export class SimulatedExchangeConnector implements ExchangeConnector {
  readonly name: Exchange;
  private basePrice: number;
  private volatilityBps: number;

  constructor(options: Options) {
    this.name = options.name;
    this.basePrice = options.basePrice;
    this.volatilityBps = options.volatilityBps ?? 25;
  }

  async fetchOrderBook(symbol: string): Promise<OrderBook> {
    const mid = this.basePrice * (1 + randomInRange(-this.volatilityBps, this.volatilityBps) / 10000);
    const spread = mid * 0.0003;
    const bid = mid - spread;
    const ask = mid + spread;
    return {
      exchange: this.name,
      symbol,
      bids: [[Number(bid.toFixed(2)), 1]],
      asks: [[Number(ask.toFixed(2)), 1]],
      timestamp: new Date()
    };
  }

  async borrowAsset(_request: BorrowRequest): Promise<BorrowResponse> {
    return {
      loanId: randomUUID(),
      interestRate: 0.0001,
      timestamp: new Date()
    };
  }

  async placeOrder(request: OrderRequest): Promise<OrderResponse> {
    const price = request.price ?? this.basePrice;
    return {
      orderId: randomUUID(),
      filledAmount: request.amount,
      avgPrice: price,
      feePaid: request.amount * price * 0.0005
    };
  }

  async transferAsset(_request: TransferRequest): Promise<TransferResponse> {
    return {
      transferId: randomUUID(),
      etaSeconds: 600
    };
  }

  async repayLoan(_loanId: string): Promise<void> {
    return;
  }
}
