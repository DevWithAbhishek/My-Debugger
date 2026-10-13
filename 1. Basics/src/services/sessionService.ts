import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AppError } from '../errors/AppError.js';
import { hashRefreshToken, newRefreshToken, signAccessToken } from '../auth/tokens.js';
import type { AppContext, Role } from '../types.js';

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  team_id: string | null;
  status: 'active' | 'disabled';
  token_version: number;
  team_active: boolean | null;
}

const USER_SQL = `
  SELECT u.*, t.active AS team_active
  FROM users u LEFT JOIN teams t ON t.id = u.team_id`;

export function createSessionService(ctx: AppContext) {
  const { pool, redis, config, logger } = ctx;

  async function issueTokens(user: UserRow, familyId: string) {
    const refresh = newRefreshToken();
    const expires = new Date(Date.now() + config.refreshTtlDays * 86_400_000);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [user.id, familyId, refresh.hash, expires],
    );
    const accessToken = signAccessToken(config, {
      sub: user.id,
      role: user.role,
      teamId: user.team_id,
      sid: familyId,
      tv: user.token_version,
    });
    return {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: config.accessTtlSeconds,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, teamId: user.team_id },
    };
  }

  async function login(email: string, password: string) {
    const { rows } = await pool.query<UserRow>(`${USER_SQL} WHERE lower(u.email) = lower($1)`, [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    if (user.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled');
    }
    if (user.team_id && user.team_active === false) {
      throw new AppError(403, 'TEAM_INACTIVE', 'This team has been deactivated');
    }
    return issueTokens(user, randomUUID());
  }

  async function revokeFamily(familyId: string) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId],
    );
    // Access tokens are bound to the family via the `sid` claim; keep them out for their remaining life.
    try {
      await redis.set(`revoked:sid:${familyId}`, '1', 'EX', config.accessTtlSeconds + 60);
    } catch (err) {
      logger.warn({ err: (err as Error).message, familyId }, 'could not record session revocation in redis');
    }
  }

  async function refresh(presented: string) {
    const { rows } = await pool.query(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
      [hashRefreshToken(presented)],
    );
    const row = rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at) < new Date()) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid');
    }
    if (row.used_at) {
      // A rotated token was presented again: treat the whole session as compromised.
      await revokeFamily(row.id);
      throw new AppError(401, 'REFRESH_TOKEN_REUSED', 'Refresh token has already been used');
    }

    await pool.query(`UPDATE refresh_tokens SET used_at = now() WHERE id = $1`, [row.id]);

    const { rows: users } = await pool.query<UserRow>(`${USER_SQL} WHERE u.id = $1`, [row.user_id]);
    const user = users[0];
    if (!user) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid');
    return issueTokens(user, row.family_id);
  }

  async function logout(sid: string) {
    await revokeFamily(sid);
  }

  return { login, refresh, logout, revokeFamily };
}

export type SessionService = ReturnType<typeof createSessionService>;
