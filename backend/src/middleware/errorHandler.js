// src/middleware/errorHandler.js
// Last middleware in the chain. Operational errors return their real
// status + message. Unknown errors are logged with a stack trace and
// return an opaque 500: internals never leak to clients.

'use strict';

const env = require('../config/env');
const { AppError } = require('../utils/errors');

function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: env.isProduction ? 'Internal server error' : err.message,
    },
  });
}

module.exports = { notFound, errorHandler };
