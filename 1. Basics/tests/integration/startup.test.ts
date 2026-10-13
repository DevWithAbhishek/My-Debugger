import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canConnect, freePort, raceExit, repoRoot, spawnServer, validServerEnv, waitFor, type SpawnedServer } from '../helpers.js';

describe('process startup contract', () => {
  let current: SpawnedServer | undefined;

  afterEach(() => {
    current?.child.kill('SIGKILL');
    current = undefined;
    // a bad PORT value can leave a stray unix-socket file named after the value
    rmSync(join(repoRoot, 'abc'), { force: true });
  });

  it('listens on the configured port when configuration is valid', async () => {
    const port = await freePort();
    current = spawnServer(validServerEnv(port));
    const up = await waitFor(() => canConnect(port), 8000);
    expect(up, `server never accepted connections.\n${current.output()}`).toBe(true);
  });

  it('exits non-zero when the JWT secret is too short', async () => {
    const port = await freePort();
    current = spawnServer({ ...validServerEnv(port), JWT_SECRET: 'short' });
    const r = await raceExit(current, 8000);
    expect(r.exited, current.output()).toBe(true);
    expect(r.code).not.toBe(0);
  });

  it('refuses to start when DATABASE_URL is not provided', async () => {
    const port = await freePort();
    const env: Record<string, string | undefined> = { ...validServerEnv(port), DATABASE_URL: undefined };
    current = spawnServer(env);
    const r = await raceExit(current, 6000);
    const listening = await canConnect(port);
    expect(
      { exited: r.exited, code: r.code, listening },
      `observed startup behaviour (expected: exit non-zero, never listen).\n--- output ---\n${current.output().slice(-900)}`,
    ).toMatchObject({ exited: true, listening: false });
    expect(r.code).not.toBe(0);
    expect(current.output()).toMatch(/DATABASE_URL/);
  });

  it('refuses to start when PORT is not a valid port number', async () => {
    const env = { ...validServerEnv(0), PORT: 'abc' };
    current = spawnServer(env);
    const r = await raceExit(current, 6000);
    expect(
      { exited: r.exited, code: r.code },
      `observed startup behaviour (expected: exit non-zero).\n--- output ---\n${current.output().slice(-900)}`,
    ).toMatchObject({ exited: true });
    expect(r.code).not.toBe(0);
    expect(current.output()).toMatch(/PORT/);
  });
});
