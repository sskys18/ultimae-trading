export interface BinanceOrderResponse {
  orderId: number;
  status: string;
  executedQty: string;
  cummulativeQuoteQty: string;
}

export interface BinanceBorrowResponse {
  tranId: number;
  interestRate: string;
}
