import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventStatus, NotificationType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { RedisService } from '../redis/redis.service';

const SYSTEM_ACTOR: AuthUser = {
  id: 'system',
  email: 'system@internal',
  role: Role.ADMIN,
  departmentId: null,
  managerId: null,
};

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly redis: RedisService,
  ) {}

  @Cron('0 * * * *')
  async runForAllActiveEvents(): Promise<void> {
    const events = await this.prisma.event.findMany({
      where: { status: EventStatus.ACTIVE },
      select: { id: true },
    });
    for (const event of events) {
      await this.run(event.id, SYSTEM_ACTOR);
    }
  }

  async run(eventId: string, _actor: AuthUser) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.status !== EventStatus.ACTIVE) {
      return { ok: false, reason: 'event_not_active' };
    }

    const idempotencyKey = `reminder:${eventId}:${new Date().toISOString().slice(0, 13)}`;
    if (this.redis.isEnabled()) {
      const ok = await this.redis.setNx(idempotencyKey, '1', 3600);
      if (!ok) {
        return { ok: false, reason: 'already_run_this_hour' };
      }
    }

    // company-wide eligible users (EMPLOYEE + MANAGER)
    const companyScope = await this.prisma.user.findMany({
      where: { role: { in: [Role.EMPLOYEE, Role.MANAGER] } },
      select: { id: true },
    });
    const eligible = companyScope.map((u) => u.id);

    const reports = await this.prisma.safetyReport.findMany({
      where: { eventId },
      select: { userId: true },
    });
    const reported = new Set(reports.map((r) => r.userId));
    const missing = eligible.filter((id) => !reported.has(id));

    let employeeReminders = 0;
    for (const userId of missing) {
      await this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.REMINDER_EMPLOYEE,
          title: '尚未完成安全回報',
          body: `事件「${event.title}」尚未收到您的回報，請盡快回報。`,
          relatedEventId: eventId,
        },
      });
      employeeReminders += 1;
    }

    const managers = await this.prisma.user.findMany({
      where: { role: Role.MANAGER },
      select: { id: true, departmentId: true },
    });
    let managerReminders = 0;
    for (const m of managers) {
      const scoped = await this.scope.getScopedReporterUserIds({
        id: m.id,
        email: '',
        role: Role.MANAGER,
        departmentId: m.departmentId,
        managerId: null,
      });
      const teamMissing = scoped.filter((id) => !reported.has(id));
      if (teamMissing.length > 0) {
        await this.prisma.notification.create({
          data: {
            userId: m.id,
            type: NotificationType.REMINDER_MANAGER,
            title: '轄下尚未全數回報',
            body: `事件「${event.title}」仍有 ${teamMissing.length} 人尚未回報，請關懷確認。`,
            relatedEventId: eventId,
            metadata: { pendingUserIds: teamMissing },
          },
        });
        managerReminders += 1;
      }
    }

    return {
      ok: true,
      eventId,
      employeeReminders,
      managerReminders,
      missingCount: missing.length,
    };
  }
}
