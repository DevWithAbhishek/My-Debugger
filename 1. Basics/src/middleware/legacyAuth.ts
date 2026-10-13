import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { Errors } from '../errors/AppError.js';
import type { AccessClaims } from '../auth/tokens.js';

/**
 * Auth helper for the old dashboard routes. It predates the shared middleware and
 * the dashboard team asked us not to change its behaviour. Do not use for new code.
 */
export function legacyAuth(): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return next(Errors.unauthenticated());
    const payload = jwt.decode(header.slice(7)) as (AccessClaims & { exp?: number }) | null;
    if (!payload || typeof payload !== 'object') return next(Errors.invalidToken());
    if (payload.exp && payload.exp < Date.now() / 1000) return next(Errors.tokenExpired());
    req.auth = {
      userId: payload.sub,
      role: payload.role,
      teamId: payload.teamId ?? null,
      sid: payload.sid,
    };
    next();
  };
}
