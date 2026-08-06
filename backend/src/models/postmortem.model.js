// src/models/postmortem.model.js

'use strict';

const db = require('../config/db');

async function create({ orgId, incidentId, contentMd, createdBy }) {
  const { rows } = await db.query(
    `INSERT INTO postmortems (org_id, incident_id, content_md, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [orgId, incidentId, contentMd, createdBy]
  );
  return rows[0];
}

async function findByIncident(orgId, incidentId) {
  const { rows } = await db.query(
    `SELECT p.*, u.full_name AS created_by_name
       FROM postmortems p
       JOIN users u ON u.id = p.created_by
      WHERE p.org_id = $1 AND p.incident_id = $2`,
    [orgId, incidentId]
  );
  return rows[0] ?? null;
}

async function updateContent(orgId, incidentId, contentMd) {
  const { rows } = await db.query(
    `UPDATE postmortems
        SET content_md = $3
      WHERE org_id = $1 AND incident_id = $2 AND status = 'draft'
      RETURNING *`,
    [orgId, incidentId, contentMd]
  );
  return rows[0] ?? null;
}

async function publish(orgId, incidentId) {
  const { rows } = await db.query(
    `UPDATE postmortems
        SET status = 'published', published_at = now()
      WHERE org_id = $1 AND incident_id = $2 AND status = 'draft'
      RETURNING *`,
    [orgId, incidentId]
  );
  return rows[0] ?? null;
}

module.exports = { create, findByIncident, updateContent, publish };
