import { readFileSync } from 'fs';
import { z } from 'zod';

export const APP_NAME = 'Cross-Exchange Arbitrage Bot';
export const DEFAULT_POLL_INTERVAL_MS = 2000;
export const DEFAULT_PREMIUM_THRESHOLD_BPS = 120;
export const DEFAULT_REVERSE_THRESHOLD_BPS = 120;
export const DEFAULT_NOTIONAL_BTC = 0.5;
export const DEFAULT_NOTIONAL_USDT = 50000;
export const DEFAULT_MAX_OPEN_POSITIONS = 2;
export const DEFAULT_MAX_LOAN_USD = 200000;
export const DEFAULT_MAX_TRANSFER_USD = 50000;
export const FX_BASE_RATE = 1350;
export const FX_RANDOM_SPREAD = 25;
export const HEALTH_CHECK_PORT = 4600;
export const DASHBOARD_PORT = 4700;
export const TELEGRAM_DEFAULT_CHAT = 'local-sandbox';
export const RETRY_BACKOFF_MS = [500, 1000, 2000];
export const EXECUTION_FEE_BPS = 15;

const CONFIG_PATH = new URL('../../config/runtime.json', import.meta.url);

const schema = z.object({
  appName: z.string(),
  mode: z.enum(['SIMULATION', 'LIVE']).default('SIMULATION'),
  premiumThresholdBps: z.number().int().positive(),
  reverseThresholdBps: z.number().int().positive(),
  pollIntervalMs: z.number().int().min(250),
  notional: z.object({
    btc: z.number().positive(),
    usdt: z.number().positive()
  }),
  feeRateBps: z.number().positive(),
  riskLimits: z.object({
    maxOpenPositions: z.number().int().positive(),
    maxLoanUsd: z.number().positive(),
    maxTransferExposureUsd: z.number().positive()
  }),
  connectors: z.object({
    binance: z.object({
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
      baseUrl: z.string()
    }),
    bithumb: z.object({
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
      baseUrl: z.string()
    })
  }),
  telemetry: z.object({
    enableConsole: z.boolean(),
    enableFile: z.boolean(),
    telegramChatId: z.string()
  })
});

export type AppConfig = z.infer<typeof schema>;

const defaultConfig: AppConfig = {
  appName: APP_NAME,
  mode: 'SIMULATION',
  premiumThresholdBps: DEFAULT_PREMIUM_THRESHOLD_BPS,
  reverseThresholdBps: DEFAULT_REVERSE_THRESHOLD_BPS,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  notional: {
    btc: DEFAULT_NOTIONAL_BTC,
    usdt: DEFAULT_NOTIONAL_USDT
  },
  feeRateBps: EXECUTION_FEE_BPS,
  riskLimits: {
    maxOpenPositions: DEFAULT_MAX_OPEN_POSITIONS,
    maxLoanUsd: DEFAULT_MAX_LOAN_USD,
    maxTransferExposureUsd: DEFAULT_MAX_TRANSFER_USD
  },
  connectors: {
    binance: {
      baseUrl: 'https://api.binance.com'
    },
    bithumb: {
      baseUrl: 'https://global-openapi.bithumb.pro'
    }
  },
  telemetry: {
    enableConsole: true,
    enableFile: false,
    telegramChatId: TELEGRAM_DEFAULT_CHAT
  }
};

const readOverrides = (): Partial<AppConfig> => {
  try {
    const payload = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(payload) as Partial<AppConfig>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Failed to read config/runtime.json:', error);
    }
    return {};
  }
};

const overrides = readOverrides();

const config = schema.parse({
  ...defaultConfig,
  ...overrides,
  notional: {
    ...defaultConfig.notional,
    ...(overrides.notional ?? {})
  },
  riskLimits: {
    ...defaultConfig.riskLimits,
    ...(overrides.riskLimits ?? {})
  },
  connectors: {
    binance: {
      ...defaultConfig.connectors.binance,
      ...(overrides.connectors?.binance ?? {})
    },
    bithumb: {
      ...defaultConfig.connectors.bithumb,
      ...(overrides.connectors?.bithumb ?? {})
    }
  },
  telemetry: {
    ...defaultConfig.telemetry,
    ...(overrides.telemetry ?? {})
  }
});

export const loadConfig = (): AppConfig => config;

export default config;
