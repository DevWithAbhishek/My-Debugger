#!/usr/bin/env node
// Simulate PostgreSQL going away (local docker compose only) and print what the running API reports.
//   node scripts/inject-db-outage.mjs            stop postgres, observe, leave it stopped
//   node scripts/inject-db-outage.mjs --restore  start postgres again
// The API server (npm start) must already be running.
import { BASE, call, login, requireApi, short, sleep } from './lib/http.mjs';
import { dc, requireCompose, waitHealthy } from './lib/outage.mjs';

requireCompose();
await requireApi();
const probe = ['exec', '-T', 'postgres', 'pg_isready', '-U', 'ims', '-d', 'ims'];

if (process.argv.includes('--restore')) {
  console.log('Starting postgres...');
  dc('start', 'postgres');
  if (await waitHealthy(probe, 'postgres')) console.log('postgres is accepting connections again.');
  await sleep(1500);
  console.log('GET /readyz ->', short(await call('GET', '/readyz')));
  process.exit(0);
}

console.log(`Target API: ${BASE}`);
const session = await login('alice@alpha.test');
const observe = async (label) => {
  console.log(`\n--- ${label} ---`);
  console.log('GET  /healthz                ->', short(await call('GET', '/healthz')));
  console.log('GET  /readyz                 ->', short(await call('GET', '/readyz')));
  console.log('GET  /api/v1/incidents (auth)->', short(await call('GET', '/api/v1/incidents', { token: session.accessToken })));
  console.log('POST /api/v1/auth/login      ->', short(await call('POST', '/api/v1/auth/login', { body: { email: 'bob@bravo.test', password: 'Passw0rd!demo' } })));
};

await observe('before outage');
console.log('\nStopping postgres (restore with: node scripts/inject-db-outage.mjs --restore)');
if (!dc('stop', 'postgres').ok) {
  console.error('docker compose stop postgres failed');
  process.exit(1);
}
await sleep(1500);
await observe('immediately after outage');
console.log('\nPostgres is still stopped. Re-run with --restore when finished.');
