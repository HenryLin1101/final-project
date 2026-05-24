import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, EventStatus, Role, SafetyStatus } from '@prisma/client';
import { SafetyReportsService } from './safety-reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

const adminUser: AuthUser = {
  id: 'admin-1',
  email: 'admin@demo.com',
  role: Role.ADMIN,
  departmentId: 'dept-1',
  managerId: null,
};

const managerUser: AuthUser = {
  id: 'mgr-1',
  email: 'manager@demo.com',
  role: Role.MANAGER,
  departmentId: 'dept-1',
  managerId: null,
};

const employeeUser: AuthUser = {
  id: 'emp-1',
  email: 'employee1@demo.com',
  role: Role.EMPLOYEE,
  departmentId: 'dept-1',
  managerId: 'mgr-1',
};

const mockActiveEvent = {
  id: 'evt-1',
  title: 'Flood',
  status: EventStatus.ACTIVE,
};

const mockDraftEvent = {
  id: 'evt-draft',
  title: 'Draft',
  status: EventStatus.DRAFT,
};

describe('SafetyReportsService', () => {
  let service: SafetyReportsService;
  let prismaEvent: { findUnique: jest.Mock };
  let prismaReport: { upsert: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
  let scopeService: { getScopedReporterUserIds: jest.Mock };
  let auditLog: jest.Mock;

  beforeEach(async () => {
    prismaEvent = {
      findUnique: jest.fn().mockResolvedValue(mockActiveEvent),
    };
    prismaReport = {
      upsert: jest.fn().mockResolvedValue({
        id: 'report-1',
        userId: employeeUser.id,
        eventId: mockActiveEvent.id,
        status: SafetyStatus.SAFE,
        message: null,
        user: { ...employeeUser, department: { id: 'dept-1', name: 'Eng' } },
      }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    };
    scopeService = {
      getScopedReporterUserIds: jest.fn().mockResolvedValue([employeeUser.id]),
    };
    auditLog = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyReportsService,
        {
          provide: PrismaService,
          useValue: { event: prismaEvent, safetyReport: prismaReport },
        },
        { provide: ScopeService, useValue: scopeService },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();

    service = module.get(SafetyReportsService);
  });

  describe('submit()', () => {
    const dto = { status: SafetyStatus.SAFE };

    it('throws ForbiddenException when actor is ADMIN', async () => {
      await expect(
        service.submit(mockActiveEvent.id, adminUser, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when event does not exist', async () => {
      prismaEvent.findUnique.mockResolvedValue(null);

      await expect(
        service.submit('non-existent-evt', employeeUser, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when event is not ACTIVE', async () => {
      prismaEvent.findUnique.mockResolvedValue(mockDraftEvent);

      await expect(
        service.submit(mockDraftEvent.id, employeeUser, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('upserts report and calls audit log on EMPLOYEE success', async () => {
      const result = await service.submit(mockActiveEvent.id, employeeUser, dto);

      expect(prismaReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_eventId: { userId: employeeUser.id, eventId: mockActiveEvent.id } },
        }),
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.REPORT_SUBMIT }),
      );
      expect(result.status).toBe(SafetyStatus.SAFE);
    });
  });

  describe('listTeam()', () => {
    it('throws ForbiddenException when actor is not MANAGER', async () => {
      await expect(
        service.listTeam(mockActiveEvent.id, employeeUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns scoped team reports for MANAGER', async () => {
      const result = await service.listTeam(mockActiveEvent.id, managerUser);

      expect(scopeService.getScopedReporterUserIds).toHaveBeenCalledWith(managerUser);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('listAll()', () => {
    it('throws ForbiddenException when actor is not ADMIN', async () => {
      await expect(
        service.listAll(mockActiveEvent.id, employeeUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns all reports for ADMIN', async () => {
      prismaReport.findMany.mockResolvedValue([{ id: 'r1' }]);

      const result = await service.listAll(mockActiveEvent.id, adminUser);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe('stats()', () => {
    it('returns scope "self" for EMPLOYEE', async () => {
      prismaReport.findMany.mockResolvedValue([]);

      const result = await service.stats(mockActiveEvent.id, employeeUser);

      expect(result.scope).toBe('self');
      expect(result.total).toBe(1);
    });

    it('returns scope "company" for ADMIN', async () => {
      scopeService.getScopedReporterUserIds.mockResolvedValue(['emp-1', 'emp-2', 'mgr-1']);
      prismaReport.findMany.mockResolvedValue([
        { userId: 'emp-1', status: SafetyStatus.SAFE },
        { userId: 'emp-2', status: SafetyStatus.NEED_HELP },
      ]);

      const result = await service.stats(mockActiveEvent.id, adminUser);

      expect(result.scope).toBe('company');
      expect(result.total).toBe(3);
      expect(result.safe).toBe(1);
      expect(result.need_help).toBe(1);
      expect(result.no_response).toBe(1);
    });
  });
});
