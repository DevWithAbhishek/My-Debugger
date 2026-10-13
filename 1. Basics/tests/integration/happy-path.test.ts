import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INCIDENTS, TEAMS, USERS, DEMO_PASSWORD } from '../../db/fixtures.js';
import { bearer, createTestApp, login, resetData, type TestApp } from '../helpers.js';

describe('core flows', () => {
  let t: TestApp;
  beforeAll(async () => {
    await resetData();
    t = await createTestApp();
  });
  afterAll(async () => t.close());

  it('serves liveness and readiness when dependencies are healthy', async () => {
    expect((await t.http.get('/healthz')).status).toBe(200);
    const ready = await t.http.get('/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
  });

  it('logs in a seeded user and returns a token pair', async () => {
    const res = await t.http.post('/api/v1/auth/login').send({ email: USERS.alice.email, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBe(900);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects a wrong password', async () => {
    const res = await t.http.post('/api/v1/auth/login').send({ email: USERS.alice.email, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns the caller profile from /me', async () => {
    const { accessToken } = await login(t, 'alice');
    const res = await t.http.get('/api/v1/auth/me').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(USERS.alice.email);
    expect(res.body.teamName).toBe(TEAMS.alpha.name);
  });

  it('lists only the caller team incidents', async () => {
    const { accessToken } = await login(t, 'alice');
    const res = await t.http.get('/api/v1/incidents').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
    expect(res.body.items.every((i: any) => i.teamId === TEAMS.alpha.id)).toBe(true);
  });

  it('lets an admin see incidents across teams', async () => {
    const { accessToken } = await login(t, 'admin');
    const res = await t.http.get('/api/v1/incidents').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(6);
  });

  it('lets a responder create an incident and a viewer not', async () => {
    const alice = await login(t, 'alice');
    const created = await t.http
      .post('/api/v1/incidents')
      .set(bearer(alice.accessToken))
      .send({ title: 'Disk pressure on worker-3', severity: 'sev3' });
    expect(created.status).toBe(201);
    expect(created.body.teamId).toBe(TEAMS.alpha.id);

    const victor = await login(t, 'victor');
    const denied = await t.http
      .post('/api/v1/incidents')
      .set(bearer(victor.accessToken))
      .send({ title: 'Should not be allowed', severity: 'sev3' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('updates incident status for the owning team', async () => {
    const { accessToken } = await login(t, 'alice');
    const res = await t.http
      .patch(`/api/v1/incidents/${INCIDENTS.alpha1.id}/status`)
      .set(bearer(accessToken))
      .send({ status: 'acknowledged' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('acknowledged');
  });

  it('rotates a refresh token into a new pair', async () => {
    const first = await login(t, 'bob');
    const res = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(first.refreshToken);
  });

  it('revokes the session on logout', async () => {
    const { accessToken } = await login(t, 'bob');
    expect((await t.http.post('/api/v1/auth/logout').set(bearer(accessToken))).status).toBe(204);
    const after = await t.http.get('/api/v1/auth/me').set(bearer(accessToken));
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('SESSION_REVOKED');
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await t.http.get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });
});
