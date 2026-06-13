import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  // Simple counters for demo; replace with prom-client
  private counters = new Map<string, number>();

  inc(name: string, value = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }

  snapshot() {
    return Array.from(this.counters.entries()).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, number>);
  }
}
