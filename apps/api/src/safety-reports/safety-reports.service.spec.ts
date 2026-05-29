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
  departmentId: null,
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

const mockManagerAUser = {
  id: 'mgr-a-1',
  email: 'rnd-a.manager@demo.com',
  name: '研發A主管',
  role: Role.MANAGER,
  departmentId: 'dept-rnd-a',
  managerId: 'mgr-1',
  department: { id: 'dept-rnd-a', name: '研發A' },
};

const mockManagerBUser = {
  id: 'mgr-b-1',
  email: 'rnd-b.manager@demo.com',
  name: '研發B主管',
  role: Role.MANAGER,
  departmentId: 'dept-rnd-b',
  managerId: 'mgr-1',
  department: { id: 'dept-rnd-b', name: '研發B' },
};

describe('SafetyReportsService', () => {
  let service: SafetyReportsService;
  let prismaEvent: { findUnique: jest.Mock };
  let prismaReport: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  let prismaUser: { findMany: jest.Mock };
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
    prismaUser = {
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
          useValue: {
            event: prismaEvent,
            safetyReport: prismaReport,
            user: prismaUser,
          },
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
      const result = await service.submit(
        mockActiveEvent.id,
        employeeUser,
        dto,
      );

      expect(prismaReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_eventId: {
              userId: employeeUser.id,
              eventId: mockActiveEvent.id,
            },
          },
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

    it('returns all direct reports including unreported members', async () => {
      scopeService.getScopedReporterUserIds.mockResolvedValue([
        mockManagerAUser.id,
        mockManagerBUser.id,
      ]);
      prismaUser.findMany.mockResolvedValue([mockManagerAUser, mockManagerBUser]);
      // only mgr-a has reported
      prismaReport.findMany.mockResolvedValue([
        {
          id: 'report-1',
          userId: mockManagerAUser.id,
          eventId: mockActiveEvent.id,
          status: SafetyStatus.SAFE,
          message: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.listTeam(mockActiveEvent.id, managerUser);

      expect(scopeService.getScopedReporterUserIds).toHaveBeenCalledWith(managerUser);
      expect(result).toHaveLength(2);

      const aRow = result.find((r) => r.user.id === mockManagerAUser.id);
      const bRow = result.find((r) => r.user.id === mockManagerBUser.id);
      expect(aRow?.status).toBe(SafetyStatus.SAFE);
      expect(aRow?.id).toBe('report-1');
      expect(bRow?.status).toBe('NO_RESPONSE');
      expect(bRow?.id).toBeNull();
    });

    it('returns all direct reports as NO_RESPONSE when none have reported', async () => {
      scopeService.getScopedReporterUserIds.mockResolvedValue([mockManagerAUser.id]);
      prismaUser.findMany.mockResolvedValue([mockManagerAUser]);
      prismaReport.findMany.mockResolvedValue([]);

      const result = await service.listTeam(mockActiveEvent.id, managerUser);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('NO_RESPONSE');
      expect(result[0].id).toBeNull();
    });
  });

  describe('listAll()', () => {
    it('throws ForbiddenException when actor is not ADMIN', async () => {
      await expect(
        service.listAll(mockActiveEvent.id, employeeUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns all scoped users including unreported for ADMIN', async () => {
      scopeService.getScopedReporterUserIds.mockResolvedValue([
        employeeUser.id,
        'emp-2',
      ]);
      prismaUser.findMany.mockResolvedValue([
        { ...employeeUser, department: { id: 'dept-1', name: 'Eng' } },
        {
          id: 'emp-2',
          email: 'emp2@demo.com',
          name: '員工乙',
          role: Role.EMPLOYEE,
          departmentId: 'dept-1',
          managerId: null,
          department: { id: 'dept-1', name: 'Eng' },
        },
      ]);
      prismaReport.findMany.mockResolvedValue([
        {
          id: 'report-1',
          userId: employeeUser.id,
          eventId: mockActiveEvent.id,
          status: SafetyStatus.SAFE,
          message: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.listAll(mockActiveEvent.id, adminUser);

      expect(scopeService.getScopedReporterUserIds).toHaveBeenCalledWith(adminUser);
      expect(result).toHaveLength(2);
      expect(result[1].status).toBe('NO_RESPONSE');
    });
  });

  describe('stats()', () => {
    it('returns scope "self" for EMPLOYEE', async () => {
      prismaReport.findMany.mockResolvedValue([]);

      const result = await service.stats(mockActiveEvent.id, employeeUser);

      expect(result.scope).toBe('self');
      expect(result.total).toBe(1);
    });

    it('returns scope "direct_reports" for MANAGER', async () => {
      scopeService.getScopedReporterUserIds.mockResolvedValue(['mgr-a-1', 'mgr-b-1']);
      prismaReport.findMany.mockResolvedValue([
        { userId: 'mgr-a-1', status: SafetyStatus.SAFE },
      ]);

      const result = await service.stats(mockActiveEvent.id, managerUser);

      expect(result.scope).toBe('direct_reports');
      expect(result.total).toBe(2);
      expect(result.responded).toBe(1);
      expect(result.no_response).toBe(1);
    });

    it('returns scope "company" for ADMIN', async () => {
      scopeService.getScopedReporterUserIds.mockResolvedValue([
        'emp-1',
        'emp-2',
        'mgr-1',
      ]);
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
