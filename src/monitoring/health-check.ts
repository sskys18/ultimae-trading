import http from 'http';
import { HEALTH_CHECK_PORT } from '../config/config';
import { RiskManager } from '../core/risk-manager';

export class HealthCheckServer {
  private server: http.Server | undefined;

  constructor(private readonly riskManager: RiskManager) {}

  start() {
    this.server = http.createServer((_req, res) => {
      const snapshot = this.riskManager.snapshot();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(snapshot));
    });
    this.server.listen(HEALTH_CHECK_PORT);
  }

  stop() {
    this.server?.close();
  }
}
