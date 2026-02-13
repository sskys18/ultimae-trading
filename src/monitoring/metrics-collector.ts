import { MetricSample } from '../domain/models';

export class MetricsCollector {
  private samples: MetricSample[] = [];

  push(name: string, value: number) {
    this.samples.push({ name, value, timestamp: Date.now() });
    if (this.samples.length > 1000) {
      this.samples.shift();
    }
  }

  recent(name: string) {
    return this.samples.filter(sample => sample.name === name);
  }
}
