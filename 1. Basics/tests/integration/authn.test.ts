import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INCIDENTS } from '../../db/fixtures.js';
import { OTHER_JWT_SECRET, TEST_JWT_SECRET } from '../fixtures/env.js';
import { bearer, createTestApp, login, mintToken, resetData, type TestApp } from '../helpers.js';

const ME = '/api/v1/auth/me';
const LEGACY = `/api/v1/legacy/incidents/${INCIDENTS.alpha1.id}`;

describe('authentication contract', () => {
  let t: TestApp;
  beforeAll(async () => {
    await resetData();
    t = await createTestApp();
  });
  afterAll(async () => t.close());

  it('accepts a valid access token', async () => {
    const { accessToken } = await login(t, 'alice');
    expect((await t.http.get(ME).set(bearer(accessToken))).status).toBe(200);
  });

  it('answers a request without an Authorization header with 401 UNAUTHENTICATED', async () => {
    const res = await t.http.get(ME);
    expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 200)}`).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects a token that expired ten minutes ago', async () => {
    const token = mintToken('alice', { expSecondsFromNow: -600 });
    const res = await t.http.get(ME).set(bearer(token));
    expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 200)}`).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('reports TOKEN_EXPIRED for a token that expired two hours ago', async () => {
    const token = mintToken('alice', { expSecondsFromNow: -7200 });
    const res = await t.http.get(ME).set(bearer(token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects an expired token on the legacy dashboard route', async () => {
    const token = mintToken('alice', { expSecondsFromNow: -86_400 });
    const res = await t.http.get(LEGACY).set(bearer(token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token signed with a different key', async () => {
    const forged = mintToken('admin', { secret: OTHER_JWT_SECRET });
    const res = await t.http.get(ME).set(bearer(forged));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token with alg=none', async () => {
    const unsigned = jwt.sign({ sub: 'x', role: 'admin', teamId: null, sid: 's' }, '', { algorithm: 'none' });
    const res = await t.http.get(ME).set(bearer(unsigned));
    expect(res.status).toBe(401);
  });

  it('rejects a forged token on the legacy dashboard route', async () => {
    const forged = mintToken('admin', { secret: OTHER_JWT_SECRET });
    const res = await t.http.get(LEGACY).set(bearer(forged));
    expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 200)}`).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('still serves the legacy route to a genuine token', async () => {
    const token = mintToken('alice', { secret: TEST_JWT_SECRET });
    const res = await t.http.get(LEGACY).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
