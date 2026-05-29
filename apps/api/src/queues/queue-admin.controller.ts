import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { SAFETY_REPORTS_QUEUE } from './queue-names';

const EMPTY_COUNTS = {
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
};

@SkipThrottle({ global: true })
@Roles(Role.ADMIN)
@Controller('admin/queues')
export class QueueAdminController {
  constructor(
    @InjectQueue(SAFETY_REPORTS_QUEUE)
    private readonly queue: Queue,
  ) {}

  @Get('stats')
  async stats() {
    // When REDIS_URL is unset, SafetyReportsModule provides a stub queue without
    // BullMQ's Queue methods. Return zeros so the UI can still render.
    if (typeof (this.queue as Queue).getJobCounts !== 'function') {
      return {
        queue: SAFETY_REPORTS_QUEUE,
        enabled: false,
        counts: EMPTY_COUNTS,
      };
    }
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );
    return {
      queue: SAFETY_REPORTS_QUEUE,
      enabled: true,
      counts: { ...EMPTY_COUNTS, ...counts },
    };
  }
}
