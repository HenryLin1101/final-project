import { DynamicModule, Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { SafetyReportsService } from './safety-reports.service';
import { SafetyReportsController } from './safety-reports.controller';
import { SafetyReportsProcessor } from './safety-reports.processor';
import { ScopeModule } from '../scope/scope.module';
import { AuditModule } from '../audit/audit.module';
import { MetricsModule } from '../metrics/metrics.module';
import { SAFETY_REPORTS_QUEUE } from '../queues/queue-names';
import { QueueAdminController } from '../queues/queue-admin.controller';

// When REDIS_URL is unset (e.g. CI e2e), we register a no-op queue stub so the
// controller's @InjectQueue resolves, AND skip registering SafetyReportsProcessor
// so BullExplorer doesn't spawn a real Worker that crashes on ECONNREFUSED.
@Module({})
export class SafetyReportsModule {
  static register(): DynamicModule {
    const queueEnabled = !!process.env.REDIS_URL;

    if (queueEnabled) {
      return {
        module: SafetyReportsModule,
        imports: [
          ScopeModule,
          AuditModule,
          MetricsModule,
          BullModule.registerQueue({ name: SAFETY_REPORTS_QUEUE }),
        ],
        controllers: [SafetyReportsController, QueueAdminController],
        providers: [SafetyReportsService, SafetyReportsProcessor],
      };
    }

    return {
      module: SafetyReportsModule,
      imports: [ScopeModule, AuditModule, MetricsModule],
      controllers: [SafetyReportsController, QueueAdminController],
      providers: [
        SafetyReportsService,
        {
          provide: getQueueToken(SAFETY_REPORTS_QUEUE),
          useValue: {
            add: async (name: string) => ({ id: `stub-${name}-${Date.now()}` }),
          },
        },
      ],
    };
  }
}
