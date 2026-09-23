import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadRepositoryEnv } from './env.js';

loadRepositoryEnv();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for migration');
const pool = new Pool({connectionString});
try {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('CREATE TABLE IF NOT EXISTS atlas_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const version of ['0001_initial', '0002_run_lines']) {
      const exists = await connection.query('SELECT 1 FROM atlas_schema_migrations WHERE version = $1', [version]);
      if (exists.rowCount === 0) {
        const sql = await readFile(fileURLToPath(new URL(`../migrations/${version}.sql`, import.meta.url)), 'utf8');
        await connection.query(sql);
        await connection.query('INSERT INTO atlas_schema_migrations(version) VALUES ($1)', [version]);
      }
    }
    await connection.query('COMMIT');
    process.stdout.write('Migrations 0001_initial and 0002_run_lines applied or already present\n');
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
} finally { await pool.end(); }
