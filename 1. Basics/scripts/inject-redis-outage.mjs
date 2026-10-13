#!/usr/bin/env node
// Simulate Redis going away (local docker compose only) and print what the running API reports.
//   node scripts/inject-redis-outage.mjs            stop redis, observe, leave it stopped
//   node scripts/inject-redis-outage.mjs --restore  start redis again
// The API server (npm start) must already be running.
import { BASE, call, login, requireApi, short, sleep } from './lib/http.mjs';
import { dc, requireCompose, waitHealthy } from './lib/outage.mjs';

requireCompose();
await requireApi();
const probe = ['exec', '-T', 'redis', 'redis-cli', 'ping'];

if (process.argv.includes('--restore')) {
  console.log('Starting redis...');
  dc('start', 'redis');
  if (await waitHealthy(probe, 'redis')) console.log('redis is answering PING again.');
  await sleep(2500); // ioredis reconnect backoff
  console.log('GET /readyz ->', short(await call('GET', '/readyz')));
  process.exit(0);
}

console.log(`Target API: ${BASE}`);
// Session A stays valid. Session B is logged out first, so its access token must be rejected.
const a = await login('alice@alpha.test');
const b = await login('alice@alpha.test');
await call('POST', '/api/v1/auth/logout', { token: b.accessToken });

const observe = async (label) => {
  console.log(`\n--- ${label} ---`);
  console.log('GET /readyz                          ->', short(await call('GET', '/readyz')));
  console.log('GET /api/v1/auth/me  (valid session) ->', short(await call('GET', '/api/v1/auth/me', { token: a.accessToken })));
  console.log('GET /api/v1/auth/me  (logged-out)    ->', short(await call('GET', '/api/v1/auth/me', { token: b.accessToken })));
};

await observe('before outage');
console.log('\nStopping redis (restore with: node scripts/inject-redis-outage.mjs --restore)');
if (!dc('stop', 'redis').ok) {
  console.error('docker compose stop redis failed');
  process.exit(1);
}
await sleep(1500);
await observe('immediately after outage');
console.log('\nRedis is still stopped. Re-run with --restore when finished.');
