import { sleep } from './time-utils';

export interface RetryOptions {
  attempts: number;
  delayMs: number;
  backoffFactor?: number;
}

export const retry = async <T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> => {
  let attempt = 0;
  let delay = options.delayMs;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt >= options.attempts) {
        throw error;
      }
      await sleep(delay);
      delay *= options.backoffFactor ?? 1;
    }
  }
};
