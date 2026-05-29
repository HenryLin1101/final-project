import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

function parseRedisUrl(url: string | undefined) {
  // Fallback target is unreachable in dev/test without redis; BullMQ retries silently.
  if (!url) return { host: '127.0.0.1', port: 6379 };
  try {
    const u = new URL(url);
    // rediss:// scheme means TLS (Upstash, ElastiCache w/ encryption, etc.)
    const isTls = u.protocol === 'rediss:';
    return {
      host: u.hostname || '127.0.0.1',
      port: u.port ? Number(u.port) : 6379,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      ...(isTls ? { tls: {} as Record<string, never> } : {}),
    };
  } catch {
    return { host: '127.0.0.1', port: 6379 };
  }
}

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        ...parseRedisUrl(process.env.REDIS_URL),
        // BullMQ workers require maxRetriesPerRequest: null on the connection.
        maxRetriesPerRequest: null,
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
