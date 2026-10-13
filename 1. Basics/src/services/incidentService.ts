import { Errors } from '../errors/AppError.js';
import type { AppContext, AuthContext } from '../types.js';

export interface ListFilters {
  status?: string;
  limit: number;
}

export function createIncidentService(ctx: AppContext) {
  const { pool } = ctx;

  async function list(auth: AuthContext, filters: ListFilters) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (auth.role !== 'admin' && auth.teamId) {
      params.push(auth.teamId);
      where.push(`team_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      where.push(`status = $${params.length}`);
    }
    params.push(filters.limit);

    const sql = `
      SELECT id, team_id AS "teamId", title, severity, status, created_at AS "createdAt"
      FROM incidents
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC
      LIMIT $${params.length}`;
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  async function getById(id: string) {
    const { rows } = await pool.query(
      `SELECT id, team_id AS "teamId", title, description, severity, status,
              created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM incidents WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw Errors.notFound('Incident');
    return rows[0];
  }

  async function create(
    auth: AuthContext,
    input: { title: string; description?: string; severity: string; teamId?: string },
  ) {
    const teamId = auth.role === 'admin' ? input.teamId : auth.teamId;
    const { rows } = await pool.query(
      `INSERT INTO incidents (team_id, title, description, severity, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, team_id AS "teamId", title, severity, status, created_at AS "createdAt"`,
      [teamId, input.title, input.description ?? '', input.severity, auth.userId],
    );
    return rows[0];
  }

  async function setStatus(id: string, status: string) {
    const { rows } = await pool.query(
      `UPDATE incidents SET status = $2, updated_at = now() WHERE id = $1
       RETURNING id, team_id AS "teamId", title, severity, status, updated_at AS "updatedAt"`,
      [id, status],
    );
    if (!rows[0]) throw Errors.notFound('Incident');
    return rows[0];
  }

  async function listNotes(incidentId: string) {
    await getById(incidentId);
    const { rows } = await pool.query(
      `SELECT n.id, n.body, n.created_at AS "createdAt", u.name AS author
       FROM incident_notes n JOIN users u ON u.id = n.author_id
       WHERE n.incident_id = $1 ORDER BY n.created_at ASC`,
      [incidentId],
    );
    return rows;
  }

  async function addNote(incidentId: string, authorId: string, body: string) {
    const { rows } = await pool.query(
      `INSERT INTO incident_notes (incident_id, author_id, body) VALUES ($1, $2, $3)
       RETURNING id, body, created_at AS "createdAt"`,
      [incidentId, authorId, body],
    );
    return rows[0];
  }

  return { list, getById, create, setStatus, listNotes, addNote };
}

export type IncidentService = ReturnType<typeof createIncidentService>;
