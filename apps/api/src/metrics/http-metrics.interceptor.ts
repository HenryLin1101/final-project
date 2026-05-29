import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      route?: { path: string };
    }>();
    const res = context.switchToHttp().getResponse<{ statusCode: number }>();
    const startMs = Date.now();
    // Skip self-referential / infrastructure paths:
    //  - /metrics: Prometheus scrape feedback loop
    //  - /health, /health/ready: K8s probes hitting every few seconds
    //  - /admin/queues/*: the admin monitor page polls these every 2s and
    //    would otherwise inflate its own counters (observer effect).
    if (
      req.url.startsWith('/metrics') ||
      req.url.startsWith('/health') ||
      req.url.startsWith('/api/v1/admin/queues')
    ) {
      return next.handle();
    }

    const record = (statusCode: string) => {
      const method = req.method;
      const route = req.route?.path ?? req.url;
      const durationSec = (Date.now() - startMs) / 1000;
      this.metricsService.recordRequest(method, route, statusCode, durationSec);
    };

    return next.handle().pipe(
      tap(() => record(String(res.statusCode))),
      catchError((err: unknown) => {
        // HttpExceptions carry a numeric .status; fallback to 500
        const status =
          (err as { status?: number })?.status ??
          (err as { statusCode?: number })?.statusCode ??
          500;
        record(String(status));
        return throwError(() => err);
      }),
    );
  }
}
