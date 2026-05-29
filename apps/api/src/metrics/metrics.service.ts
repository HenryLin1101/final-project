import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry: client.Registry;
  private readonly httpRequestsTotal: client.Counter<
    'method' | 'route' | 'status_code'
  >;
  private readonly httpRequestDuration: client.Histogram<
    'method' | 'route' | 'status_code'
  >;

  constructor() {
    this.registry = new client.Registry();
    client.collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
  }

  recordRequest(
    method: string,
    route: string,
    statusCode: string,
    durationSec: number,
  ): void {
    const labels = { method, route, status_code: statusCode };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationSec);
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
