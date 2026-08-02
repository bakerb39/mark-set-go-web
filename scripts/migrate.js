'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, databaseConfigured } = require('../db');

async function run() {
  if (!databaseConfigured()) throw new Error('DATABASE_URL is required to run migrations.');
  const migrationDir = path.join(__dirname, '..', 'db', 'migrations');
  const files = (await fs.readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
  await pool.query('create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())');
  for (const file of files) {
    const already = await pool.query('select 1 from schema_migrations where version = $1', [file]);
    if (already.rowCount) { console.log(`skip ${file}`); continue; }
    const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations(version) values($1)', [file]);
      await client.query('commit');
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }
}

run().then(async () => { await pool.end(); }).catch(async (error) => {
  console.error(error.message);
  if (pool) await pool.end().catch(() => {});
  process.exitCode = 1;
});
