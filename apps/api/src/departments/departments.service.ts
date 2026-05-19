import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { RedisService } from '../redis/redis.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

const DEPT_CACHE_KEY = 'cache:departments:list';
const DEPT_CACHE_TTL = 300;

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly redis: RedisService,
  ) {}

  async findAll() {
    if (this.redis.isEnabled()) {
      const cached = await this.redis.get(DEPT_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    }

    const depts = await this.prisma.department.findMany({
      orderBy: { name: 'asc' },
    });

    if (this.redis.isEnabled()) {
      await this.redis.set(DEPT_CACHE_KEY, JSON.stringify(depts), DEPT_CACHE_TTL);
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
    await this.prisma.department.delete({ where: { id } });
    await this.clearDeptCache();
    return { ok: true };
  }

  private async clearDeptCache(): Promise<void> {
    if (!this.redis.isEnabled()) return;
    await this.redis.del(DEPT_CACHE_KEY);
  }
}
