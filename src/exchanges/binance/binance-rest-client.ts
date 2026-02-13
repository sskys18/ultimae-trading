import axios, { AxiosInstance } from 'axios';
import { signBinanceRequest } from './binance-auth';

export class BinanceRestClient {
  private readonly http: AxiosInstance;

  constructor(private readonly apiKey: string | undefined, private readonly apiSecret: string | undefined, baseUrl: string) {
    this.http = axios.create({ baseURL: baseUrl, timeout: 5000 });
  }

  async getPublic<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.http.get<T>(path, { params });
    return response.data;
  }

  async postPrivate<T>(path: string, body: Record<string, unknown>): Promise<T> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Binance credentials missing');
    }
    const signature = signBinanceRequest(this.apiSecret, body as Record<string, string | number>);
    const response = await this.http.post<T>(path, body, {
      headers: { 'X-MBX-APIKEY': this.apiKey },
      params: { signature }
    });
    return response.data;
  }
}
