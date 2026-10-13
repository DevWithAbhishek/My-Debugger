import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import type { AppConfig } from '../config/index.js';
import type { Role } from '../types.js';

export interface AccessClaims {
  sub: string;
  role: Role;
  teamId: string | null;
  sid: string;
  tv: number;
}

export function signAccessToken(config: AppConfig, claims: AccessClaims): string {
  return jwt.sign(claims, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.accessTtlSeconds,
    issuer: 'ims-api',
  });
}

export function verifyAccessToken(config: AppConfig, token: string): AccessClaims {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    issuer: 'ims-api',
    clockTolerance: config.clockToleranceSeconds,
  }) as unknown as AccessClaims;
}

export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
