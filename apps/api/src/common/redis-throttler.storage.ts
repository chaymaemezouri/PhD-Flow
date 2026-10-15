import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

type ThrottleRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

export class RedisThrottlerStorage implements ThrottlerStorage {
  private redis: Redis | null = null;
  private readonly memory = new Map<string, { hits: number; expiresAt: number }>();

  constructor(url: string | undefined, useRedis: boolean) {
    if (!useRedis || !url) {
      return;
    }
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on('error', () => {
      this.redis = null;
    });
    void client.connect().then(
      () => {
        this.redis = client;
      },
      () => {
        this.redis = null;
      },
    );
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottleRecord> {
    const storageKey = `scholarflow:throttle:${throttlerName}:${key}`;
    if (this.redis) {
      try {
        const hits = await this.redis.incr(storageKey);
        if (hits === 1) {
          await this.redis.pexpire(storageKey, ttl);
        }
        const timeToExpire = Math.max(await this.redis.pttl(storageKey), 0);
        const isBlocked = hits > limit;
        return {
          totalHits: hits,
          timeToExpire,
          isBlocked,
          timeToBlockExpire: isBlocked ? timeToExpire : 0,
        };
      } catch {
        this.redis = null;
      }
    }
    return this.incrementMemory(storageKey, ttl, limit);
  }

  private incrementMemory(key: string, ttl: number, limit: number): ThrottleRecord {
    const now = Date.now();
    const current = this.memory.get(key);
    const fresh = !current || current.expiresAt <= now;
    const hits = fresh ? 1 : current.hits + 1;
    const expiresAt = fresh ? now + ttl : current.expiresAt;
    this.memory.set(key, { hits, expiresAt });
    const timeToExpire = Math.max(expiresAt - now, 0);
    const isBlocked = hits > limit;
    return {
      totalHits: hits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}
