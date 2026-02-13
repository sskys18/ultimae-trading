export type Exchange = 'BINANCE' | 'BITHUMB';

export interface OrderBook {
  exchange: Exchange;
  symbol: string;
  bids: Array<[price: number, amount: number]>;
  asks: Array<[price: number, amount: number]>;
  timestamp: Date;
}

export interface Transfer {
  id: string;
  from: Exchange;
  to: Exchange;
  asset: string;
  amount: number;
  txHash?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  confirmations: number;
  estimatedTime: number;
  timestamp: Date;
  actualTime?: number;
}

export interface Loan {
  id: string;
  exchange: Exchange;
  asset: string;
  amount: number;
  interestRate: number;
  borrowTime: Date;
  repayTime?: Date;
  status: 'ACTIVE' | 'REPAID';
  accruedInterest: number;
}

export interface PositionLeg {
  exchange: Exchange;
  price: number;
  amount: number;
  fees: number;
}

export interface Position {
  id: string;
  planId: string;
  type: 'KIMCHI' | 'REVERSE';
  status: 'OPEN' | 'CLOSING' | 'CLOSED';
  openTime: Date;
  closeTime?: Date;
  entry?: PositionLeg;
  exit?: PositionLeg;
  loans: Loan[];
  transfers: Transfer[];
  pnl?: number;
}

export interface MarketSnapshot {
  timestamp: Date;
  binanceBtcUsdt: number;
  bithumbBtcKrw: number;
  krwPerUsdt: number;
}

export interface Opportunity {
  id: string;
  type: 'KIMCHI' | 'REVERSE';
  premium: number;
  effectiveBithumbPrice: number;
  binancePrice: number;
  notional: number;
  expectedProfit: number;
}

export interface ExecutionLeg {
  description: string;
  exchange: Exchange;
  asset: string;
  amount: number;
}

export interface ExecutionPlan {
  id: string;
  type: Opportunity['type'];
  legs: ExecutionLeg[];
  expectedProfit: number;
  status: 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

export interface ExecutionResult {
  planId: string;
  status: ExecutionPlan['status'];
  realizedProfit?: number;
  error?: string;
}

export interface RiskSnapshot {
  timestamp: Date;
  totalLoansUsd: number;
  transferExposureUsd: number;
  openPositions: number;
  healthy: boolean;
  notes?: string;
}

export interface AlertPayload {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface MetricSample {
  timestamp: number;
  name: string;
  value: number;
}
