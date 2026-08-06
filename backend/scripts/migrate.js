// scripts/migrate.js
// Minimal, dependency-free migration runner.
// Applies migrations/*.sql in filename order, records each in
// schema_migrations, skips ones already applied, and takes an
// advisory lock so two containers can't migrate at the same time.
//
// Run: node scripts/migrate.js

'use strict';

const fs = require('fs');
const path = require('path');
const { pool, close } = require('../src/config/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const LOCK_KEY = 727061; // arbitrary app-unique advisory lock id

async function main() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`Applying ${file} ... `);
      // Each migration file manages its own BEGIN/COMMIT so a file
      // can opt out for statements like CREATE INDEX CONCURRENTLY.
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log('done');
      ran += 1;
    }

    console.log(ran === 0 ? 'Nothing to migrate.' : `Applied ${ran} migration(s).`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
    await close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
