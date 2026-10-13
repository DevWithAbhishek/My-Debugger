import type { Logger } from 'pino';
import type { AppConfig } from './config/index.js';
import type { DbPool } from './services/db.js';
import type { RedisLike } from './services/redis.js';

export type Role = 'viewer' | 'responder' | 'admin';

export interface AuthContext {
  userId: string;
  role: Role;
  teamId: string | null;
  sid: string;
}

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  pool: DbPool;
  redis: RedisLike;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      auth?: AuthContext;
    }
  }
}
