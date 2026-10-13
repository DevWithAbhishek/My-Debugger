#!/usr/bin/env node
// Starts the server as a child process, sends one slow request, delivers SIGTERM mid-request, and reports
// what happened. Requires PostgreSQL + Redis to be running. Every step is time-bounded.
//   node scripts/test-graceful-shutdown.mjs            (exit code 0 = graceful, 1 = not graceful)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from './lib/http.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLOW_MS = 2000;
const SIGNAL_AFTER_MS = 400;

const port = await new Promise((resolve) => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

const t0 = Date.now();
const stamp = () => `[+${String(Date.now() - t0).padStart(5)}ms]`;
let output = '';
const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ENABLE_DEBUG_ROUTES: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));
const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal, at: Date.now() - t0 })));

const base = `http://127.0.0.1:${port}`;
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try { up = (await fetch(base + '/healthz', { signal: AbortSignal.timeout(500) })).ok; } catch { await sleep(150); }
}
if (!up) {
  console.error('server did not start:\n' + output.slice(-800));
  child.kill('SIGKILL');
  process.exit(2);
}
console.log(`${stamp()} server up on port ${port}`);

const slow = fetch(`${base}/api/v1/debug/slow?ms=${SLOW_MS}`, { signal: AbortSignal.timeout(8000) })
  .then(async (r) => ({ ok: true, status: r.status, body: await r.text(), at: Date.now() - t0 }))
  .catch((e) => ({ ok: false, error: e.cause?.code ?? e.message, at: Date.now() - t0 }));
console.log(`${stamp()} slow request started (${SLOW_MS}ms)`);

await sleep(SIGNAL_AFTER_MS);
console.log(`${stamp()} sending SIGTERM`);
child.kill('SIGTERM');

const late = await fetch(base + '/healthz', { signal: AbortSignal.timeout(1000) })
  .then((r) => `answered ${r.status}`)
  .catch((e) => `refused/failed (${e.cause?.code ?? e.message})`);
console.log(`${stamp()} new request right after SIGTERM: ${late}`);

const slowResult = await slow;
console.log(`${stamp()} slow request outcome: ${slowResult.ok ? `HTTP ${slowResult.status}` : `FAILED (${slowResult.error})`}`);

const exit = await Promise.race([exited, sleep(8000).then(() => null)]);
if (exit === null) {
  console.log(`${stamp()} process still running 8s after SIGTERM (hung)`);
  child.kill('SIGKILL');
} else {
  console.log(`${stamp()} process exited code=${exit.code} signal=${exit.signal}`);
}

const graceful = slowResult.ok && slowResult.status === 200 && exit && exit.code === 0;
console.log(`\nRESULT: ${graceful ? 'PASS - in-flight request completed, process exited cleanly' : 'FAIL - shutdown was not graceful'}`);
if (!graceful) console.log('\nserver output (tail):\n' + output.split('\n').slice(-6).join('\n'));
process.exit(graceful ? 0 : 1);
