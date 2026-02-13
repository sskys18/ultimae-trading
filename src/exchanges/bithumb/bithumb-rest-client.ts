import axios, { AxiosInstance } from 'axios';
import { signBithumbRequest } from './bithumb-auth';

export class BithumbRestClient {
  private readonly http: AxiosInstance;

  constructor(private readonly apiKey: string | undefined, private readonly apiSecret: string | undefined, baseUrl: string) {
    this.http = axios.create({ baseURL: baseUrl, timeout: 5000 });
  }

  async postPrivate<T>(path: string, body: Record<string, unknown>): Promise<T> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Bithumb credentials missing');
    }
    const signature = signBithumbRequest(this.apiSecret, body);
    const response = await this.http.post<T>(path, body, {
      headers: {
        'Api-Key': this.apiKey,
        'Api-Sign': signature
      }
    });
    return response.data;
  }
}
