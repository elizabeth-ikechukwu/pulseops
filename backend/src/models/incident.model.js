// src/models/incident.model.js
// All SQL touching incidents. Every single query takes org_id as its
// first parameter: there is no code path that reads an incident
// without tenant scope.

'use strict';

const db = require('../config/db');

const INCIDENT_COLUMNS = `
  i.id, i.org_id, i.incident_number, i.title, i.description,
  i.severity, i.status, i.created_by, i.assigned_to,
  i.acknowledged_at, i.resolved_at, i.closed_at,
  i.created_at, i.updated_at
`;

/**
 * Create an incident with a per-org sequential number.
 * FOR UPDATE locks the counter row, so two simultaneous creates in the
 * same org serialize instead of both getting INC-42.
 */
async function create({ orgId, title, description, severity, createdBy, assignedTo }) {
  return db.withTransaction(async (client) => {
    const counter = await client.query(
      `UPDATE org_counters
          SET incident_seq = incident_seq + 1
        WHERE org_id = $1
        RETURNING incident_seq`,
      [orgId]
    );
    if (counter.rowCount === 0) {
      throw new Error(`org_counters row missing for org ${orgId}`);
    }
    const number = counter.rows[0].incident_seq;

    const inserted = await client.query(
      `INSERT INTO incidents
         (org_id, incident_number, title, description, severity, created_by, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [orgId, number, title, description, severity, createdBy, assignedTo ?? null]
    );
    const incident = inserted.rows[0];

    await client.query(
      `INSERT INTO incident_status_history
         (incident_id, org_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2, NULL, 'open', $3, 'Incident created')`,
      [incident.id, orgId, createdBy]
    );

    return incident;
  });
}

async function findById(orgId, id) {
  const { rows } = await db.query(
    `SELECT ${INCIDENT_COLUMNS},
            cu.full_name AS created_by_name,
            au.full_name AS assigned_to_name
       FROM incidents i
       JOIN users cu ON cu.id = i.created_by
       LEFT JOIN users au ON au.id = i.assigned_to
      WHERE i.org_id = $1 AND i.id = $2`,
    [orgId, id]
  );
  return rows[0] ?? null;
}

/**
 * Filtered, paginated list. Filters are whitelisted here: values come
 * in as parameters, column names never come from the client.
 */
async function list(orgId, { status, severity, assignedTo, limit, offset }) {
  const conditions = ['i.org_id = $1'];
  const params = [orgId];

  if (status) {
    params.push(status);
    conditions.push(`i.status = $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    conditions.push(`i.severity = $${params.length}`);
  }
  if (assignedTo) {
    params.push(assignedTo);
    conditions.push(`i.assigned_to = $${params.length}`);
  }

  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT ${INCIDENT_COLUMNS},
            au.full_name AS assigned_to_name,
            COUNT(*) OVER() AS total_count
       FROM incidents i
       LEFT JOIN users au ON au.id = i.assigned_to
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return { incidents: rows.map(({ total_count, ...r }) => r), total };
}

/** Update title/description/severity/assignment. Fields are whitelisted. */
async function update(orgId, id, fields) {
  const allowed = ['title', 'description', 'severity', 'assigned_to'];
  const sets = [];
  const params = [orgId, id];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) return findById(orgId, id);

  const { rows } = await db.query(
    `UPDATE incidents i
        SET ${sets.join(', ')}
      WHERE i.org_id = $1 AND i.id = $2
      RETURNING *`,
    params
  );
  return rows[0] ?? null;
}

/**
 * Status transition + timestamp stamping + history row, atomically.
 * timestampField is decided by the service layer state machine.
 */
async function transitionStatus(orgId, id, { fromStatus, toStatus, timestampField, changedBy, note }) {
  return db.withTransaction(async (client) => {
    const stamp = timestampField ? `, ${timestampField} = now()` : '';
    const updated = await client.query(
      `UPDATE incidents
          SET status = $3${stamp}
        WHERE org_id = $1 AND id = $2 AND status = $4
        RETURNING *`,
      [orgId, id, toStatus, fromStatus]
    );
    // rowCount 0 = someone else transitioned first (optimistic concurrency)
    if (updated.rowCount === 0) return null;

    await client.query(
      `INSERT INTO incident_status_history
         (incident_id, org_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, orgId, fromStatus, toStatus, changedBy, note ?? null]
    );

    return updated.rows[0];
  });
}

async function getHistory(orgId, incidentId) {
  const { rows } = await db.query(
    `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at,
            u.full_name AS changed_by_name
       FROM incident_status_history h
       JOIN users u ON u.id = h.changed_by
      WHERE h.org_id = $1 AND h.incident_id = $2
      ORDER BY h.created_at ASC`,
    [orgId, incidentId]
  );
  return rows;
}

async function remove(orgId, id) {
  const { rowCount } = await db.query(
    `DELETE FROM incidents WHERE org_id = $1 AND id = $2`,
    [orgId, id]
  );
  return rowCount === 1;
}

/** Verifies an assignee belongs to the same org before assignment. */
async function userInOrg(orgId, userId) {
  const { rows } = await db.query(
    `SELECT 1 FROM users WHERE org_id = $1 AND id = $2 AND is_active`,
    [orgId, userId]
  );
  return rows.length === 1;
}

module.exports = { create, findById, list, update, transitionStatus, getHistory, remove, userInOrg };
