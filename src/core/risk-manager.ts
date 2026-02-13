import { Opportunity, RiskSnapshot } from '../domain/models';

export interface RiskConfig {
  maxOpenPositions: number;
  maxLoanUsd: number;
  maxTransferExposureUsd: number;
}

export interface RiskDecision {
  allow: boolean;
  reason?: string;
}

export class RiskManager {
  private openPositions = 0;
  private outstandingLoanUsd = 0;
  private transferExposureUsd = 0;

  constructor(private readonly config: RiskConfig) {}

  evaluate(opportunity: Opportunity): RiskDecision {
    const notionalUsd = opportunity.notional * opportunity.binancePrice;
    if (this.openPositions >= this.config.maxOpenPositions) {
      return { allow: false, reason: 'max_open_positions' };
    }
    if (this.outstandingLoanUsd + notionalUsd > this.config.maxLoanUsd) {
      return { allow: false, reason: 'max_loan_exposure' };
    }
    if (this.transferExposureUsd + notionalUsd > this.config.maxTransferExposureUsd) {
      return { allow: false, reason: 'max_transfer_exposure' };
    }
    if (opportunity.expectedProfit <= 0) {
      return { allow: false, reason: 'non_positive_profit' };
    }
    return { allow: true };
  }

  registerOpen(opportunity: Opportunity) {
    const notionalUsd = opportunity.notional * opportunity.binancePrice;
    this.openPositions += 1;
    this.outstandingLoanUsd += notionalUsd;
    this.transferExposureUsd += notionalUsd;
  }

  registerClose(opportunity: Opportunity, realizedProfitUsd: number) {
    const notionalUsd = opportunity.notional * opportunity.binancePrice;
    this.openPositions = Math.max(0, this.openPositions - 1);
    this.outstandingLoanUsd = Math.max(0, this.outstandingLoanUsd - notionalUsd);
    this.transferExposureUsd = Math.max(0, this.transferExposureUsd - notionalUsd);
    return realizedProfitUsd;
  }

  snapshot(): RiskSnapshot {
    const healthy =
      this.openPositions <= this.config.maxOpenPositions &&
      this.outstandingLoanUsd <= this.config.maxLoanUsd &&
      this.transferExposureUsd <= this.config.maxTransferExposureUsd;

    return {
      timestamp: new Date(),
      totalLoansUsd: this.outstandingLoanUsd,
      transferExposureUsd: this.transferExposureUsd,
      openPositions: this.openPositions,
      healthy
    };
  }
}
