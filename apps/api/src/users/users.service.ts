import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private omitPassword<T extends { passwordHash: string }>(
    user: T,
  ): Omit<T, 'passwordHash'> {
    const { passwordHash: _p, ...rest } = user;
    return rest;
  }

  async findAll(departmentId?: string) {
    const rows = await this.prisma.user.findMany({
      where: departmentId ? { departmentId } : undefined,
      include: { department: true },
      orderBy: { email: 'asc' },
    });
    return rows.map((u) => this.omitPassword(u));
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role,
        departmentId: dto.departmentId,
        managerId: dto.managerId ?? undefined,
      },
      include: { department: true },
    });
    return this.omitPassword(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException();
    }
    if (dto.email && dto.email !== user.email) {
      const exists = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (exists) {
        throw new ConflictException('Email already in use');
      }
    }
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : undefined;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        departmentId: dto.departmentId,
        managerId: dto.managerId === undefined ? undefined : dto.managerId,
        ...(passwordHash ? { passwordHash } : {}),
      },
      include: { department: true },
    });
    return this.omitPassword(updated);
  }

  async remove(actorId: string, id: string) {
    if (actorId === id) {
      throw new ForbiddenException('Cannot delete your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException();
    }
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}
