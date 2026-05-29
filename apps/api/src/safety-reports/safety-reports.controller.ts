import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { SafetyReportsService } from './safety-reports.service';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SubmitSafetyReportDto } from './dto/submit-safety-report.dto';
import { SAFETY_REPORTS_QUEUE } from '../queues/queue-names';
import { SubmitReportJob } from './safety-reports.processor';

@Controller('events/:eventId')
export class SafetyReportsController {
  constructor(
    private readonly reports: SafetyReportsService,
    @InjectQueue(SAFETY_REPORTS_QUEUE)
    private readonly queue: Queue<SubmitReportJob>,
  ) {}

  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ global: { ttl: 60000, limit: 10 } })
  @Post('reports')
  @Roles(Role.EMPLOYEE, Role.MANAGER)
  async submit(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitSafetyReportDto,
  ) {
    const job = await this.queue.add(
      'submit',
      { eventId, actor: user, dto },
      {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    return {
      status: 'accepted',
      jobId: job.id,
      eventId,
      submitted: { status: dto.status, message: dto.message },
    };
  }

  @Get('reports/me')
  getMine(@Param('eventId') eventId: string, @CurrentUser() user: AuthUser) {
    return this.reports.getMine(eventId, user);
  }

  @Get('reports/team')
  @Roles(Role.MANAGER)
  listTeam(@Param('eventId') eventId: string, @CurrentUser() user: AuthUser) {
    return this.reports.listTeam(eventId, user);
  }

  @Get('reports')
  @Roles(Role.ADMIN)
  listAll(@Param('eventId') eventId: string, @CurrentUser() user: AuthUser) {
    return this.reports.listAll(eventId, user);
  }

  @Get('stats')
  stats(@Param('eventId') eventId: string, @CurrentUser() user: AuthUser) {
    return this.reports.stats(eventId, user);
  }
}
