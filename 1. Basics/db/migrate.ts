import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(client: pg.ClientBase): Promise<string[]> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
  return applied;
}

export function dbUrl(): string {
  if (process.env.ENV_FILE !== 'none' && !process.env.DATABASE_URL) {
    try { process.loadEnvFile(process.env.ENV_FILE ?? '.env'); } catch { /* no .env file */ }
  }
  return process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:3002/imsDebug';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new pg.Client({ connectionString: dbUrl() });
  await client.connect();
  const applied = await migrate(client);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'database is up to date');
  await client.end();
}
