import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
    it('deletes the user and returns ok', async () => {
      const result = await service.remove('user-1');

      expect(prismaUser.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(result).toEqual({ ok: true });
    });
  });
});
