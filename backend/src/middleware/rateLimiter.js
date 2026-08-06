// src/middleware/rateLimiter.js
// Fixed-window rate limiter on Redis. Redis-backed (not in-memory)
// so limits hold across multiple backend replicas.
//
// Two profiles:
//  - apiLimiter: general API traffic, keyed by user id (or IP pre-auth)
//  - authLimiter: strict, keyed by IP, for login/register brute force

'use strict';

const { redis } = require('../config/redis');

function makeLimiter({ prefix, windowSeconds, max }) {
  return async function limiter(req, res, next) {
    try {
      const identity = req.user?.id ?? req.ip;
      const key = `ratelimit:${prefix}:${identity}`;

      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - count)));

      if (count > max) {
        const ttl = await redis.ttl(key);
        res.set('Retry-After', String(Math.max(1, ttl)));
        return res.status(429).json({
          error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' },
        });
      }
      return next();
    } catch (err) {
      // Fail open: a Redis outage should degrade rate limiting,
      // not take down the whole API.
      console.error('[ratelimit] error, failing open', err.message);
      return next();
    }
  };
}

const apiLimiter = makeLimiter({ prefix: 'api', windowSeconds: 60, max: 120 });
const authLimiter = makeLimiter({ prefix: 'auth', windowSeconds: 900, max: 10 });

module.exports = { apiLimiter, authLimiter };
