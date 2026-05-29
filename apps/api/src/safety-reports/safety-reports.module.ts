import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SafetyReportsService } from './safety-reports.service';
import { SafetyReportsController } from './safety-reports.controller';
import { SafetyReportsProcessor } from './safety-reports.processor';
import { ScopeModule } from '../scope/scope.module';
import { AuditModule } from '../audit/audit.module';
import { SAFETY_REPORTS_QUEUE } from '../queues/queue-names';

@Module({
  imports: [
    ScopeModule,
    AuditModule,
    BullModule.registerQueue({ name: SAFETY_REPORTS_QUEUE }),
  ],
  controllers: [SafetyReportsController],
  providers: [SafetyReportsService, SafetyReportsProcessor],
})
export class SafetyReportsModule {}
