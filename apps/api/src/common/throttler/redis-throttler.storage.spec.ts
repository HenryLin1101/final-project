import { RedisThrottlerStorage } from './redis-throttler.storage';
import { RedisService } from '../../redis/redis.service';

describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;
  let redis: {
    isEnabled: jest.Mock;
    incrPexpire: jest.Mock;
    pttl: jest.Mock;
  };

  beforeEach(() => {
    redis = {
      isEnabled: jest.fn().mockReturnValue(true),
      incrPexpire: jest.fn().mockResolvedValue(1),
      pttl: jest.fn().mockResolvedValue(60000),
    };
    storage = new RedisThrottlerStorage(redis as unknown as RedisService);
  });

  it('calls incrPexpire and returns totalHits + timeToExpire on first hit', async () => {
    redis.incrPexpire.mockResolvedValue(1);
    redis.pttl.mockResolvedValue(60000);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(redis.incrPexpire).toHaveBeenCalledWith('test-key', 60000);
    expect(result.totalHits).toBe(1);
    expect(result.timeToExpire).toBe(60000);
    expect(result.isBlocked).toBe(false);
    expect(result.timeToBlockExpire).toBe(0);
  });

  it('reports subsequent hit count from incrPexpire', async () => {
    redis.incrPexpire.mockResolvedValue(5);
    redis.pttl.mockResolvedValue(45000);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(result.totalHits).toBe(5);
    expect(result.timeToExpire).toBe(45000);
  });

  it('returns totalHits 0 and skips Redis when disabled (graceful degradation)', async () => {
    redis.isEnabled.mockReturnValue(false);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(result.totalHits).toBe(0);
    expect(result.isBlocked).toBe(false);
    expect(redis.incrPexpire).not.toHaveBeenCalled();
  });

  it('returns totalHits 0 and allows request when Redis throws (graceful degradation)', async () => {
    redis.incrPexpire.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(result.totalHits).toBe(0);
    expect(result.isBlocked).toBe(false);
  });

  it('clamps negative pttl to 0', async () => {
    redis.incrPexpire.mockResolvedValue(2);
    redis.pttl.mockResolvedValue(-1);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(result.timeToExpire).toBe(0);
  });

  it('returns isBlocked false when totalHits equals limit', async () => {
    redis.incrPexpire.mockResolvedValue(60);
    redis.pttl.mockResolvedValue(30000);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(result.isBlocked).toBe(false);
    expect(result.timeToBlockExpire).toBe(0);
  });

  it('returns isBlocked true and timeToBlockExpire when totalHits exceeds limit', async () => {
    redis.incrPexpire.mockResolvedValue(61);
    redis.pttl.mockResolvedValue(25000);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(result.isBlocked).toBe(true);
    expect(result.timeToBlockExpire).toBe(25000);
    expect(result.totalHits).toBe(61);
  });
});
