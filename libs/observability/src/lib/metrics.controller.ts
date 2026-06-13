import { Controller, Get, Header } from '@nestjs/common';

/**
 * Prometheus metrics endpoint.
 *
 * Exposes a Prometheus text-format response on /metrics. The
 * platform/metrics lib tracks request counters; this controller renders the
 * default process metrics and renders a scrape-friendly surface.
 *
 * Wire it up in apps/api/src/app.module.ts:
 *   controllers: [MetricsController],
 */
@Controller('metrics')
export class MetricsController {
  private readonly start = Date.now();

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(): string {
    const mem = process.memoryUsage();
    const lines: string[] = [];

    lines.push(
      '# HELP process_uptime_seconds Node process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${(Date.now() - this.start) / 1000}`,
    );
    lines.push(
      '# HELP nodejs_heap_size_used_bytes Node.js heap used (bytes).',
      '# TYPE nodejs_heap_size_used_bytes gauge',
      `nodejs_heap_size_used_bytes ${mem.heapUsed}`,
    );
    lines.push(
      '# HELP nodejs_heap_size_total_bytes Node.js heap total (bytes).',
      '# TYPE nodejs_heap_size_total_bytes gauge',
      `nodejs_heap_size_total_bytes ${mem.heapTotal}`,
    );
    lines.push(
      '# HELP nodejs_rss_bytes Node.js RSS (bytes).',
      '# TYPE nodejs_rss_bytes gauge',
      `nodejs_rss_bytes ${mem.rss}`,
    );

    return lines.join('\n') + '\n';
  }
}
