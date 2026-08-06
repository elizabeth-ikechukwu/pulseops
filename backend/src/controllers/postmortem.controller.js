// src/controllers/postmortem.controller.js

'use strict';

const postmortemService = require('../services/postmortem.service');
const { BadRequestError } = require('../utils/errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function incidentId(req) {
  const id = req.params.id;
  if (!UUID_RE.test(id)) throw new BadRequestError("'id' must be a valid UUID");
  return id;
}

async function generate(req, res, next) {
  try {
    const pm = await postmortemService.generate(req.user.orgId, incidentId(req), req.user.id);
    return res.status(201).json(pm);
  } catch (err) {
    return next(err);
  }
}

async function get(req, res, next) {
  try {
    const pm = await postmortemService.get(req.user.orgId, incidentId(req));
    return res.json(pm);
  } catch (err) {
    return next(err);
  }
}

/** GET .../postmortem/export : raw markdown download */
async function exportMd(req, res, next) {
  try {
    const pm = await postmortemService.get(req.user.orgId, incidentId(req));
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="postmortem-${incidentId(req)}.md"`);
    return res.send(pm.content_md);
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const { content } = req.body ?? {};
    if (typeof content !== 'string' || content.trim() === '' || content.length > 100000) {
      throw new BadRequestError('content must be a non-empty string of at most 100000 characters');
    }
    const pm = await postmortemService.updateContent(req.user.orgId, incidentId(req), content);
    return res.json(pm);
  } catch (err) {
    return next(err);
  }
}

async function publish(req, res, next) {
  try {
    const pm = await postmortemService.publish(req.user.orgId, incidentId(req));
    return res.json(pm);
  } catch (err) {
    return next(err);
  }
}

module.exports = { generate, get, exportMd, update, publish };
