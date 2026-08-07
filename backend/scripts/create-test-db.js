// scripts/create-test-db.js
// Connects to Postgres's default 'postgres' maintenance database and
// creates pulseops_test if it isn't there yet. Safe to run repeatedly.

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.test') });
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: 'postgres',
  });
  await client.connect();

  const dbName = process.env.PGDATABASE;
  const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);

  if (rows.length === 0) {
    await client.query(`CREATE DATABASE ${dbName}`);
    console.log(`Created database ${dbName}`);
  } else {
    console.log(`Database ${dbName} already exists`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('create-test-db failed:', err.message);
  process.exit(1);
});
