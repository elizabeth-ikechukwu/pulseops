// src/controllers/incident.controller.js
// Validate shape, delegate to service. Org scope always comes from
// req.user (the verified JWT), never from the request body.

'use strict';

const incidentService = require('../services/incident.service');
const { BadRequestError } = require('../utils/errors');

const SEVERITIES = ['P1', 'P2', 'P3'];
const STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved', 'closed'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value, name) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new BadRequestError(`'${name}' must be a valid UUID`);
  }
  return value;
}

async function create(req, res, next) {
  try {
    const { title, description = '', severity, assignedTo } = req.body ?? {};

    if (typeof title !== 'string' || title.trim().length < 3 || title.length > 200) {
      throw new BadRequestError('title must be a string of 3-200 characters');
    }
    if (!SEVERITIES.includes(severity)) {
      throw new BadRequestError(`severity must be one of: ${SEVERITIES.join(', ')}`);
    }
    if (typeof description !== 'string' || description.length > 10000) {
      throw new BadRequestError('description must be a string of at most 10000 characters');
    }
    if (assignedTo !== undefined) requireUuid(assignedTo, 'assignedTo');

    const incident = await incidentService.create(req.user.orgId, req.user.id, {
      title: title.trim(),
      description,
      severity,
      assignedTo,
    });
    return res.status(201).json(incident);
  } catch (err) {
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status, severity, assignedTo } = req.query;

    if (status !== undefined && !STATUSES.includes(status)) {
      throw new BadRequestError(`status filter must be one of: ${STATUSES.join(', ')}`);
    }
    if (severity !== undefined && !SEVERITIES.includes(severity)) {
      throw new BadRequestError(`severity filter must be one of: ${SEVERITIES.join(', ')}`);
    }
    if (assignedTo !== undefined) requireUuid(assignedTo, 'assignedTo');

    const limit = Math.min(Number.parseInt(req.query.limit ?? '25', 10) || 25, 100);
    const page = Math.max(Number.parseInt(req.query.page ?? '1', 10) || 1, 1);
    const offset = (page - 1) * limit;

    const { incidents, total } = await incidentService.list(req.user.orgId, {
      status,
      severity,
      assignedTo,
      limit,
      offset,
    });

    return res.json({
      incidents,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return next(err);
  }
}

async function getById(req, res, next) {
  try {
    requireUuid(req.params.id, 'id');
    const incident = await incidentService.getById(req.user.orgId, req.params.id);
    return res.json(incident);
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    requireUuid(req.params.id, 'id');
    const { title, description, severity, assignedTo } = req.body ?? {};
    const fields = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 3 || title.length > 200) {
        throw new BadRequestError('title must be a string of 3-200 characters');
      }
      fields.title = title.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > 10000) {
        throw new BadRequestError('description must be a string of at most 10000 characters');
      }
      fields.description = description;
    }
    if (severity !== undefined) {
      if (!SEVERITIES.includes(severity)) {
        throw new BadRequestError(`severity must be one of: ${SEVERITIES.join(', ')}`);
      }
      fields.severity = severity;
    }
    if (assignedTo !== undefined) {
      fields.assigned_to = assignedTo === null ? null : requireUuid(assignedTo, 'assignedTo');
    }

    const incident = await incidentService.update(req.user.orgId, req.params.id, fields);
    return res.json(incident);
  } catch (err) {
    return next(err);
  }
}

async function transition(req, res, next) {
  try {
    requireUuid(req.params.id, 'id');
    const { status, note } = req.body ?? {};

    if (!STATUSES.includes(status)) {
      throw new BadRequestError(`status must be one of: ${STATUSES.join(', ')}`);
    }
    if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) {
      throw new BadRequestError('note must be a string of at most 2000 characters');
    }

    const incident = await incidentService.transition(
      req.user.orgId,
      req.params.id,
      req.user.id,
      { toStatus: status, note }
    );
    return res.json(incident);
  } catch (err) {
    return next(err);
  }
}

async function getHistory(req, res, next) {
  try {
    requireUuid(req.params.id, 'id');
    const history = await incidentService.getHistory(req.user.orgId, req.params.id);
    return res.json({ history });
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    requireUuid(req.params.id, 'id');
    await incidentService.remove(req.user.orgId, req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, list, getById, update, transition, getHistory, remove };
