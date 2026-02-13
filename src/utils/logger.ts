import pino from 'pino';
import config from '../config/config';

const transports = [] as pino.TransportSingleOptions[];

if (config.telemetry.enableConsole) {
  transports.push({
    target: 'pino-pretty',
    options: { colorize: true }
  });
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: transports.length ? { targets: transports } : undefined
});

export default logger;
