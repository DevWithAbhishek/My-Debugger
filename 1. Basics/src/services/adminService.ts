import { Errors } from '../errors/AppError.js';
import type { AppContext } from '../types.js';

export interface UserPatch {
  role?: 'viewer' | 'responder' | 'admin';
  teamId?: string | null;
  status?: 'active' | 'disabled';
}

export function createAdminService(ctx: AppContext) {
  const { pool } = ctx;

  async function listUsers() {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, team_id AS "teamId", status FROM users ORDER BY email`,
    );
    return rows;
  }

  async function updateUser(id: string, patch: UserPatch) {
    const sets: string[] = [];
    const params: unknown[] = [id];
    if (patch.role !== undefined) {
      params.push(patch.role);
      sets.push(`role = $${params.length}`);
    }
    if (patch.teamId !== undefined) {
      params.push(patch.teamId);
      sets.push(`team_id = $${params.length}`);
    }
    if (patch.status !== undefined) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    if (sets.length === 0) {
      const { rows } = await pool.query(
        `SELECT id, email, name, role, team_id AS "teamId", status FROM users WHERE id = $1`, [id]);
      if (!rows[0]) throw Errors.notFound('User');
      return rows[0];
    }
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, email, name, role, team_id AS "teamId", status`,
      params,
    );
    if (!rows[0]) throw Errors.notFound('User');
    return rows[0];
  }

  async function setTeamActive(id: string, active: boolean) {
    const { rows } = await pool.query(
      `UPDATE teams SET active = $2, deactivated_at = CASE WHEN $2 THEN NULL ELSE now() END
       WHERE id = $1 RETURNING id, name, active`,
      [id, active],
    );
    if (!rows[0]) throw Errors.notFound('Team');
    return rows[0];
  }

  async function summary() {
    const { rows } = await pool.query(
      `SELECT t.id AS "teamId", t.name, t.active,
              count(i.id) FILTER (WHERE i.status <> 'resolved')::int AS "openIncidents",
              count(i.id)::int AS "totalIncidents"
       FROM teams t LEFT JOIN incidents i ON i.team_id = t.id
       GROUP BY t.id ORDER BY t.name`,
    );
    return rows;
  }

  return { listUsers, updateUser, setTeamActive, summary };
}

export type AdminService = ReturnType<typeof createAdminService>;
