import pg from 'pg';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/index.js';

/** The slice of pg.Pool the app uses. Tests inject stand-ins for this. */
export interface DbPool {
  query<R extends pg.QueryResultRow = any>(text: string, params?: unknown[]): Promise<pg.QueryResult<R>>;
  end(): Promise<void>;
}

export function createPool(config: AppConfig, logger: Logger): DbPool {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => {
    logger.warn({ err: err.message }, 'idle database client error');
  });
  return pool as unknown as DbPool;
}
