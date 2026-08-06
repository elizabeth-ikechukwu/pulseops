// src/routes/auth.routes.js

'use strict';

const { Router } = require('express');
const controller = require('../controllers/auth.controller');
const { authLimiter } = require('../middleware/rateLimiter');

const router = Router();

router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/refresh', authLimiter, controller.refresh);
router.post('/logout', controller.logout);

module.exports = router;
