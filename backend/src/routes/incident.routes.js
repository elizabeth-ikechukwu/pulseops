// src/routes/incident.routes.js
// RBAC map:
//  - viewer:   read incidents + history
//  - engineer: everything a viewer can, plus create/update/transition
//  - admin:    everything, plus delete

'use strict';

const { Router } = require('express');
const controller = require('../controllers/incident.controller');
const postmortem = require('../controllers/postmortem.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = Router();

router.use(authenticate); // everything below requires a valid token

router.get('/', requireRole('admin', 'engineer', 'viewer'), controller.list);
router.get('/:id', requireRole('admin', 'engineer', 'viewer'), controller.getById);
router.get('/:id/history', requireRole('admin', 'engineer', 'viewer'), controller.getHistory);

router.post('/', requireRole('admin', 'engineer'), controller.create);
router.patch('/:id', requireRole('admin', 'engineer'), controller.update);
router.post('/:id/transition', requireRole('admin', 'engineer'), controller.transition);

router.delete('/:id', requireRole('admin'), controller.remove);

// Postmortems: nested because they are 1:1 with an incident.
router.post('/:id/postmortem', requireRole('admin', 'engineer'), postmortem.generate);
router.get('/:id/postmortem', requireRole('admin', 'engineer', 'viewer'), postmortem.get);
router.get('/:id/postmortem/export', requireRole('admin', 'engineer', 'viewer'), postmortem.exportMd);
router.patch('/:id/postmortem', requireRole('admin', 'engineer'), postmortem.update);
router.post('/:id/postmortem/publish', requireRole('admin'), postmortem.publish);

module.exports = router;
