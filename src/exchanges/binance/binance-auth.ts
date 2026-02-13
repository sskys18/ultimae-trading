import { signPayload } from '../../utils/crypto-utils';

export const signBinanceRequest = (secret: string, payload: Record<string, string | number>) => {
  const query = Object.entries(payload)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return signPayload(secret, query);
};
