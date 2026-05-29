import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const mockUser = {
  id: 'user-1',
  email: 'employee1@demo.com',
  name: 'Employee One',
  role: Role.EMPLOYEE,
  departmentId: 'dept-1',
  managerId: null,
  passwordHash: 'hashed',
  createdAt: new Date(),
  updatedAt: new Date(),
  department: { id: 'dept-1', name: 'Engineering' },
};

const mockAdmin = {
  id: 'admin-1',
  email: 'admin@demo.com',
  name: '系統管理員',
  role: Role.ADMIN,
  departmentId: null,
  managerId: null,
  passwordHash: 'hashed',
  createdAt: new Date(),
  updatedAt: new Date(),
  department: null,
};

describe('UsersService', () => {
  let service: UsersService;
  let prismaUser: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    prismaUser = {
      findMany: jest.fn().mockResolvedValue([mockUser]),
      findUnique: jest.fn().mockResolvedValue(mockUser),
      create: jest.fn().mockResolvedValue(mockUser),
      update: jest.fn().mockResolvedValue(mockUser),
      delete: jest.fn().mockResolvedValue(mockUser),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: { user: prismaUser } },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findAll()', () => {
    it('returns users without passwordHash', async () => {
      const result = await service.findAll();

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).not.toHaveProperty('passwordHash');
    });

    it('filters by departmentId when provided', async () => {
      await service.findAll('dept-1');

      expect(prismaUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { departmentId: 'dept-1' },
        }),
      );
    });

    it('returns all users when no departmentId provided', async () => {
      await service.findAll();

      expect(prismaUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });

  describe('create()', () => {
    const createDto = {
      email: 'new@demo.com',
      password: 'Password123!',
      name: 'New User',
      role: Role.EMPLOYEE,
      departmentId: 'dept-1',
    };

    it('throws ConflictException when email already exists', async () => {
      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates user and returns without passwordHash when email is unique', async () => {
      prismaUser.findUnique.mockResolvedValue(null);

      const result = await service.create(createDto);

      expect(prismaUser.create).toHaveBeenCalled();
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws BadRequestException when non-ADMIN is created without departmentId', async () => {
      prismaUser.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...createDto, role: Role.MANAGER, departmentId: undefined }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates ADMIN without departmentId and forces departmentId=null', async () => {
      prismaUser.findUnique.mockResolvedValue(null);
      prismaUser.create.mockResolvedValue(mockAdmin);

      const result = await service.create({
        email: 'admin2@demo.com',
        password: 'Password123!',
        name: 'Admin',
        role: Role.ADMIN,
        departmentId: 'dept-1', // should be ignored/cleared
      });

      expect(prismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            departmentId: undefined, // null coerced to undefined for Prisma
            managerId: undefined,
          }),
        }),
      );
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('update()', () => {
    const updateDto = { name: 'Updated Name' };

    it('throws NotFoundException when user does not exist', async () => {
      prismaUser.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when updating to an email already in use', async () => {
      const otherUser = { ...mockUser, id: 'user-2', email: 'taken@demo.com' };
      prismaUser.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(otherUser);

      await expect(
        service.update('user-1', { email: 'taken@demo.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('updates user and returns without passwordHash', async () => {
      const result = await service.update('user-1', updateDto);

      expect(prismaUser.update).toHaveBeenCalled();
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('allows updating to the same email without conflict check', async () => {
      await service.update('user-1', { email: mockUser.email });

      expect(prismaUser.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove()', () => {
    it('throws ForbiddenException when deleting own account', async () => {
      await expect(service.remove('user-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaUser.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      prismaUser.findUnique.mockResolvedValue(null);

      await expect(service.remove('admin-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaUser.delete).not.toHaveBeenCalled();
    });

    it('deletes the user and returns ok', async () => {
      const result = await service.remove('admin-1', 'user-1');

      expect(prismaUser.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(result).toEqual({ ok: true });
    });
  });
});
