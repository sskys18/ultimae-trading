import { AlertPayload } from '../domain/models';
import { TelegramBot } from '../monitoring/telegram-bot';
import logger from '../utils/logger';

export class AlertService {
  constructor(private readonly bot: TelegramBot) {}

  async send(alert: AlertPayload) {
    logger.info({ alert }, 'Dispatching alert');
    try {
      await this.bot.sendMessage(`*${alert.title}*\n${alert.message}`, alert.severity);
    } catch (error) {
      logger.error({ error }, 'Failed to send alert');
    }
  }

  async sendOpportunityBlocked(reason: string) {
    await this.send({
      title: 'Opportunity blocked',
      message: `Risk manager vetoed plan: ${reason}`,
      severity: 'warning'
    });
  }

  async sendExecutionResult(planId: string, status: string, profit?: number) {
    const suffix = profit !== undefined ? `profit=${profit.toFixed(2)}` : 'no profit data';
    await this.send({
      title: `Execution ${status}`,
      message: `plan=${planId} ${suffix}`,
      severity: status === 'COMPLETED' ? 'info' : 'critical'
    });
  }
}
