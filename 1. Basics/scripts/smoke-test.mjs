#!/usr/bin/env node
// Happy-path smoke test against a running server (npm start). Usage: node scripts/smoke-test.mjs
import { BASE, call, login } from './lib/http.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
};

console.log(`smoke test against ${BASE}\n`);
const live = await call('GET', '/healthz');
check('GET /healthz is 200', live.status === 200, `got ${live.status || live.error}`);
if (live.status === 0) {
  console.log('\nServer is not reachable. Start it with `npm start` (and dependencies with `docker compose up -d`).');
  process.exit(2);
}
const ready = await call('GET', '/readyz');
check('GET /readyz is 200', ready.status === 200, `got ${ready.status}`);

const session = await login('alice@alpha.test').catch((e) => ({ error: e.message }));
check('login as alice@alpha.test', !!session.accessToken, session.error ?? '');
if (session.accessToken) {
  const me = await call('GET', '/api/v1/auth/me', { token: session.accessToken });
  check('GET /api/v1/auth/me', me.status === 200 && me.json?.email === 'alice@alpha.test', `got ${me.status}`);
  const list = await call('GET', '/api/v1/incidents', { token: session.accessToken });
  check('GET /api/v1/incidents', list.status === 200 && list.json?.items?.length > 0, `got ${list.status}`);
  const created = await call('POST', '/api/v1/incidents', {
    token: session.accessToken,
    body: { title: 'Smoke test incident', severity: 'sev4' },
  });
  check('POST /api/v1/incidents', created.status === 201, `got ${created.status}`);
  const refreshed = await call('POST', '/api/v1/auth/refresh', { body: { refreshToken: session.refreshToken } });
  check('POST /api/v1/auth/refresh', refreshed.status === 200, `got ${refreshed.status}`);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed (happy path only - this does not test the contracts in docs/API.md)`);
process.exit(results.every(Boolean) ? 0 : 1);
