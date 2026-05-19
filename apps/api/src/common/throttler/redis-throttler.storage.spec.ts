import { RedisThrottlerStorage } from './redis-throttler.storage';
import { RedisService } from '../../redis/redis.service';

describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;
  let redis: {
    isEnabled: jest.Mock;
    incr: jest.Mock;
    pexpire: jest.Mock;
    pttl: jest.Mock;
  };

  beforeEach(() => {
    redis = {
      isEnabled: jest.fn().mockReturnValue(true),
      incr: jest.fn().mockResolvedValue(1),
      pexpire: jest.fn().mockResolvedValue(undefined),
      pttl: jest.fn().mockResolvedValue(60000),
    };
    storage = new RedisThrottlerStorage(redis as unknown as RedisService);
  });

  it('increments counter and sets TTL on first hit', async () => {
    redis.incr.mockResolvedValue(1);
    redis.pttl.mockResolvedValue(60000);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(redis.incr).toHaveBeenCalledWith('test-key');
    expect(redis.pexpire).toHaveBeenCalledWith('test-key', 60000);
    expect(result.totalHits).toBe(1);
    expect(result.timeToExpire).toBe(60000);
    expect(result.isBlocked).toBe(false);
    expect(result.timeToBlockExpire).toBe(0);
  });

  it('does not reset TTL on subsequent hits', async () => {
    redis.incr.mockResolvedValue(5);
    redis.pttl.mockResolvedValue(45000);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(redis.pexpire).not.toHaveBeenCalled();
    expect(result.totalHits).toBe(5);
    expect(result.timeToExpire).toBe(45000);
  });

  it('returns totalHits 0 and skips Redis when disabled (graceful degradation)', async () => {
    redis.isEnabled.mockReturnValue(false);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(result.totalHits).toBe(0);
    expect(result.isBlocked).toBe(false);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('clamps negative pttl to 0', async () => {
    redis.incr.mockResolvedValue(2);
    redis.pttl.mockResolvedValue(-1);

    const result = await storage.increment('test-key', 60000, 60, 0, 'global');

    expect(result.timeToExpire).toBe(0);
    expect(redis.pexpire).not.toHaveBeenCalled();
  });
});
