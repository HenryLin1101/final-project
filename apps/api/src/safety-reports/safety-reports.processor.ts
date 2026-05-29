import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SafetyReportsService } from './safety-reports.service';
import { SAFETY_REPORTS_QUEUE } from '../queues/queue-names';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { SubmitSafetyReportDto } from './dto/submit-safety-report.dto';

export interface SubmitReportJob {
  eventId: string;
  actor: AuthUser;
  dto: SubmitSafetyReportDto;
}

// NOTE: For production, deploy this processor as a separate worker Deployment
// (with its own image command pointing at a worker entrypoint) to enable
// independent scaling and fault isolation from the HTTP API.
@Processor(SAFETY_REPORTS_QUEUE)
export class SafetyReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(SafetyReportsProcessor.name);

  constructor(private readonly reports: SafetyReportsService) {
    super();
  }

  async process(job: Job<SubmitReportJob>) {
    if (job.name === 'submit') {
      this.logger.log(
        `Processing submit job ${job.id} for event ${job.data.eventId}`,
      );
      return this.reports.submit(
        job.data.eventId,
        job.data.actor,
        job.data.dto,
      );
    }
    throw new Error(`Unknown job name: ${job.name}`);
  }
}
