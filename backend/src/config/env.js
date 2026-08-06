// src/config/env.js
// Single source of truth for configuration. Fail fast at boot:
// a missing secret should crash the process immediately, not 500
// on the first request at 2am.

'use strict';

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function toInt(name, value) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${value}`);
  }
  return n;
}

const NODE_ENV = optional('NODE_ENV', 'development');
const isProduction = NODE_ENV === 'production';

const env = Object.freeze({
  nodeEnv: NODE_ENV,
  isProduction,

  port: toInt('PORT', optional('PORT', '4000')),

  db: Object.freeze({
    host: required('PGHOST'),
    port: toInt('PGPORT', optional('PGPORT', '5432')),
    database: required('PGDATABASE'),
    user: required('PGUSER'),
    password: required('PGPASSWORD'),
    // pool sizing: keep modest; Postgres connections are not free
    poolMax: toInt('PG_POOL_MAX', optional('PG_POOL_MAX', '10')),
    idleTimeoutMs: toInt('PG_IDLE_TIMEOUT_MS', optional('PG_IDLE_TIMEOUT_MS', '30000')),
    connectionTimeoutMs: toInt('PG_CONN_TIMEOUT_MS', optional('PG_CONN_TIMEOUT_MS', '5000')),
    ssl: optional('PGSSLMODE', 'disable') !== 'disable',
  }),

  redis: Object.freeze({
    url: required('REDIS_URL'),
  }),

  jwt: Object.freeze({
    // no fallback secrets, ever. A default secret in code is a breach
    // waiting to be committed.
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: optional('JWT_ACCESS_TTL', '15m'),
    refreshTtl: optional('JWT_REFRESH_TTL', '7d'),
  }),

  bcryptRounds: toInt('BCRYPT_ROUNDS', optional('BCRYPT_ROUNDS', '12')),
});

// sanity checks that catch real deployment mistakes
if (isProduction && env.jwt.accessSecret.length < 32) {
  throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
}
if (isProduction && env.jwt.refreshSecret.length < 32) {
  throw new Error('JWT_REFRESH_SECRET must be at least 32 characters in production');
}
if (env.jwt.accessSecret === env.jwt.refreshSecret) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
}

module.exports = env;
