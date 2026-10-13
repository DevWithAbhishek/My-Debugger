import type { RequestHandler } from 'express';
import { Errors } from '../errors/AppError.js';
import type { AuthContext, Role } from '../types.js';

export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(Errors.unauthenticated());
    if (!allowed.includes(req.auth.role)) return next(Errors.forbiddenRole());
    next();
  };
}

/** Throws unless the caller may touch resources owned by `resourceTeamId`. */
export function assertTeamAccess(auth: AuthContext, resourceTeamId: string): void {
  if (auth.role === 'admin') return;
  if (!auth.teamId) throw Errors.teamDenied();
  if (auth.teamId !== resourceTeamId) throw Errors.teamDenied();
}
