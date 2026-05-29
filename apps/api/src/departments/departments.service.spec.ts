import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  DepartmentsService,
  DEPT_CACHE_KEY,
  DEPT_CACHE_TTL,
} from './departments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { RedisService } from '../redis/redis.service';

const mockDept = { id: 'd1', name: 'HR', parentId: null };

describe('DepartmentsService - Redis cache', () => {
  let service: DepartmentsService;
  let redis: {
    isEnabled: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let prismaDept: {
    findMany: jest.Mock;
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    redis = {
      isEnabled: jest.fn().mockReturnValue(true),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    prismaDept = {
      findMany: jest.fn().mockResolvedValue([mockDept]),
      create: jest.fn().mockResolvedValue(mockDept),
      findUnique: jest.fn().mockResolvedValue(mockDept),
      update: jest.fn().mockResolvedValue({ ...mockDept, name: 'HR Updated' }),
      delete: jest.fn().mockResolvedValue(mockDept),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: PrismaService, useValue: { department: prismaDept } },
        {
          provide: ScopeService,
          useValue: {
            getDepartmentTreeIds: jest.fn().mockResolvedValue(['d1']),
          },
        },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(DepartmentsService);
  });

  describe('findAll()', () => {
    it('returns cached data without querying DB on cache hit', async () => {
      const cached = [{ id: 'd-cached', name: 'Cached Dept' }];
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.findAll();

      expect(result).toEqual(cached);
      expect(prismaDept.findMany).not.toHaveBeenCalled();
    });

    it('queries DB and stores result in cache on cache miss', async () => {
      const result = await service.findAll();

      expect(redis.get).toHaveBeenCalledWith(DEPT_CACHE_KEY);
      expect(prismaDept.findMany).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(
        DEPT_CACHE_KEY,
        JSON.stringify([mockDept]),
        DEPT_CACHE_TTL,
      );
      expect(result).toEqual([mockDept]);
    });

    it('bypasses cache when Redis is disabled', async () => {
      redis.isEnabled.mockReturnValue(false);

      const result = await service.findAll();

      expect(redis.get).not.toHaveBeenCalled();
      expect(prismaDept.findMany).toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
      expect(result).toEqual([mockDept]);
    });
  });

  describe('create()', () => {
    it('invalidates departments cache after create', async () => {
      await service.create({ name: 'New Dept' });
      expect(redis.del).toHaveBeenCalledWith(DEPT_CACHE_KEY);
      expect(redis.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('update()', () => {
    it('invalidates departments cache after update', async () => {
      await service.update('d1', { name: 'HR Updated' });
      expect(redis.del).toHaveBeenCalledWith(DEPT_CACHE_KEY);
      expect(redis.del).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when department does not exist', async () => {
      prismaDept.findUnique.mockResolvedValue(null);
      await expect(service.update('bad-id', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(redis.del).not.toHaveBeenCalled();
      expect(prismaDept.update).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('invalidates departments cache after remove', async () => {
      await service.remove('d1');
      expect(redis.del).toHaveBeenCalledWith(DEPT_CACHE_KEY);
      expect(redis.del).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when department does not exist', async () => {
      prismaDept.findUnique.mockResolvedValue(null);
      await expect(service.remove('bad-id')).rejects.toThrow(NotFoundException);
      expect(redis.del).not.toHaveBeenCalled();
      expect(prismaDept.delete).not.toHaveBeenCalled();
    });
  });
});
