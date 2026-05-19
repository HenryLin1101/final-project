import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, EventStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

const EVENT_CACHE_KEYS = [
  'cache:events:list:ADMIN',
  'cache:events:list:MANAGER',
  'cache:events:list:EMPLOYEE',
] as const;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async findAll(actor: AuthUser) {
    const cacheKey = `cache:events:list:${actor.role}`;

    if (this.redis.isEnabled()) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch {
            // corrupt cache entry — fall through to DB
          }
        }
      } catch {
        // Redis unavailable — fall through to DB
      }
    }

    let events: Awaited<ReturnType<typeof this.prisma.event.findMany>>;
    if (actor.role === Role.ADMIN) {
      events = await this.prisma.event.findMany({ orderBy: { createdAt: 'desc' } });
    } else if (actor.role === Role.MANAGER) {
      events = await this.prisma.event.findMany({
        where: { status: { in: [EventStatus.ACTIVE, EventStatus.CLOSED] } },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      events = await this.prisma.event.findMany({
        where: { status: EventStatus.ACTIVE },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (this.redis.isEnabled()) {
      try {
        await this.redis.set(cacheKey, JSON.stringify(events), 30);
      } catch {
        // Redis write failure — non-fatal, serve result without caching
      }
    }
    return events;
  }

  async findOne(id: string, actor: AuthUser) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException();
    }
    if (actor.role === Role.EMPLOYEE && event.status !== EventStatus.ACTIVE) {
      throw new ForbiddenException();
    }
    return event;
  }

  async create(actor: AuthUser, dto: CreateEventDto) {
    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status ?? EventStatus.DRAFT,
        createdById: actor.id,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      action: AuditAction.CREATE,
      resource: 'Event',
      resourceId: event.id,
      payload: { title: event.title, status: event.status },
    });
    await this.clearEventCache();
    return event;
  }

  async update(id: string, actor: AuthUser, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException();
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      action: AuditAction.UPDATE,
      resource: 'Event',
      resourceId: id,
      payload: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
    });
    await this.clearEventCache();
    return updated;
  }

  private async clearEventCache(): Promise<void> {
    if (!this.redis.isEnabled()) return;
    await Promise.all(EVENT_CACHE_KEYS.map((k) => this.redis.del(k)));
  }
}
