import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

const actor: AuthUser = {
  id: 'user-1',
  email: 'employee1@demo.com',
  role: Role.EMPLOYEE,
  departmentId: 'dept-1',
  managerId: null,
};

const mockNotification = {
  id: 'notif-1',
  userId: 'user-1',
  type: 'REMINDER_EMPLOYEE',
  title: '尚未完成安全回報',
  body: '請盡快回報。',
  readAt: null,
  createdAt: new Date(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaNotification: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    prismaNotification = {
      findMany: jest.fn().mockResolvedValue([mockNotification]),
      findFirst: jest.fn().mockResolvedValue(mockNotification),
      update: jest.fn().mockResolvedValue({ ...mockNotification, readAt: new Date() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: { notification: prismaNotification },
        },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('list()', () => {
    it('returns notifications for the actor', async () => {
      const result = await service.list(actor);

      expect(prismaNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: actor.id } }),
      );
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('orders notifications by createdAt desc and limits to 100', async () => {
      await service.list(actor);

      expect(prismaNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );
    });
  });

  describe('markRead()', () => {
    it('marks notification as read when it belongs to the actor', async () => {
      const result = await service.markRead('notif-1', actor);

      expect(prismaNotification.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'notif-1', userId: actor.id } }),
      );
      expect(prismaNotification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-1' },
          data: expect.objectContaining({ readAt: expect.any(Date) }),
        }),
      );
      expect(result.readAt).not.toBeNull();
    });

    it('throws NotFoundException when notification does not belong to the actor', async () => {
      prismaNotification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('other-notif', actor)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaNotification.update).not.toHaveBeenCalled();
    });
  });
});
