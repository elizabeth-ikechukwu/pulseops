// src/config/redis.js
// Single shared Redis client for refresh-token storage and rate limiting.

'use strict';

const { createClient } = require('redis');
const env = require('./env');

const redis = createClient({
  url: env.redis.url,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

redis.on('error', (err) => {
  console.error('[redis] client error', err.message);
});

async function connectRedis() {
  if (!redis.isOpen) await redis.connect();
}

async function closeRedis() {
  if (redis.isOpen) await redis.quit();
}

module.exports = { redis, connectRedis, closeRedis };
