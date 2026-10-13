import pg from 'pg';
import { migrate, dbUrl } from './migrate.js';
import { seed } from './seed.js';

const client = new pg.Client({ connectionString: dbUrl() });
await client.connect();
await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
console.log('applied:', (await migrate(client)).join(', '));
await seed(client);
console.log('database reset and seeded');
await client.end();
