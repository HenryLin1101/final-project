import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuditAction, Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockUser = {
  id: 'user-1',
  email: 'employee1@demo.com',
  name: 'Employee One',
  role: Role.EMPLOYEE,
  departmentId: 'dept-1',
  managerId: null,
  passwordHash: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  let prismaUser: { findUnique: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let auditLog: jest.Mock;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    prismaUser = {
      findUnique: jest.fn().mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
      }),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock.jwt.token'),
    };
    auditLog = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: { user: prismaUser },
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: AuditService,
          useValue: { log: auditLog },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login()', () => {
    it('returns access_token and user object on valid credentials', async () => {
      const result = await service.login(
        { email: 'employee1@demo.com', password: 'Password123!' },
        { ip: '127.0.0.1' },
      );

      expect(result.access_token).toBe('mock.jwt.token');
      expect(result.user.email).toBe('employee1@demo.com');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.LOGIN }),
      );
    });

    it('throws UnauthorizedException and logs LOGIN_FAILED on wrong password', async () => {
      await expect(
        service.login(
          { email: 'employee1@demo.com', password: 'WrongPassword!' },
          {},
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.LOGIN_FAILED }),
      );
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      prismaUser.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@demo.com', password: 'any' }, {}),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.LOGIN_FAILED }),
      );
    });
  });

  describe('me()', () => {
    it('returns user without passwordHash when user exists', async () => {
      prismaUser.findUnique = jest.fn().mockResolvedValue({
        ...mockUser,
        passwordHash: 'hashed',
        department: { id: 'dept-1', name: 'Engineering' },
      });

      const result = await service.me(mockUser.id);

      expect(result.email).toBe(mockUser.email);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      prismaUser.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.me('non-existent-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
