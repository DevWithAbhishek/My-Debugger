import pg from 'pg';
import { DEMO_PASSWORD_HASH, INCIDENTS, NOTES, TEAMS, USERS } from './fixtures.js';
import { dbUrl } from './migrate.js';

/** Wipes application tables and inserts the fictional fixture data. */
export async function seed(client: pg.ClientBase): Promise<void> {
  await client.query('TRUNCATE incident_notes, refresh_tokens, incidents, users, teams RESTART IDENTITY CASCADE');
  for (const t of Object.values(TEAMS)) {
    await client.query('INSERT INTO teams (id, name) VALUES ($1, $2)', [t.id, t.name]);
  }
  for (const u of Object.values(USERS)) {
    await client.query(
      'INSERT INTO users (id, email, name, password_hash, role, team_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [u.id, u.email, u.name, DEMO_PASSWORD_HASH, u.role, u.teamId],
    );
  }
  for (const i of Object.values(INCIDENTS)) {
    await client.query(
      'INSERT INTO incidents (id, team_id, title, severity, status, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [i.id, i.teamId, i.title, i.severity, i.status, i.by],
    );
  }
  for (const n of NOTES) {
    await client.query('INSERT INTO incident_notes (incident_id, author_id, body) VALUES ($1, $2, $3)', [n.incidentId, n.authorId, n.body]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new pg.Client({ connectionString: dbUrl() });
  await client.connect();
  await seed(client);
  console.log('seeded fictional teams, users, incidents');
  await client.end();
}
