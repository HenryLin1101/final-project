import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../../redis/redis.service';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    _limit: number,
    _blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis.isEnabled()) {
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }

    const totalHits = await this.redis.incr(key);
    if (totalHits === 1) {
      await this.redis.pexpire(key, ttl);
    }
    const rawPttl = await this.redis.pttl(key);
    const timeToExpire = Math.max(0, rawPttl);

    return { totalHits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }
}
