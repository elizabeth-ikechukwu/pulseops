// src/middleware/rbac.js
// Role checks. Use AFTER authenticate.
//
//   router.post('/', authenticate, requireRole('admin', 'engineer'), handler)
//
// Roles are flat, not hierarchical, on purpose: explicit lists in each
// route read better in review than admin>engineer>viewer inheritance.

'use strict';

const { ForbiddenError, UnauthorizedError } = require('../utils/errors');

const ROLES = Object.freeze(['admin', 'engineer', 'viewer']);

function requireRole(...allowed) {
  for (const role of allowed) {
    if (!ROLES.includes(role)) {
      // Fail at boot when a route declares a typo'd role
      throw new Error(`Unknown role in requireRole: ${role}`);
    }
  }

  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!allowed.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires role: ${allowed.join(' or ')}`));
    }
    return next();
  };
}

module.exports = { requireRole, ROLES };
