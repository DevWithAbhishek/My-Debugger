import { describe, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import { canConnect, freePort, raceExit, spawnServer, validServerEnv, waitFor } from '../helpers.js';

function get(port: number, path: string, timeoutMs: number) {
  return new Promise<{ status?: number; body?: string; error?: string }>((resolve) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET', timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'client timeout' });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
}

describe('graceful shutdown', () => {
  it('lets an in-flight request finish after SIGTERM and then exits cleanly', async () => {
    const port = await freePort();
    const s = spawnServer(validServerEnv(port));
    try {
      const up = await waitFor(() => canConnect(port), 8000);
      expect(up, s.output()).toBe(true);
      // wait until the app answers, so the pool and redis are warm
      await waitFor(async () => (await get(port, '/healthz', 1000)).status === 200, 5000);

      const slow = get(port, '/api/v1/debug/slow?ms=1500', 6000);
      await new Promise((r) => setTimeout(r, 300));
      s.child.kill('SIGTERM');

      const result = await slow;
      expect(result, `in-flight request outcome. server output:\n${s.output().slice(-600)}`).toMatchObject({ status: 200 });

      const exit = await raceExit(s, 8000);
      expect(exit.exited, 'process should exit on its own within 8s').toBe(true);
      expect(exit.code).toBe(0);
    } finally {
      s.child.kill('SIGKILL');
    }
  });
});
