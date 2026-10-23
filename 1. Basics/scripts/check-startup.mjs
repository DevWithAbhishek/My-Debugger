#!/usr/bin/env node
// Prints what the server does on bad configuration, so you can see it without reading code.
//   node scripts/check-startup.mjs missing-db     DATABASE_URL unset
//   node scripts/check-startup.mjs bad-port       PORT=abc
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from './lib/http.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = process.argv[2];
if (!['missing-db', 'bad-port'].includes(which)) {
  console.error('usage: node scripts/check-startup.mjs <missing-db|bad-port>');
  process.exit(64);
}

const env = {
  PATH: process.env.PATH,
  ENV_FILE: 'none', // ignore any local .env so only the variables below apply
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: which === 'bad-port' ? 'abc' : '3999',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/0',
  JWT_SECRET: 'local-dev-only-secret-do-not-reuse-0123456789',
};
if (which === 'bad-port') env.DATABASE_URL = "postgresql://postgres:postgres@localhost:3002/imsDebug";

console.log(`starting server with ${which === 'bad-port' ? 'PORT=abc' : 'DATABASE_URL unset'} ...`);
let out = '';
const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));
const exit = new Promise((r) => child.once('exit', (code) => r(code)));
const code = await Promise.race([exit, sleep(4000).then(() => 'still-running')]);

let tcp = 'n/a';
if (which === 'missing-db' && code === 'still-running') {
  tcp = await new Promise((r) => {
    const s = createConnection({ port: 3999, host: '127.0.0.1' }, () => { s.destroy(); r('port 3999 ACCEPTS connections'); });
    s.on('error', () => r('port 3999 refuses connections'));
  });
}
console.log(`\nafter 4s: ${code === 'still-running' ? 'process is STILL RUNNING' : `process exited with code ${code}`}`);
if (tcp !== 'n/a') console.log(tcp);
console.log('\n--- server output ---\n' + out.trim().split('\n').slice(0, 8).join('\n'));
child.kill('SIGKILL');
await sleep(200);
rmSync(join(root, 'abc'), { force: true });
process.exit(code === 'still-running' ? 1 : code);
