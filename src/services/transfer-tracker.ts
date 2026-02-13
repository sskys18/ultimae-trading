import EventEmitter from 'eventemitter3';
import { Transfer } from '../domain/models';

export type TransferTrackerEvents = {
  created: [Transfer];
  confirmed: [Transfer];
  failed: [Transfer];
};

export class TransferTracker extends EventEmitter<TransferTrackerEvents> {
  private transfers = new Map<string, Transfer>();

  track(transfer: Transfer) {
    this.transfers.set(transfer.id, transfer);
    this.emit('created', transfer);
  }

  updateStatus(id: string, status: Transfer['status']) {
    const transfer = this.transfers.get(id);
    if (!transfer) {
      return;
    }
    transfer.status = status;
    if (status === 'CONFIRMED') {
      transfer.actualTime = Date.now() - transfer.timestamp.getTime();
      this.emit('confirmed', transfer);
    }
    if (status === 'FAILED') {
      this.emit('failed', transfer);
    }
  }
}
