import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { RedisService } from '../redis/redis.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

export const DEPT_CACHE_KEY = 'cache:departments:list';
export const DEPT_CACHE_TTL = 300;

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly redis: RedisService,
  ) {}

  async findAll() {
    if (this.redis.isEnabled()) {
      try {
        const cached = await this.redis.get(DEPT_CACHE_KEY);
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

    const depts = await this.prisma.department.findMany({
      orderBy: { name: 'asc' },
    });

    if (this.redis.isEnabled()) {
      try {
        await this.redis.set(DEPT_CACHE_KEY, JSON.stringify(depts), DEPT_CACHE_TTL);
      } catch {
        // Redis write failure — non-fatal, serve result without caching
      }
    }
    return depts;
  }

  async accessible(actor: AuthUser) {
    if (actor.role === Role.ADMIN) {
      return this.findAll();
    }
    const ids = await this.scope.getDepartmentTreeIds(actor.departmentId);
    return this.prisma.department.findMany({
      where: { id: { in: ids } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateDepartmentDto) {
    const dept = await this.prisma.department.create({
      data: {
        name: dto.name,
        parentId: dto.parentId ?? undefined,
      },
    });
    await this.clearDeptCache();
    return dept;
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const d = await this.prisma.department.findUnique({ where: { id } });
    if (!d) {
      throw new NotFoundException();
    }
    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        name: dto.name,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
      },
    });
    await this.clearDeptCache();
    return updated;
  }

  async remove(id: string) {
    const d = await this.prisma.department.findUnique({ where: { id } });
    if (!d) {
      throw new NotFoundException();
    }
    await this.prisma.department.delete({ where: { id } });
    await this.clearDeptCache();
    return { ok: true };
  }

  private async clearDeptCache(): Promise<void> {
    if (!this.redis.isEnabled()) return;
    try {
      await this.redis.del(DEPT_CACHE_KEY);
    } catch {
      // non-fatal — stale cache will expire naturally within TTL
    }
  }
}
