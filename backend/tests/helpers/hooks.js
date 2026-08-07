// tests/helpers/hooks.js
// Every test file calls setupTestLifecycle() once at the top. It:
//  - connects Redis before any test runs
//  - wipes all table data after EACH test, so tests never leak into
//    each other (test A creating an org can't affect test B)
//  - closes the database pool and Redis connection after all tests,
//    so Jest actually exits instead of hanging

'use strict';

const db = require('../../src/config/db');
const { connectRedis, closeRedis, redis } = require('../../src/config/redis');

async function resetDb() {
  await db.query(`
    TRUNCATE TABLE
      incident_status_history,
      postmortems,
      incidents,
      org_counters,
      users,
      orgs
    RESTART IDENTITY CASCADE
  `);
}

async function resetRedis() {
  // FLUSHDB only clears the selected db (index 1, per .env.test),
  // never touches the real dev Redis on index 0.
  await redis.flushDb();
}

function setupTestLifecycle() {
  beforeAll(async () => {
    await connectRedis();
  });

  afterEach(async () => {
    await resetDb();
    await resetRedis();
  });

  afterAll(async () => {
    await db.close();
    await closeRedis();
  });
}

module.exports = { setupTestLifecycle };
