import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INCIDENTS } from '../../db/fixtures.js';
import { bearer, createTestApp, login, resetData, type TestApp } from '../helpers.js';

describe('error envelope contract', () => {
  let t: TestApp;
  beforeAll(async () => {
    await resetData();
    t = await createTestApp();
  });
  afterAll(async () => t.close());

  it('wraps unexpected failures in the standard 500 envelope without internal detail', async () => {
    const res = await t.http.get('/api/v1/debug/boom');
    expect(res.status).toBe(500);
    expect(res.body.error?.code, `body was ${JSON.stringify(res.body).slice(0, 300)}`).toBe('INTERNAL_ERROR');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('simulated failure');
    expect(text).not.toMatch(/\.ts:\d+|node_modules|stack/i);
  });

  it('answers malformed JSON with a controlled 400', async () => {
    const res = await t.http.post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 300)}`).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(JSON.stringify(res.body)).not.toMatch(/Unexpected|position|JSON\.parse/);
  });

  it('answers a body that fails validation with 400 VALIDATION_ERROR and field details', async () => {
    const res = await t.http.post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 300)}`).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    for (const d of res.body.error.details) {
      expect(Object.keys(d).sort()).toEqual(['message', 'path']);
    }
    expect(res.body.error.details.map((d: any) => d.path)).toContain('email');
  });

  it('validates the status value when updating an incident', async () => {
    const { accessToken } = await login(t, 'alice');
    const res = await t.http
      .patch(`/api/v1/incidents/${INCIDENTS.alpha1.id}/status`)
      .set(bearer(accessToken))
      .send({ status: 'on-fire' });
    expect(res.status, `body was ${JSON.stringify(res.body).slice(0, 300)}`).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('echoes a caller-supplied request id on standard routes', async () => {
    const res = await t.http.get('/api/v1/nope').set('X-Request-Id', 'client-supplied-1234');
    expect(res.headers['x-request-id']).toBe('client-supplied-1234');
    expect(res.body.error.requestId).toBe('client-supplied-1234');
    const lines = t.logs.filter((l) => l.requestId === 'client-supplied-1234');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('keeps response header, error body and log lines on one request id for every route', async () => {
    const res = await t.http.get(`/api/v1/legacy/incidents/${INCIDENTS.alpha1.id}`);
    const headerId = res.headers['x-request-id'];
    expect(headerId, 'response should carry an X-Request-Id header').toBeTruthy();
    expect(res.body.error.requestId).toBe(headerId);
    const lines = t.logs.filter((l) => l.requestId === headerId);
    expect(lines.length, 'log lines should be correlated by request id').toBeGreaterThan(0);
  });
});
