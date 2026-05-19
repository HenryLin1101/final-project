import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { SafetyReportsService } from './safety-reports.service';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SubmitSafetyReportDto } from './dto/submit-safety-report.dto';

@Controller('events/:eventId')
export class SafetyReportsController {
  constructor(private readonly reports: SafetyReportsService) {}

  @Throttle({ global: { ttl: 60000, limit: 10 } })
  @Post('reports')
  @Roles(Role.EMPLOYEE, Role.MANAGER)
  submit(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitSafetyReportDto,
  ) {
    return this.reports.submit(eventId, user, dto);
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
