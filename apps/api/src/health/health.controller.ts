import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@SkipThrottle({ global: true })
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  live() {
    return { status: 'ok', service: 'employee-safety-api' };
  }

  @Public()
  @Get('ready')
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = await this.redis.ping();
    return { status: 'ready', postgres: true, redis };
  }
}
