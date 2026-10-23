import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, USERS } from '../../db/fixtures.js';
import { bearer, createTestApp, login, resetData, type TestApp } from '../helpers.js';
import type { DbPool } from '../../src/services/db.js';
import type { RedisLike } from '../../src/services/redis.js';

/** A pool whose connectivity can be switched off, to simulate PostgreSQL going away. */
function switchablePool(real: DbPool) {
  let up = true;
  const refused = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3002'), { code: 'ECONNREFUSED' });
  const pool: DbPool = {
    query: ((text: string, params?: unknown[]) => (up ? real.query(text, params) : Promise.reject(refused()))) as DbPool['query'],
    end: () => real.end(),
  };
  return { pool, setUp: (v: boolean) => (up = v) };
}

/** A Redis stand-in that mimics ioredis when the server is gone: reconnecting, every command failing. */
function switchableRedis(real: RedisLike) {
  let up = true;
  const down = () => Promise.reject(new Error('Stream isn\'t writeable and enableOfflineQueue options is false'));
  const redis: RedisLike = {
    get status() {
      return up ? real.status : 'reconnecting';
    },
    connect: () => real.connect(),
    get: (k) => (up ? real.get(k) : down()),
    set: ((k: string, v: string, m: 'EX', s: number) => (up ? real.set(k, v, m, s) : down())) as RedisLike['set'],
    ping: () => (up ? real.ping() : down()),
    quit: () => real.quit(),
  };
  return { redis, setUp: (v: boolean) => (up = v) };
}

describe('dependency outage behaviour', () => {
  let base: TestApp;
  beforeAll(async () => {
    await resetData();
    base = await createTestApp();
  });
  afterAll(async () => base.close());

  it('keeps liveness green even when dependencies are down', async () => {
    const db = switchablePool(base.pool);
    db.setUp(false);
    const t = await createTestApp({ pool: db.pool, redis: base.redis });
    expect((await t.http.get('/healthz')).status).toBe(200);
  });

  it('reports not-ready as soon as the database stops answering', async () => {
    const db = switchablePool(base.pool);
    const t = await createTestApp({ pool: db.pool, redis: base.redis });
    await t.prime();
    expect((await t.http.get('/readyz')).status).toBe(200);

    db.setUp(false);
    const res = await t.http.get('/readyz');
    expect(res.status, `readyz body: ${JSON.stringify(res.body)}`).toBe(503);
    expect(res.body.checks.database).toBe('fail');
  });

  it('reports not-ready when the database is down from the start', async () => {
    const db = switchablePool(base.pool);
    db.setUp(false);
    const t = await createTestApp({ pool: db.pool, redis: base.redis });
    expect((await t.http.get('/readyz')).status).toBe(503);
  });

  it('answers database-backed requests with a controlled 503 while the database is unreachable', async () => {
    const db = switchablePool(base.pool);
    db.setUp(false);
    const t = await createTestApp({ pool: db.pool, redis: base.redis });
    const res = await t.http.post('/api/v1/auth/login').send({ email: USERS.alice.email, password: DEMO_PASSWORD });
    expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 300)}`).toBe(503);
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('reports not-ready when Redis is unreachable', async () => {
    const r = switchableRedis(base.redis);
    r.setUp(false);
    const t = await createTestApp({ redis: r.redis });
    const res = await t.http.get('/readyz');
    expect(res.status, `readyz body: ${JSON.stringify(res.body)}`).toBe(503);
    expect(res.body.checks.redis).toBe('fail');
  });

  it('does not treat unreadable revocation state as "not revoked"', async () => {
    const r = switchableRedis(base.redis);
    const t = await createTestApp({ redis: r.redis });
    const { accessToken } = await login(t, 'alice');
    r.setUp(false);
    const res = await t.http.get('/api/v1/incidents').set(bearer(accessToken));
    expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 200)}`).toBe(503);
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
  });
});
