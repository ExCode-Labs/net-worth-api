import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import type { User } from '@prisma/client';

const KEY_SESS = (id: string) => `sess:${id}`;
const KEY_USER = (id: string) => `user:${id}`;
const KEY_USER_SESS = (userId: string) => `user_sessions:${userId}`;

const USER_CACHE_TTL = 5 * 60; // 5 minutes — short enough that profile changes propagate quickly

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RedisService.name);
  private client!: Redis;

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.log.warn('REDIS_URL not set — Redis cache disabled');
      return;
    }
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    this.client.on('error', (err: Error) =>
      this.log.warn(`Redis error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }

  private get ok(): boolean {
    return !!this.client;
  }

  // ── Session ───────────────────────────────────────────────────────────────────

  async setSession(
    sessionId: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.ok) return;
    await Promise.all([
      this.client.set(KEY_SESS(sessionId), userId, 'EX', ttlSeconds),
      this.client.sadd(KEY_USER_SESS(userId), sessionId),
      this.client.expire(KEY_USER_SESS(userId), ttlSeconds),
    ]).catch(() => undefined);
  }

  /** Returns userId if the session is cached, null on miss or error. */
  async getSession(sessionId: string): Promise<string | null> {
    if (!this.ok) return null;
    return this.client.get(KEY_SESS(sessionId)).catch(() => null);
  }

  async delSession(sessionId: string, userId?: string): Promise<void> {
    if (!this.ok) return;
    const ops: Promise<unknown>[] = [this.client.del(KEY_SESS(sessionId))];
    if (userId) ops.push(this.client.srem(KEY_USER_SESS(userId), sessionId));
    await Promise.all(ops).catch(() => undefined);
  }

  /** Delete all Redis session entries for a user. */
  async delUserSessions(userId: string): Promise<void> {
    if (!this.ok) return;
    try {
      const ids = await this.client.smembers(KEY_USER_SESS(userId));
      const keys = ids.map(KEY_SESS);
      if (keys.length) await this.client.del(...keys);
      await this.client.del(KEY_USER_SESS(userId));
    } catch {
      // non-fatal
    }
  }

  // ── User ──────────────────────────────────────────────────────────────────────

  async setUser(user: User): Promise<void> {
    if (!this.ok) return;
    await this.client
      .set(KEY_USER(user.id), JSON.stringify(user), 'EX', USER_CACHE_TTL)
      .catch(() => undefined);
  }

  async getUser(userId: string): Promise<User | null> {
    if (!this.ok) return null;
    try {
      const raw = await this.client.get(KEY_USER(userId));
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  async delUser(userId: string): Promise<void> {
    if (!this.ok) return;
    await this.client.del(KEY_USER(userId)).catch(() => undefined);
  }
}
