// src/middleware/auth.js
// Verifies the access token and attaches req.user = { id, orgId, role }.
// Every protected route reads tenant scope from here, never from the
// request body: the client is not trusted to declare its own org.

'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { UnauthorizedError } = require('../utils/errors');

function authenticate(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('Missing bearer token'));
  }

  try {
    const payload = jwt.verify(token, env.jwt.accessSecret);
    req.user = { id: payload.sub, orgId: payload.org, role: payload.role };
    return next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token';
    return next(new UnauthorizedError(message));
  }
}

module.exports = { authenticate };
