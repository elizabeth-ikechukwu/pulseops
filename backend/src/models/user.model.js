// src/models/user.model.js
// All SQL touching users/orgs. Every query is parameterized and every
// user lookup that serves a tenant request is org-scoped.

'use strict';

const db = require('../config/db');

const PUBLIC_COLUMNS =
  'id, org_id, email, full_name, role, is_active, last_login_at, created_at';

async function findByEmailForLogin(orgSlug, email) {
  const { rows } = await db.query(
    `SELECT u.id, u.org_id, u.email, u.password_hash, u.full_name,
            u.role, u.is_active, o.slug AS org_slug
       FROM users u
       JOIN orgs o ON o.id = u.org_id
      WHERE o.slug = $1 AND u.email = $2`,
    [orgSlug, email]
  );
  return rows[0] ?? null;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Creates a new org and its first user (admin) atomically.
 * If either insert fails, neither exists.
 */
async function createOrgWithAdmin({ orgName, orgSlug, email, passwordHash, fullName }) {
  return db.withTransaction(async (client) => {
    const orgResult = await client.query(
      `INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
      [orgName, orgSlug]
    );
    const org = orgResult.rows[0];

    await client.query(
      `INSERT INTO org_counters (org_id) VALUES ($1)`,
      [org.id]
    );

    const userResult = await client.query(
      `INSERT INTO users (org_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'admin')
       RETURNING ${PUBLIC_COLUMNS}`,
      [org.id, email, passwordHash, fullName]
    );

    return { org, user: userResult.rows[0] };
  });
}

/** Admin invites/creates a user inside their own org. */
async function createUser({ orgId, email, passwordHash, fullName, role }) {
  const { rows } = await db.query(
    `INSERT INTO users (org_id, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [orgId, email, passwordHash, fullName, role]
  );
  return rows[0];
}

async function touchLastLogin(id) {
  await db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [id]);
}

module.exports = {
  findByEmailForLogin,
  findById,
  createOrgWithAdmin,
  createUser,
  touchLastLogin,
  listByOrg,
};

/** All active members of an org, for assignment pickers. */
async function listByOrg(orgId) {
  const { rows } = await db.query(
    `SELECT id, full_name, email, role
       FROM users
      WHERE org_id = $1 AND is_active
      ORDER BY full_name`,
    [orgId]
  );
  return rows;
}
