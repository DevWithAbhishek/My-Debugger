import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INCIDENTS, TEAMS } from '../../db/fixtures.js';
import { bearer, createTestApp, login, resetData, type TestApp } from '../helpers.js';

describe('authorization contract', () => {
  let t: TestApp;
  beforeAll(async () => {
    await resetData();
    t = await createTestApp();
  });
  afterAll(async () => t.close());

  describe('role restrictions', () => {
    it('lets an admin read the cross-team summary report', async () => {
      const { accessToken } = await login(t, 'admin');
      const res = await t.http.get('/api/v1/admin/reports/summary').set(bearer(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.teams.length).toBe(3);
    });

    it('denies a viewer on the admin user list', async () => {
      const { accessToken } = await login(t, 'victor');
      const res = await t.http.get('/api/v1/admin/users').set(bearer(accessToken));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('denies a viewer on the admin summary report', async () => {
      const { accessToken } = await login(t, 'victor');
      const res = await t.http.get('/api/v1/admin/reports/summary').set(bearer(accessToken));
      expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 160)}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('denies a responder on the admin summary report', async () => {
      const { accessToken } = await login(t, 'alice');
      const res = await t.http.get('/api/v1/admin/reports/summary').set(bearer(accessToken));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });
  });

  describe('team boundaries', () => {
    it('denies reading another team\'s incident', async () => {
      const { accessToken } = await login(t, 'alice');
      const res = await t.http.get(`/api/v1/incidents/${INCIDENTS.bravo1.id}`).set(bearer(accessToken));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TEAM_ACCESS_DENIED');
    });

    it('denies changing another team\'s incident status', async () => {
      const { accessToken } = await login(t, 'alice');
      const res = await t.http
        .patch(`/api/v1/incidents/${INCIDENTS.bravo1.id}/status`)
        .set(bearer(accessToken))
        .send({ status: 'resolved' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TEAM_ACCESS_DENIED');
    });

    it('denies posting a note on another team\'s incident', async () => {
      const { accessToken } = await login(t, 'alice');
      const res = await t.http
        .post(`/api/v1/incidents/${INCIDENTS.bravo1.id}/notes`)
        .set(bearer(accessToken))
        .send({ body: 'hello from the wrong team' });
      expect(res.status).toBe(403);
    });

    it('denies reading the notes of another team\'s incident', async () => {
      const { accessToken } = await login(t, 'alice');
      const res = await t.http.get(`/api/v1/incidents/${INCIDENTS.bravo1.id}/notes`).set(bearer(accessToken));
      expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 200)}`).toBe(403);
      expect(res.body.error.code).toBe('TEAM_ACCESS_DENIED');
    });

    it('lets a team member read their own incident notes', async () => {
      const { accessToken } = await login(t, 'victor');
      const res = await t.http.get(`/api/v1/incidents/${INCIDENTS.alpha1.id}/notes`).set(bearer(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
    });
  });

  describe('callers without a team', () => {
    it('denies listing incidents', async () => {
      const { accessToken } = await login(t, 'nora');
      const res = await t.http.get('/api/v1/incidents').set(bearer(accessToken));
      expect(res.status, `returned ${res.body?.items?.length ?? '?'} incidents; body ${JSON.stringify(res.body).slice(0, 120)}`).toBe(403);
      expect(res.body.error.code).toBe('TEAM_ACCESS_DENIED');
    });

    it('denies creating an incident', async () => {
      const { accessToken } = await login(t, 'nora');
      const res = await t.http
        .post('/api/v1/incidents')
        .set(bearer(accessToken))
        .send({ title: 'No team to attach to', severity: 'sev4' });
      expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 160)}`).toBe(403);
      expect(res.body.error.code).toBe('TEAM_ACCESS_DENIED');
    });

    it('denies reading a single incident', async () => {
      const { accessToken } = await login(t, 'nora');
      const res = await t.http.get(`/api/v1/incidents/${INCIDENTS.alpha1.id}`).set(bearer(accessToken));
      expect(res.status).toBe(403);
    });

    it('still lets an admin (who has no team by design) see every team', async () => {
      const { accessToken } = await login(t, 'admin');
      const res = await t.http.get('/api/v1/incidents?limit=100').set(bearer(accessToken));
      const teams = new Set(res.body.items.map((i: any) => i.teamId));
      expect(teams).toEqual(new Set([TEAMS.alpha.id, TEAMS.bravo.id, TEAMS.delta.id]));
    });
  });
});
