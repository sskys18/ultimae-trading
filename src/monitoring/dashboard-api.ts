import { PositionManager } from '../core/position-manager';
import { MetricsCollector } from './metrics-collector';

export class DashboardApi {
  constructor(private readonly positions: PositionManager, private readonly metrics: MetricsCollector) {}

  getState() {
    return {
      positions: this.positions.snapshot(),
      metrics: {
        executions: this.metrics.recent('executions'),
        premiums: this.metrics.recent('premium-bps')
      }
    };
  }
}
