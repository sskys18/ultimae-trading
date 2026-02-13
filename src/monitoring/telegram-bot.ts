import logger from '../utils/logger';

export class TelegramBot {
  constructor(private readonly chatId: string) {}

  async sendMessage(message: string, severity: string) {
    logger.info({ chatId: this.chatId, severity }, message);
  }
}
