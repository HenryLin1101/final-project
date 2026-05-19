import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Role, EventStatus } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';

const adminUser = {
  id: 'admin-1',
  role: Role.ADMIN,
  email: 'admin@demo.com',
  departmentId: null,
  managerId: null,
};
const managerUser = {
  id: 'mgr-1',
  role: Role.MANAGER,
  email: 'mgr@demo.com',
  departmentId: 'dept-1',
  managerId: null,
};
const employeeUser = {
  id: 'emp-1',
  role: Role.EMPLOYEE,
  email: 'emp@demo.com',
  departmentId: 'dept-1',
  managerId: 'mgr-1',
};

const mockEvent = {
  id: 'evt-1',
  title: 'Flood',
  description: null,
  status: EventStatus.ACTIVE,
  createdById: 'admin-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('EventsService - Redis cache', () => {
  let service: EventsService;
  let redis: {
    isEnabled: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let prismaEvent: {
    findMany: jest.Mock;
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    redis = {
      isEnabled: jest.fn().mockReturnValue(true),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    prismaEvent = {
      findMany: jest.fn().mockResolvedValue([mockEvent]),
      create: jest.fn().mockResolvedValue({ ...mockEvent, status: EventStatus.DRAFT }),
      findUnique: jest.fn().mockResolvedValue(mockEvent),
      update: jest.fn().mockResolvedValue({ ...mockEvent, title: 'Updated' }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: { event: prismaEvent } },
        { provide: AuditService, useValue: audit },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(EventsService);
  });

  describe('findAll()', () => {
    it('returns cached data without querying DB on cache hit', async () => {
      const cached = [{ id: 'evt-cached', title: 'From Cache' }];
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.findAll(adminUser);

      expect(result).toEqual(cached);
      expect(prismaEvent.findMany).not.toHaveBeenCalled();
    });

    it('queries DB and stores result in cache on cache miss (ADMIN)', async () => {
      const result = await service.findAll(adminUser);

      expect(redis.get).toHaveBeenCalledWith('cache:events:list:ADMIN');
      expect(prismaEvent.findMany).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(
        'cache:events:list:ADMIN',
        JSON.stringify([mockEvent]),
        30,
      );
      expect(result).toEqual([mockEvent]);
    });

    it('uses MANAGER-scoped cache key for MANAGER role', async () => {
      await service.findAll(managerUser);
      expect(redis.get).toHaveBeenCalledWith('cache:events:list:MANAGER');
      expect(redis.set).toHaveBeenCalledWith(
        'cache:events:list:MANAGER',
        expect.any(String),
        30,
      );
    });

    it('uses EMPLOYEE-scoped cache key for EMPLOYEE role', async () => {
      await service.findAll(employeeUser);
      expect(redis.get).toHaveBeenCalledWith('cache:events:list:EMPLOYEE');
    });

    it('bypasses cache entirely when Redis is disabled', async () => {
      redis.isEnabled.mockReturnValue(false);

      const result = await service.findAll(adminUser);

      expect(redis.get).not.toHaveBeenCalled();
      expect(prismaEvent.findMany).toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
      expect(result).toEqual([mockEvent]);
    });
  });

  describe('create()', () => {
    it('invalidates all three role cache keys after creating an event', async () => {
      await service.create(adminUser, { title: 'New Event' });

      expect(redis.del).toHaveBeenCalledWith('cache:events:list:ADMIN');
      expect(redis.del).toHaveBeenCalledWith('cache:events:list:MANAGER');
      expect(redis.del).toHaveBeenCalledWith('cache:events:list:EMPLOYEE');
    });
  });

  describe('update()', () => {
    it('invalidates all three role cache keys after updating an event', async () => {
      await service.update('evt-1', adminUser, { title: 'Updated' });

      expect(redis.del).toHaveBeenCalledWith('cache:events:list:ADMIN');
      expect(redis.del).toHaveBeenCalledWith('cache:events:list:MANAGER');
      expect(redis.del).toHaveBeenCalledWith('cache:events:list:EMPLOYEE');
    });

    it('throws NotFoundException when event does not exist', async () => {
      prismaEvent.findUnique.mockResolvedValue(null);
      await expect(service.update('bad-id', adminUser, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
