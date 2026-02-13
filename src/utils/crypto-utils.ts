import { createHmac } from 'crypto';

export const signPayload = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('hex');
