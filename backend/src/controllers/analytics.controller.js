// src/controllers/analytics.controller.js
// Thin layer over analytics.model: validates window/bucket/severity,
// assembles the dashboard payload.

'use strict';

const analyticsModel = require('../models/analytics.model');
const { BadRequestError } = require('../utils/errors');

const SEVERITIES = ['P1', 'P2', 'P3'];

function parseWindow(req) {
  const days = Number.parseInt(req.query.days ?? '30', 10);
  if (Number.isNaN(days) || days < 1 || days > 365) {
    throw new BadRequestError('days must be an integer between 1 and 365');
  }
  return days;
}

/** GET /api/analytics/mttr?days=30&bucket=day&severity=P1 */
async function mttr(req, res, next) {
  try {
    const days = parseWindow(req);

    const bucket = req.query.bucket ?? 'day';
    if (!analyticsModel.BUCKETS[bucket]) {
      throw new BadRequestError(
        `bucket must be one of: ${Object.keys(analyticsModel.BUCKETS).join(', ')}`
      );
    }

    const severity = req.query.severity;
    if (severity !== undefined && !SEVERITIES.includes(severity)) {
      throw new BadRequestError(`severity must be one of: ${SEVERITIES.join(', ')}`);
    }

    const trend = await analyticsModel.mttrTrend(req.user.orgId, { days, bucket, severity });
    return res.json({ window_days: days, bucket, severity: severity ?? 'all', trend });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/analytics/summary?days=30 : headline cards + severity split */
async function summary(req, res, next) {
  try {
    const days = parseWindow(req);
    const [headline, severities] = await Promise.all([
      analyticsModel.summary(req.user.orgId, { days }),
      analyticsModel.bySeverity(req.user.orgId, { days }),
    ]);
    return res.json({ window_days: days, ...headline, by_severity: severities });
  } catch (err) {
    return next(err);
  }
}

module.exports = { mttr, summary };
