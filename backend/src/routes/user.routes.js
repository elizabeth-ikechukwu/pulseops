// src/routes/user.routes.js
// Org member listing for assignment pickers. Read-only, all roles.

'use strict';

const { Router } = require('express');
const userModel = require('../models/user.model');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const users = await userModel.listByOrg(req.user.orgId);
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
