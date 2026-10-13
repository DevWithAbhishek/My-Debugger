import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { AppError, Errors } from '../errors/AppError.js';
import { verifyAccessToken } from '../auth/tokens.js';
import type { AppContext } from '../types.js';

export function authenticate(ctx: AppContext): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const header = req.headers.authorization as string;
    const token = header.split(' ')[1];

    let claims;
    try {
      claims = verifyAccessToken(ctx.config, token);
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError) throw Errors.invalidToken();
      if (err instanceof jwt.TokenExpiredError) throw Errors.tokenExpired();
      throw err;
    }

    try {
      const revoked = await ctx.redis.get(`revoked:sid:${claims.sid}`);
      if (revoked) throw new AppError(401, 'SESSION_REVOKED', 'Session has been revoked');
    } catch (err) {
      if (err instanceof AppError) throw err;
      ctx.logger.debug({ err: (err as Error).message }, 'revocation check skipped');
    }

    req.auth = {
      userId: claims.sub,
      role: claims.role,
      teamId: claims.teamId ?? null,
      sid: claims.sid,
    };
    next();
  });
}
