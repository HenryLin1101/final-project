import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

export type MetricsSummary = {
  pod: string;
  uptime_seconds: number;
  requests: {
    total: number;
    by_status: Record<string, number>;
  };
  latency_seconds: {
    avg: number;
    p95: number;
  };
  memory_mb: number;
};

@Injectable()
export class MetricsService {
  private readonly registry: client.Registry;
  private readonly httpRequestsTotal: client.Counter<
    'method' | 'route' | 'status_code'
  >;
  private readonly httpRequestDuration: client.Histogram<
    'method' | 'route' | 'status_code'
  >;
  private readonly bootedAt = Date.now();

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

  // JSON snapshot for the admin dashboard. Reads from the same prom-client
  // registry that powers /metrics — values reflect this Pod only, so under HPA
  // numbers round-robin (acceptable for a single-pane demo view).
  async summary(): Promise<MetricsSummary> {
    const counterSnapshot = await this.httpRequestsTotal.get();
    const histogramSnapshot = await this.httpRequestDuration.get();

    let total = 0;
    const byStatus: Record<string, number> = {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
    };
    for (const v of counterSnapshot.values) {
      total += v.value;
      const code = String(v.labels.status_code ?? '');
      const bucket = `${code[0] ?? '?'}xx`;
      if (bucket in byStatus) byStatus[bucket] += v.value;
    }

    let durationSum = 0;
    let durationCount = 0;
    const bucketCounts = new Map<number, number>();
    for (const v of histogramSnapshot.values) {
      const name = String(v.metricName ?? '');
      if (name.endsWith('_sum')) {
        durationSum += v.value;
      } else if (name.endsWith('_count')) {
        durationCount += v.value;
      } else {
        const labels = v.labels as Record<string, string | number | undefined>;
        if (labels.le !== undefined) {
          const le = Number(labels.le);
          if (!Number.isNaN(le)) {
            bucketCounts.set(le, (bucketCounts.get(le) ?? 0) + v.value);
          }
        }
      }
    }

    let p95 = 0;
    if (durationCount > 0 && bucketCounts.size > 0) {
      const target = durationCount * 0.95;
      const sortedBuckets = [...bucketCounts.entries()].sort(
        (a, b) => a[0] - b[0],
      );
      for (const [le, cumulative] of sortedBuckets) {
        if (cumulative >= target) {
          p95 = le;
          break;
        }
      }
      if (p95 === 0) {
        p95 = sortedBuckets[sortedBuckets.length - 1][0];
      }
    }

    return {
      // HOSTNAME is set by K8s to the Pod name; falls back to OS hostname locally.
      pod: process.env.HOSTNAME ?? 'local',
      uptime_seconds: Math.floor((Date.now() - this.bootedAt) / 1000),
      requests: { total, by_status: byStatus },
      latency_seconds: {
        avg: durationCount > 0 ? durationSum / durationCount : 0,
        p95,
      },
      memory_mb:
        Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10,
    };
  }
}
