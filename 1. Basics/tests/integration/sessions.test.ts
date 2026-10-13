import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, INCIDENTS, TEAMS, USERS } from '../../db/fixtures.js';
import { bearer, createTestApp, login, resetData, type TestApp } from '../helpers.js';

describe('session lifecycle contract', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t.close());
  beforeEach(async () => {
    await resetData();
  });

  const refresh = (token: string) => t.http.post('/api/v1/auth/refresh').send({ refreshToken: token });

  async function adminToken() {
    return (await login(t, 'admin')).accessToken;
  }

  describe('refresh token rotation', () => {
    it('rejects a rotated refresh token when it is presented again', async () => {
      const s = await login(t, 'alice');
      const rotated = await refresh(s.refreshToken);
      expect(rotated.status).toBe(200);
      const replay = await refresh(s.refreshToken);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    });

    it('ends the whole session when a rotated token is replayed', async () => {
      const s = await login(t, 'alice');
      const rotated = await refresh(s.refreshToken);
      await refresh(s.refreshToken); // replay of the old token

      const newest = await refresh(rotated.body.refreshToken);
      expect(newest.status, `newest token in the family: ${newest.status} ${JSON.stringify(newest.body).slice(0, 120)}`).toBe(401);
    });

    it('also rejects access tokens belonging to a compromised session', async () => {
      const s = await login(t, 'alice');
      const rotated = await refresh(s.refreshToken);
      await refresh(s.refreshToken); // replay of the old token
      const res = await t.http.get('/api/v1/auth/me').set(bearer(rotated.body.accessToken));
      expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 120)}`).toBe(401);
    });

    it('leaves other sessions of the same user alone', async () => {
      const laptop = await login(t, 'alice');
      const phone = await login(t, 'alice');
      const rotated = await refresh(laptop.refreshToken);
      await refresh(laptop.refreshToken); // replay
      expect((await refresh(phone.refreshToken)).status).toBe(200);
      expect(rotated.status).toBe(200);
    });
  });

  describe('changes made by an admin take effect', () => {
    it('applies a role demotion to an access token issued before the change', async () => {
      const alice = await login(t, 'alice');
      const patch = await t.http
        .patch(`/api/v1/admin/users/${USERS.alice.id}`)
        .set(bearer(await adminToken()))
        .send({ role: 'viewer' });
      expect(patch.status).toBe(200);

      const res = await t.http
        .post('/api/v1/incidents')
        .set(bearer(alice.accessToken))
        .send({ title: 'Created after demotion', severity: 'sev4' });
      expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 160)}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('applies a team move to an access token issued before the change', async () => {
      const alice = await login(t, 'alice');
      await t.http
        .patch(`/api/v1/admin/users/${USERS.alice.id}`)
        .set(bearer(await adminToken()))
        .send({ teamId: TEAMS.bravo.id });

      const res = await t.http.get(`/api/v1/incidents/${INCIDENTS.alpha1.id}`).set(bearer(alice.accessToken));
      expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 160)}`).toBe(403);
      expect(res.body.error.code).toBe('TEAM_ACCESS_DENIED');
    });

    it('cuts off an existing access token when the user is disabled', async () => {
      const alice = await login(t, 'alice');
      await t.http
        .patch(`/api/v1/admin/users/${USERS.alice.id}`)
        .set(bearer(await adminToken()))
        .send({ status: 'disabled' });

      const res = await t.http.get('/api/v1/incidents').set(bearer(alice.accessToken));
      expect([401, 403], `status was ${res.status}`).toContain(res.status);
    });

    it('refuses to refresh a disabled user\'s session', async () => {
      const alice = await login(t, 'alice');
      await t.http
        .patch(`/api/v1/admin/users/${USERS.alice.id}`)
        .set(bearer(await adminToken()))
        .send({ status: 'disabled' });

      const res = await refresh(alice.refreshToken);
      expect([401, 403], `status was ${res.status}`).toContain(res.status);
    });

    it('refuses new logins for a disabled user', async () => {
      await t.http
        .patch(`/api/v1/admin/users/${USERS.alice.id}`)
        .set(bearer(await adminToken()))
        .send({ status: 'disabled' });
      const res = await t.http.post('/api/v1/auth/login').send({ email: USERS.alice.email, password: DEMO_PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    });

    it('issues fresh claims when a demoted user refreshes', async () => {
      const alice = await login(t, 'alice');
      await t.http
        .patch(`/api/v1/admin/users/${USERS.alice.id}`)
        .set(bearer(await adminToken()))
        .send({ role: 'viewer' });
      const rotated = await refresh(alice.refreshToken);
      expect(rotated.status).toBe(200);
      expect(rotated.body.user.role).toBe('viewer');
    });
  });

  describe('team deactivation', () => {
    const deactivateDelta = async () =>
      t.http.post(`/api/v1/admin/teams/${TEAMS.delta.id}/deactivate`).set(bearer(await adminToken()));

    it('refuses new logins for members of a deactivated team', async () => {
      expect((await deactivateDelta()).status).toBe(200);
      const res = await t.http.post('/api/v1/auth/login').send({ email: USERS.dana.email, password: DEMO_PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TEAM_INACTIVE');
    });

    it('refuses to refresh sessions of a deactivated team', async () => {
      const dana = await login(t, 'dana');
      await deactivateDelta();
      const res = await refresh(dana.refreshToken);
      expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 160)}`).toBe(403);
      expect(res.body.error.code).toBe('TEAM_INACTIVE');
    });

    it('denies team-scoped routes to existing access tokens of a deactivated team', async () => {
      const dana = await login(t, 'dana');
      await deactivateDelta();
      const res = await t.http.get('/api/v1/incidents').set(bearer(dana.accessToken));
      expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 160)}`).toBe(403);
      expect(res.body.error.code).toBe('TEAM_INACTIVE');
    });

    it('lets admins keep reading a deactivated team\'s data', async () => {
      await deactivateDelta();
      const res = await t.http.get(`/api/v1/incidents/${INCIDENTS.delta1.id}`).set(bearer(await adminToken()));
      expect(res.status).toBe(200);
    });

    it('restores access when the team is reactivated', async () => {
      await deactivateDelta();
      await t.http.post(`/api/v1/admin/teams/${TEAMS.delta.id}/activate`).set(bearer(await adminToken()));
      const res = await t.http.post('/api/v1/auth/login').send({ email: USERS.dana.email, password: DEMO_PASSWORD });
      expect(res.status).toBe(200);
    });
  });
});
