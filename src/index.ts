import config from './config/config';
import logger from './utils/logger';
import { BinanceConnector } from './exchanges/binance/binance-connector';
import { BithumbConnector } from './exchanges/bithumb/bithumb-connector';
import { MarketDataService } from './services/market-data-service';
import { StrategyEngine } from './core/strategy-engine';
import { ExecutionEngine } from './core/execution-engine';
import { RiskManager } from './core/risk-manager';
import { PositionManager } from './core/position-manager';
import { AlertService } from './services/alert-service';
import { TelegramBot } from './monitoring/telegram-bot';
import { MetricsCollector } from './monitoring/metrics-collector';
import { HealthCheckServer } from './monitoring/health-check';
import { DashboardApi } from './monitoring/dashboard-api';
import { TransferTracker } from './services/transfer-tracker';

const bootstrap = () => {
  const binance = new BinanceConnector(config);
  const bithumb = new BithumbConnector(config);
  const marketService = new MarketDataService(binance, bithumb, config.pollIntervalMs);
  const strategy = new StrategyEngine({
    premiumThresholdBps: config.premiumThresholdBps,
    reverseThresholdBps: config.reverseThresholdBps,
    notionalBtc: config.notional.btc,
    feeRateBps: config.feeRateBps
  });
  const risk = new RiskManager(config.riskLimits);
  const execution = new ExecutionEngine({ binance, bithumb });
  const positions = new PositionManager();
  const trackers = new TransferTracker();
  const alerts = new AlertService(new TelegramBot(config.telemetry.telegramChatId));
  const metrics = new MetricsCollector();
  const health = new HealthCheckServer(risk);
  const dashboard = new DashboardApi(positions, metrics);

  marketService.on('snapshot', async snapshot => {
    metrics.push('premium-bps', snapshot.bithumbBtcKrw - snapshot.binanceBtcUsdt);
    const opportunity = strategy.evaluate(snapshot);
    if (!opportunity) {
      return;
    }

    const riskDecision = risk.evaluate(opportunity);
    if (!riskDecision.allow) {
      await alerts.sendOpportunityBlocked(riskDecision.reason ?? 'unknown');
      return;
    }

    const plan = execution.buildPlan(opportunity);
    positions.open(plan.id, plan.type);
    risk.registerOpen(opportunity);
    const result = await execution.execute(plan, opportunity);
    risk.registerClose(opportunity, result.realizedProfit ?? 0);
    positions.close(plan.id, result.realizedProfit ?? 0);
    metrics.push('executions', result.status === 'COMPLETED' ? 1 : 0);
    await alerts.sendExecutionResult(plan.id, result.status, result.realizedProfit);
  });

  marketService.on('error', error => {
    logger.error({ error }, 'Market data error');
  });

  trackers.on('confirmed', transfer => {
    logger.info({ transfer }, 'Transfer confirmed');
  });

  health.start();
  marketService.start();

  logger.info({ mode: config.mode, dashboard: dashboard.getState() }, 'Arbitrage bot started');
};

process.on('unhandledRejection', reason => {
  logger.error({ reason }, 'Unhandled rejection');
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, exiting');
  process.exit(0);
});

bootstrap();
