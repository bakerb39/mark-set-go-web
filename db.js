'use strict';

const { Pool } = require('pg');

const connectionString = String(process.env.DATABASE_URL || '').trim();
const isProduction = process.env.NODE_ENV === 'production';

const pool = connectionString
  ? new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX) || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.DATABASE_SSL === 'false'
        ? false
        : (isProduction ? { rejectUnauthorized: false } : undefined)
    })
  : null;

function databaseConfigured() {
  return Boolean(pool);
}

async function query(text, params = []) {
  if (!pool) throw new Error('DATABASE_URL is not configured.');
  return pool.query(text, params);
}

async function checkDatabase() {
  if (!pool) return { configured: false, connected: false };
  const started = Date.now();
  const result = await pool.query('select current_database() as database, now() as server_time');
  return {
    configured: true,
    connected: true,
    database: result.rows[0]?.database || '',
    serverTime: result.rows[0]?.server_time || null,
    latencyMs: Date.now() - started
  };
}

async function closeDatabase() {
  if (pool) await pool.end();
}

module.exports = { pool, query, databaseConfigured, checkDatabase, closeDatabase };
