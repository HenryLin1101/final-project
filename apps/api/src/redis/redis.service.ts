import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (url) {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
      });
    }
  }

  isEnabled() {
    return !!this.client;
  }

  async ping(): Promise<'PONG' | 'SKIPPED'> {
    if (!this.client) {
      return 'SKIPPED';
    }
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    return this.client.ping();
  }

  async setNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (!this.client) {
      return true;
    }
    const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  async incr(key: string): Promise<number> {
    if (!this.client) return 0;
    if (this.client.status === 'wait') await this.client.connect();
    return this.client.incr(key);
  }

  async pexpire(key: string, ttlMs: number): Promise<void> {
    if (!this.client) return;
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.pexpire(key, ttlMs);
  }

  async incrPexpire(key: string, ttlMs: number): Promise<number> {
    if (!this.client) return 0;
    if (this.client.status === 'wait') await this.client.connect();
    // Lua script executed atomically on the Redis server (not JS eval).
    // Prevents the race where a crash between INCR and PEXPIRE leaves a key without TTL.
    const luaScript = [
      'local c=redis.call("INCR",KEYS[1])',
      'if c==1 then redis.call("PEXPIRE",KEYS[1],ARGV[1]) end',
      'return c',
    ].join('\n');
    const result = await this.client.eval(luaScript, 1, key, String(ttlMs));
    return Number(result);
  }

  async pttl(key: string): Promise<number> {
    if (!this.client) return 0;
    if (this.client.status === 'wait') await this.client.connect();
    return this.client.pttl(key);
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    if (this.client.status === 'wait') await this.client.connect();
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.del(key);
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }
}
