import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction } from '@prisma/client';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let auditLogCreate: jest.Mock;

  beforeEach(async () => {
    auditLogCreate = jest.fn().mockResolvedValue({ id: 'log-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: {
            auditLog: { create: auditLogCreate },
          },
        },
      ],
    }).compile();

    service = module.get(AuditService);
  });

  it('persists audit log with provided fields', async () => {
    await service.log({
      actorId: 'user-1',
      action: AuditAction.LOGIN,
      resource: 'Auth',
      resourceId: 'user-1',
      ip: '127.0.0.1',
      userAgent: 'jest-test',
      payload: { email: 'employee1@demo.com' },
    });

    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: AuditAction.LOGIN,
        resource: 'Auth',
        resourceId: 'user-1',
        ip: '127.0.0.1',
        userAgent: 'jest-test',
        payload: { email: 'employee1@demo.com' },
      },
    });
  });

  it('maps null actorId and resourceId to undefined for Prisma', async () => {
    await service.log({
      actorId: null,
      action: AuditAction.LOGIN_FAILED,
      resource: 'Auth',
      resourceId: null,
      payload: { email: 'ghost@demo.com' },
    });

    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: undefined,
        action: AuditAction.LOGIN_FAILED,
        resource: 'Auth',
        resourceId: undefined,
        ip: undefined,
        userAgent: undefined,
        payload: { email: 'ghost@demo.com' },
      },
    });
  });

  it('persists REPORT_SUBMIT audit entries', async () => {
    await service.log({
      actorId: 'emp-1',
      action: AuditAction.REPORT_SUBMIT,
      resource: 'SafetyReport',
      resourceId: 'rpt-1',
      payload: { eventId: 'evt-1', status: 'SAFE' },
    });

    expect(auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.REPORT_SUBMIT,
        resource: 'SafetyReport',
        resourceId: 'rpt-1',
      }),
    });
  });
});
