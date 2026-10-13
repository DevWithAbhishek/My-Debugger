import pg from 'pg';
import { Redis } from 'ioredis';
import { migrate } from '../db/migrate.js';
import { seed } from '../db/seed.js';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './fixtures/env.js';

/**
 * Prepares the isolated test database and Redis logical db 15.
 * Requires PostgreSQL and Redis to be running (see README: `docker compose up -d`).
 */
export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Cannot reach the test database at ${TEST_DATABASE_URL}.\n` +
        `Start dependencies first: docker compose up -d   (original error: ${(err as Error).message})`,
    );
  }
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(client);
  await seed(client);
  await client.end();

  const redis = new Redis(TEST_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.flushdb();
  } catch (err) {
    throw new Error(`Cannot reach Redis at ${TEST_REDIS_URL}: ${(err as Error).message}`);
  } finally {
    redis.disconnect();
  }
}
