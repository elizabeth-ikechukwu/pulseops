// src/config/db.js
// PostgreSQL pool with:
//  - fail-fast connection errors
//  - a query() helper that logs slow queries
//  - withTransaction() so BEGIN/COMMIT/ROLLBACK logic lives in one place
//  - graceful shutdown hook for Docker (SIGTERM)

'use strict';

const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  max: env.db.poolMax,
  idleTimeoutMillis: env.db.idleTimeoutMs,
  connectionTimeoutMillis: env.db.connectionTimeoutMs,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
});

// An idle client erroring (e.g. Postgres restarted) should be logged,
// not crash the process: the pool replaces the client on next checkout.
pool.on('error', (err) => {
  console.error('[db] unexpected error on idle client', err);
});

const SLOW_QUERY_MS = 200;

/**
 * Parameterized query helper. Always use $1, $2 placeholders;
 * never interpolate values into SQL strings.
 */
async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > SLOW_QUERY_MS) {
    console.warn(`[db] slow query (${duration}ms): ${text.slice(0, 120)}`);
  }
  return result;
}

/**
 * Run a set of queries in a single transaction.
 * Usage:
 *   const incident = await withTransaction(async (client) => {
 *     const { rows } = await client.query('...', [...]);
 *     return rows[0];
 *   });
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db] rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Liveness check used by /healthz and the Docker HEALTHCHECK. */
async function ping() {
  await pool.query('SELECT 1');
}

/** Called on SIGTERM so in-flight queries finish before exit. */
async function close() {
  await pool.end();
}

module.exports = { pool, query, withTransaction, ping, close };
