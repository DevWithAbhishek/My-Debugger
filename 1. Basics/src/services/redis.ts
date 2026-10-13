import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/index.js';

/** The slice of ioredis the app actually uses. Tests inject stand-ins for this. */
export interface RedisLike {
  readonly status: string;
  connect(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

export function createRedis(config: AppConfig, logger: Logger): RedisLike {
  const client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
  client.on('error', (err: Error) => logger.warn({ err: err.message }, 'redis error'));
  return client as unknown as RedisLike;
}
