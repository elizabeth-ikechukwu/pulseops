// src/models/analytics.model.js
// Aggregation queries for the MTTR dashboard. All math happens in
// Postgres: shipping rows to Node to average them is wasted IO.

'use strict';

const db = require('../config/db');

const BUCKETS = Object.freeze({ day: 'day', week: 'week', month: 'month' });

/**
 * MTTR/MTTA trend over time.
 * Buckets by resolved_at (an incident counts in the period it was
 * resolved, which is the standard way MTTR trends are reported).
 */
async function mttrTrend(orgId, { days, bucket, severity }) {
  const params = [orgId, String(days)];
  let severityFilter = '';
  if (severity) {
    params.push(severity);
    severityFilter = `AND severity = $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT
        date_trunc('${BUCKETS[bucket]}', resolved_at) AS period,
        COUNT(*)::int AS resolved_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))))::int  AS mttr_seconds,
        ROUND(AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))))::int AS mtta_seconds,
        ROUND(percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at))))::int AS median_ttr_seconds,
        ROUND(MAX(EXTRACT(EPOCH FROM (resolved_at - created_at))))::int AS worst_ttr_seconds
       FROM incidents
      WHERE org_id = $1
        AND resolved_at IS NOT NULL
        AND resolved_at >= now() - ($2 || ' days')::interval
        ${severityFilter}
      GROUP BY period
      ORDER BY period ASC`,
    params
  );
  return rows;
}

/** Headline numbers for the dashboard top row. */
async function summary(orgId, { days }) {
  const { rows } = await db.query(
    `SELECT
        COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS open_count,
        COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'P1')::int AS open_p1_count,
        COUNT(*) FILTER (
          WHERE resolved_at >= now() - ($2 || ' days')::interval)::int AS resolved_in_window,
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (
          WHERE resolved_at >= now() - ($2 || ' days')::interval))::int AS mttr_seconds,
        ROUND(AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))) FILTER (
          WHERE acknowledged_at >= now() - ($2 || ' days')::interval))::int AS mtta_seconds
       FROM incidents
      WHERE org_id = $1`,
    [orgId, String(days)]
  );
  return rows[0];
}

/** MTTR broken down by severity, for the P1/P2/P3 comparison widget. */
async function bySeverity(orgId, { days }) {
  const { rows } = await db.query(
    `SELECT
        severity,
        COUNT(*)::int AS resolved_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))))::int AS mttr_seconds
       FROM incidents
      WHERE org_id = $1
        AND resolved_at IS NOT NULL
        AND resolved_at >= now() - ($2 || ' days')::interval
      GROUP BY severity
      ORDER BY severity`,
    [orgId, String(days)]
  );
  return rows;
}

module.exports = { mttrTrend, summary, bySeverity, BUCKETS };
