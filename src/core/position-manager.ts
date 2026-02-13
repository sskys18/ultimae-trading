import { Position } from '../domain/models';
import { randomUUID } from 'crypto';

export class PositionManager {
  private positions = new Map<string, Position>();

  open(planId: string, type: Position['type']): Position {
    const position: Position = {
      id: randomUUID(),
      planId,
      type,
      status: 'OPEN',
      openTime: new Date(),
      loans: [],
      transfers: []
    };
    this.positions.set(planId, position);
    return position;
  }

  close(planId: string, pnl: number) {
    const position = this.positions.get(planId);
    if (!position) {
      return;
    }
    position.status = 'CLOSED';
    position.closeTime = new Date();
    position.pnl = pnl;
  }

  snapshot() {
    return Array.from(this.positions.values());
  }
}
