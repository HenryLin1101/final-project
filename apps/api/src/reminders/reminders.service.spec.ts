import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventStatus, NotificationType, Role } from '@prisma/client';
import { RemindersService } from './reminders.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { RedisService } from '../redis/redis.service';

const mockActiveEvent = {
  id: 'evt-1',
  title: 'Earthquake Drill',
  status: EventStatus.ACTIVE,
};

const mockDraftEvent = {
  id: 'evt-draft',
  title: 'Draft Event',
  status: EventStatus.DRAFT,
};

describe('RemindersService', () => {
  let service: RemindersService;
  let prismaEvent: { findUnique: jest.Mock; findMany: jest.Mock };
  let prismaUser: { findMany: jest.Mock };
  let prismaReport: { findMany: jest.Mock };
  let prismaNotification: { create: jest.Mock };
  let scopeService: { getScopedReporterUserIds: jest.Mock };
  let redis: {
    isEnabled: jest.Mock;
    setNx: jest.Mock;
  };

  beforeEach(async () => {
    prismaEvent = {
      findUnique: jest.fn().mockResolvedValue(mockActiveEvent),
      findMany: jest.fn().mockResolvedValue([]),
    };
    prismaUser = {
      findMany: jest.fn().mockResolvedValue([
        { id: 'emp-1', role: Role.EMPLOYEE, departmentId: 'dept-1' },
        { id: 'emp-2', role: Role.EMPLOYEE, departmentId: 'dept-1' },
      ]),
    };
    prismaReport = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    prismaNotification = {
      create: jest.fn().mockResolvedValue({}),
    };
    scopeService = {
      getScopedReporterUserIds: jest.fn().mockResolvedValue(['emp-1', 'emp-2']),
    };
    redis = {
      isEnabled: jest.fn().mockReturnValue(true),
      setNx: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        {
          provide: PrismaService,
          useValue: {
            event: prismaEvent,
            user: prismaUser,
            safetyReport: prismaReport,
            notification: prismaNotification,
          },
        },
        { provide: ScopeService, useValue: scopeService },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(RemindersService);
  });

  const systemActor = {
    id: 'system',
    email: 'system@internal',
    role: Role.ADMIN,
    departmentId: null as string | null,
    managerId: null as string | null,
  };

  it('throws NotFoundException when event does not exist', async () => {
    prismaEvent.findUnique.mockResolvedValue(null);

    await expect(service.run('non-existent', systemActor)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns event_not_active when event is not ACTIVE', async () => {
    prismaEvent.findUnique.mockResolvedValue(mockDraftEvent);

    const result = await service.run(mockDraftEvent.id, systemActor);

    expect(result).toEqual({ ok: false, reason: 'event_not_active' });
    expect(prismaNotification.create).not.toHaveBeenCalled();
  });

  it('returns already_run_this_hour when idempotency key exists in Redis', async () => {
    redis.setNx.mockResolvedValue(false);

    const result = await service.run(mockActiveEvent.id, systemActor);

    expect(result).toEqual({ ok: false, reason: 'already_run_this_hour' });
    expect(prismaNotification.create).not.toHaveBeenCalled();
  });

  it('creates REMINDER_EMPLOYEE notifications for unreported employees', async () => {
    prismaUser.findMany
      .mockResolvedValueOnce([
        { id: 'emp-1', role: Role.EMPLOYEE, departmentId: 'dept-1' },
        { id: 'emp-2', role: Role.EMPLOYEE, departmentId: 'dept-1' },
      ])
      .mockResolvedValueOnce([]);
    prismaReport.findMany.mockResolvedValue([]);

    const result = await service.run(mockActiveEvent.id, systemActor);

    expect(result).toMatchObject({
      ok: true,
      missingCount: 2,
      employeeReminders: 2,
    });
    expect(prismaNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: NotificationType.REMINDER_EMPLOYEE,
        }),
      }),
    );
  });

  it('runs normally and creates notifications when Redis is disabled', async () => {
    redis.isEnabled.mockReturnValue(false);
    prismaUser.findMany
      .mockResolvedValueOnce([
        { id: 'emp-1', role: Role.EMPLOYEE, departmentId: 'dept-1' },
      ])
      .mockResolvedValueOnce([]);
    prismaReport.findMany.mockResolvedValue([]);

    const result = await service.run(mockActiveEvent.id, systemActor);

    expect(redis.setNx).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true });
  });
});
