import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import request from 'supertest';
import { Redis } from 'ioredis';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/index.js';
import { createLogger } from '../src/observability/logger.js';
import type { DbPool } from '../src/services/db.js';
import type { RedisLike } from '../src/services/redis.js';
import { seed } from '../db/seed.js';
import { DEMO_PASSWORD, USERS } from '../db/fixtures.js';
import { baseTestEnv, TEST_DATABASE_URL, TEST_JWT_SECRET, TEST_REDIS_URL } from './fixtures/env.js';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export type LogLine = Record<string, any>;

export interface TestApp {
  http: ReturnType<typeof request>;
  config: AppConfig;
  pool: DbPool;
  redis: RedisLike;
  logs: LogLine[];
  prime: () => Promise<void>;
  close: () => Promise<void>;
}

export interface TestAppOptions {
  pool?: DbPool;
  redis?: RedisLike;
  env?: Record<string, string>;
}

/** Builds the real app in-process against the test database and Redis (unless stand-ins are given). */
export async function createTestApp(opts: TestAppOptions = {}): Promise<TestApp> {
  const config = loadConfig({ ...baseTestEnv(), ...(opts.env ?? {}) });
  const logs: LogLine[] = [];
  const logger = createLogger({ write: (line: string) => logs.push(JSON.parse(line)) }, 'debug');

  const realPool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
  const pool = opts.pool ?? (realPool as unknown as DbPool);

  let redis: RedisLike;
  let realRedis: Redis | undefined;
  if (opts.redis) {
    redis = opts.redis;
  } else {
    realRedis = new Redis(TEST_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    await realRedis.connect();
    redis = realRedis as unknown as RedisLike;
  }

  const { app, prime } = createApp({ config, logger, pool, redis });
  return {
    http: request(app),
    config,
    pool,
    redis,
    logs,
    prime,
    close: async () => {
      await realPool.end();
      realRedis?.disconnect();
    },
  };
}

export async function resetData(): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await seed(client);
  } finally {
    await client.end();
  }
}

export type SeededUser = keyof typeof USERS;

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export async function login(t: TestApp, who: SeededUser): Promise<Session> {
  const res = await t.http.post('/api/v1/auth/login').send({ email: USERS[who].email, password: DEMO_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`login as ${who} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Mint a token with the fake test secret (or another fake secret to forge one). */
export function mintToken(
  who: SeededUser,
  opts: { secret?: string; expSecondsFromNow?: number; sid?: string; claims?: Record<string, unknown> } = {},
): string {
  const u = USERS[who];
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: u.id,
      role: u.role,
      teamId: u.teamId,
      sid: opts.sid ?? '11111111-1111-4111-8111-111111111111',
      tv: 0,
      iat: now - 3600 * 48,
      exp: now + (opts.expSecondsFromNow ?? 600),
      iss: 'ims-api',
      ...(opts.claims ?? {}),
    },
    opts.secret ?? TEST_JWT_SECRET,
    { algorithm: 'HS256' },
  );
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

export function canConnect(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ port, host: '127.0.0.1' });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

export interface SpawnedServer {
  child: ChildProcess;
  output: () => string;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

/** Starts the real server as a child process. `ENV_FILE=none` keeps a developer's .env out of the test. */
export function spawnServer(env: Record<string, string | undefined>): SpawnedServer {
  const merged: Record<string, string | undefined> = { PATH: process.env.PATH, ENV_FILE: 'none', ...env };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: repoRoot,
    env: merged as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  child.stdout!.on('data', (d) => (buf += d));
  child.stderr!.on('data', (d) => (buf += d));
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return { child, output: () => buf, exit };
}

export async function waitFor<T>(fn: () => Promise<T | undefined | false> | T | undefined | false, timeoutMs: number, stepMs = 100) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return undefined;
}

export function raceExit(s: SpawnedServer, ms: number) {
  return Promise.race([
    s.exit.then((e) => ({ exited: true as const, ...e })),
    new Promise<{ exited: false; code: null; signal: null }>((r) =>
      setTimeout(() => r({ exited: false, code: null, signal: null }), ms),
    ),
  ]);
}

export function validServerEnv(port: number): Record<string, string> {
  return { ...baseTestEnv(), PORT: String(port) };
}
