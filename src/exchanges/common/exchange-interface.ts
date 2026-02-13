import { OrderBook } from '../../domain/models';
import { OrderSide, OrderType } from './order-types';

export interface BorrowRequest {
  asset: string;
  amount: number;
}

export interface BorrowResponse {
  loanId: string;
  interestRate: number;
  timestamp: Date;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  amount: number;
  price?: number;
  type: OrderType;
}

export interface OrderResponse {
  orderId: string;
  filledAmount: number;
  avgPrice: number;
  feePaid: number;
}

export interface TransferRequest {
  asset: string;
  amount: number;
  to: string;
}

export interface TransferResponse {
  transferId: string;
  etaSeconds: number;
}

export interface ExchangeConnector {
  readonly name: string;
  fetchOrderBook(symbol: string): Promise<OrderBook>;
  borrowAsset(request: BorrowRequest): Promise<BorrowResponse>;
  placeOrder(request: OrderRequest): Promise<OrderResponse>;
  transferAsset(request: TransferRequest): Promise<TransferResponse>;
  repayLoan(loanId: string): Promise<void>;
}
