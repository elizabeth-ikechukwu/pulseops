// src/services/incident.service.js
// Business rules for incidents:
//  - status state machine (no open -> resolved jumps, no editing closed)
//  - lifecycle timestamps set server-side on transition
//  - resolution timer derived from timestamps, never stored as a duration
//  - cross-org assignment blocked

'use strict';

const incidentModel = require('../models/incident.model');
const { BadRequestError, NotFoundError, ConflictError } = require('../utils/errors');

// Allowed transitions. Anything not listed is rejected.
// reopen: resolved -> in_progress clears nothing (resolved_at stays as
// history in the status table; the column is overwritten on next resolve).
const TRANSITIONS = Object.freeze({
  open:         ['acknowledged'],
  acknowledged: ['in_progress'],
  in_progress:  ['resolved'],
  resolved:     ['closed', 'in_progress'], // close out, or reopen
  closed:       [],                        // terminal
});

// Which timestamp each target status stamps.
const STAMP = Object.freeze({
  acknowledged: 'acknowledged_at',
  resolved: 'resolved_at',
  closed: 'closed_at',
});

/** Attach derived timer fields; durations are computed, not stored. */
function withTimers(incident) {
  if (!incident) return incident;
  const created = new Date(incident.created_at);
  const acknowledged = incident.acknowledged_at ? new Date(incident.acknowledged_at) : null;
  const resolved = incident.resolved_at ? new Date(incident.resolved_at) : null;
  const now = new Date();

  return {
    ...incident,
    timers: {
      // MTTA input: creation -> acknowledgement
      time_to_acknowledge_seconds: acknowledged
        ? Math.round((acknowledged - created) / 1000)
        : null,
      // MTTR input: creation -> resolution
      time_to_resolve_seconds: resolved
        ? Math.round((resolved - created) / 1000)
        : null,
      // Live timer for open incidents, what the UI counts up
      elapsed_seconds: resolved ? null : Math.round((now - created) / 1000),
    },
  };
}

async function create(orgId, userId, { title, description, severity, assignedTo }) {
  if (assignedTo) {
    const ok = await incidentModel.userInOrg(orgId, assignedTo);
    if (!ok) throw new BadRequestError('Assignee not found in your organization');
  }
  const incident = await incidentModel.create({
    orgId,
    title,
    description,
    severity,
    createdBy: userId,
    assignedTo,
  });
  return withTimers(incident);
}

async function getById(orgId, id) {
  const incident = await incidentModel.findById(orgId, id);
  if (!incident) throw new NotFoundError('Incident not found');
  return withTimers(incident);
}

async function list(orgId, filters) {
  const { incidents, total } = await incidentModel.list(orgId, filters);
  return { incidents: incidents.map(withTimers), total };
}

async function update(orgId, id, fields) {
  const existing = await incidentModel.findById(orgId, id);
  if (!existing) throw new NotFoundError('Incident not found');
  if (existing.status === 'closed') {
    throw new ConflictError('Closed incidents are immutable; reopen is not allowed after close');
  }
  if (fields.assigned_to) {
    const ok = await incidentModel.userInOrg(orgId, fields.assigned_to);
    if (!ok) throw new BadRequestError('Assignee not found in your organization');
  }
  const updated = await incidentModel.update(orgId, id, fields);
  return withTimers(updated);
}

async function transition(orgId, id, userId, { toStatus, note }) {
  const incident = await incidentModel.findById(orgId, id);
  if (!incident) throw new NotFoundError('Incident not found');

  const allowed = TRANSITIONS[incident.status] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new BadRequestError(
      `Cannot transition from '${incident.status}' to '${toStatus}'. Allowed: ${allowed.join(', ') || 'none'}`
    );
  }

  const updated = await incidentModel.transitionStatus(orgId, id, {
    fromStatus: incident.status,
    toStatus,
    timestampField: STAMP[toStatus] ?? null,
    changedBy: userId,
    note,
  });

  // Model returned null: status changed between our read and write.
  if (!updated) {
    throw new ConflictError('Incident status changed concurrently, refresh and retry');
  }
  return withTimers(updated);
}

async function getHistory(orgId, id) {
  const incident = await incidentModel.findById(orgId, id);
  if (!incident) throw new NotFoundError('Incident not found');
  return incidentModel.getHistory(orgId, id);
}

async function remove(orgId, id) {
  const deleted = await incidentModel.remove(orgId, id);
  if (!deleted) throw new NotFoundError('Incident not found');
}

module.exports = { create, getById, list, update, transition, getHistory, remove, TRANSITIONS };
