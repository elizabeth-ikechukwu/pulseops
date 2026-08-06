// src/routes/analytics.routes.js
// Dashboards are read-only: every role can view them.

'use strict';

const { Router } = require('express');
const controller = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = Router();

router.use(authenticate);
router.get('/mttr', requireRole('admin', 'engineer', 'viewer'), controller.mttr);
router.get('/summary', requireRole('admin', 'engineer', 'viewer'), controller.summary);

module.exports = router;
