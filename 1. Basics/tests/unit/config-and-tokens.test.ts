import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { hashRefreshToken, newRefreshToken, signAccessToken, verifyAccessToken } from '../../src/auth/tokens.js';
import { baseTestEnv } from '../fixtures/env.js';

describe('configuration loading', () => {
  it('loads a complete environment', () => {
    const cfg = loadConfig(baseTestEnv());
    expect(cfg.accessTtlSeconds).toBe(900);
    expect(cfg.enableDebugRoutes).toBe(true);
  });

  it('rejects a JWT secret that is too short', () => {
    expect(() => loadConfig({ ...baseTestEnv(), JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a malformed Redis URL', () => {
    expect(() => loadConfig({ ...baseTestEnv(), REDIS_URL: 'not a url' })).toThrow(/REDIS_URL/);
  });
});

describe('token helpers', () => {
  const cfg = loadConfig(baseTestEnv());
  const claims = { sub: 'u1', role: 'viewer' as const, teamId: null, sid: 's1', tv: 0 };

  it('round-trips access token claims', () => {
    const decoded = verifyAccessToken(cfg, signAccessToken(cfg, claims));
    expect(decoded.sub).toBe('u1');
    expect(decoded.role).toBe('viewer');
  });

  it('produces unguessable, hash-stable refresh tokens', () => {
    const a = newRefreshToken();
    const b = newRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect(hashRefreshToken(a.token)).toBe(a.hash);
  });
});
