import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { ScopeService } from './scope.service';
import { PrismaService } from '../prisma/prisma.service';
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

describe('ScopeService', () => {
  let service: ScopeService;
  let prismaDept: { findMany: jest.Mock };
  let prismaUser: { findMany: jest.Mock };

  beforeEach(async () => {
    prismaDept = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    prismaUser = {
      findMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScopeService,
        {
          provide: PrismaService,
          useValue: { department: prismaDept, user: prismaUser },
        },
      ],
    }).compile();

    service = module.get(ScopeService);
  });

  describe('getDepartmentTreeIds()', () => {
    it('returns only root id when no children exist', async () => {
      prismaDept.findMany.mockResolvedValue([]);

      const result = await service.getDepartmentTreeIds('dept-root');

      expect(result).toEqual(['dept-root']);
      expect(prismaDept.findMany).toHaveBeenCalledTimes(1);
    });

    it('recursively returns all descendant department ids', async () => {
      prismaDept.findMany
        .mockResolvedValueOnce([{ id: 'dept-child-1' }, { id: 'dept-child-2' }])
        .mockResolvedValueOnce([{ id: 'dept-grandchild-1' }])
        .mockResolvedValueOnce([]);

      const result = await service.getDepartmentTreeIds('dept-root');

      expect(result).toContain('dept-root');
      expect(result).toContain('dept-child-1');
      expect(result).toContain('dept-child-2');
      expect(result).toContain('dept-grandchild-1');
      expect(result).toHaveLength(4);
    });
  });

  describe('getScopedReporterUserIds()', () => {
    it('returns all EMPLOYEE and MANAGER ids for ADMIN', async () => {
      prismaUser.findMany.mockResolvedValue([
        { id: 'emp-1' },
        { id: 'emp-2' },
        { id: 'mgr-1' },
      ]);

      const result = await service.getScopedReporterUserIds(adminUser);

      expect(result).toEqual(['emp-1', 'emp-2', 'mgr-1']);
      expect(prismaUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: { in: [Role.EMPLOYEE, Role.MANAGER] } },
        }),
      );
    });

    it('returns only direct reports for MANAGER', async () => {
      prismaUser.findMany.mockResolvedValue([
        { id: 'mgr-a' },
        { id: 'mgr-b' },
      ]);

      const result = await service.getScopedReporterUserIds(managerUser);

      expect(result).toEqual(['mgr-a', 'mgr-b']);
      expect(prismaUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            managerId: managerUser.id,
          }),
        }),
      );
      // department subtree should NOT be queried
      expect(prismaDept.findMany).not.toHaveBeenCalled();
    });

    it('returns empty array when MANAGER has no direct reports', async () => {
      prismaUser.findMany.mockResolvedValue([]);

      const result = await service.getScopedReporterUserIds(managerUser);

      expect(result).toEqual([]);
    });

    it('returns only self id for EMPLOYEE', async () => {
      const result = await service.getScopedReporterUserIds(employeeUser);

      expect(result).toEqual([employeeUser.id]);
      expect(prismaUser.findMany).not.toHaveBeenCalled();
    });
  });
});
