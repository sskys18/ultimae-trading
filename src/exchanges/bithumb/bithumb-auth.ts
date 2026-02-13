import { signPayload } from '../../utils/crypto-utils';

export const signBithumbRequest = (secret: string, payload: Record<string, unknown>) =>
  signPayload(secret, JSON.stringify(payload));
