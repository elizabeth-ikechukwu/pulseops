// src/services/postmortem.service.js
// Generates a pre-filled, blameless postmortem template from incident
// data + status history, then manages its draft -> published lifecycle.
//
// Rules:
//  - only resolved/closed incidents get postmortems
//  - one postmortem per incident (DB-enforced)
//  - published postmortems are immutable

'use strict';

const incidentModel = require('../models/incident.model');
const postmortemModel = require('../models/postmortem.model');
const { BadRequestError, NotFoundError, ConflictError } = require('../utils/errors');

function fmtDuration(seconds) {
  if (seconds == null) return 'n/a';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtTs(ts) {
  return ts ? new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'n/a';
}

function buildTemplate(incident, history) {
  const created = new Date(incident.created_at);
  const resolved = incident.resolved_at ? new Date(incident.resolved_at) : null;
  const acknowledged = incident.acknowledged_at ? new Date(incident.acknowledged_at) : null;

  const tta = acknowledged ? Math.round((acknowledged - created) / 1000) : null;
  const ttr = resolved ? Math.round((resolved - created) / 1000) : null;

  const timeline = history
    .map((h) => `| ${fmtTs(h.created_at)} | ${h.from_status ?? '—'} → ${h.to_status} | ${h.changed_by_name} | ${h.note ?? ''} |`)
    .join('\n');

  return `# Postmortem: INC-${incident.incident_number} — ${incident.title}

> Status: DRAFT · Severity: ${incident.severity} · Blameless: focus on systems and process, not people.

## Summary
<!-- 2-3 sentences: what happened, who/what was affected, how it was resolved. -->
_(fill in)_

## Impact
- **Severity:** ${incident.severity}
- **Detected:** ${fmtTs(incident.created_at)}
- **Acknowledged:** ${fmtTs(incident.acknowledged_at)} (TTA: ${fmtDuration(tta)})
- **Resolved:** ${fmtTs(incident.resolved_at)} (TTR: ${fmtDuration(ttr)})
- **Customer impact:** _(fill in: affected users, failed requests, SLA breach?)_

## Timeline
| Time | Transition | By | Note |
|---|---|---|---|
${timeline}
<!-- Add detection, escalation, and mitigation events between the rows above. -->

## Root Cause
<!-- The 5 Whys. Keep asking why until you reach a process or system cause. -->
1. Why? _(fill in)_
2. Why? _(fill in)_
3. Why? _(fill in)_

## What Went Well
- _(fill in)_

## What Went Poorly
- _(fill in)_

## Action Items
| Action | Owner | Priority | Due | Ticket |
|---|---|---|---|---|
| _(fill in)_ | | P1/P2/P3 | | |

## Lessons Learned
_(fill in)_
`;
}

async function generate(orgId, incidentId, userId) {
  const incident = await incidentModel.findById(orgId, incidentId);
  if (!incident) throw new NotFoundError('Incident not found');

  if (!['resolved', 'closed'].includes(incident.status)) {
    throw new BadRequestError(
      `Postmortems can only be generated for resolved or closed incidents (current: ${incident.status})`
    );
  }

  const existing = await postmortemModel.findByIncident(orgId, incidentId);
  if (existing) {
    throw new ConflictError('A postmortem already exists for this incident');
  }

  const history = await incidentModel.getHistory(orgId, incidentId);
  const contentMd = buildTemplate(incident, history);

  try {
    return await postmortemModel.create({ orgId, incidentId, contentMd, createdBy: userId });
  } catch (err) {
    if (err.code === '23505') {
      // raced another generate call; unique constraint is the backstop
      throw new ConflictError('A postmortem already exists for this incident');
    }
    throw err;
  }
}

async function get(orgId, incidentId) {
  const pm = await postmortemModel.findByIncident(orgId, incidentId);
  if (!pm) throw new NotFoundError('No postmortem exists for this incident');
  return pm;
}

async function updateContent(orgId, incidentId, contentMd) {
  const pm = await postmortemModel.findByIncident(orgId, incidentId);
  if (!pm) throw new NotFoundError('No postmortem exists for this incident');
  if (pm.status === 'published') {
    throw new ConflictError('Published postmortems are immutable');
  }
  return postmortemModel.updateContent(orgId, incidentId, contentMd);
}

async function publish(orgId, incidentId) {
  const pm = await postmortemModel.findByIncident(orgId, incidentId);
  if (!pm) throw new NotFoundError('No postmortem exists for this incident');
  if (pm.status === 'published') {
    throw new ConflictError('Postmortem is already published');
  }
  return postmortemModel.publish(orgId, incidentId);
}

module.exports = { generate, get, updateContent, publish };
