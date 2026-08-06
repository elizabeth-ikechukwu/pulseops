// server.js
// Entry point: connect dependencies, start listening, shut down
// gracefully on SIGTERM/SIGINT (Docker sends SIGTERM on stop).

'use strict';

const app = require('./src/app');
const env = require('./src/config/env');
const db = require('./src/config/db');
const { connectRedis, closeRedis } = require('./src/config/redis');

async function main() {
  await connectRedis();
  await db.ping(); // fail fast if Postgres is unreachable

  const server = app.listen(env.port, () => {
    console.log(`[server] pulseops-backend listening on :${env.port} (${env.nodeEnv})`);
  });

  async function shutdown(signal) {
    console.log(`[server] ${signal} received, draining connections...`);
    server.close(async () => {
      try {
        await db.close();
        await closeRedis();
        console.log('[server] clean shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('[server] error during shutdown', err);
        process.exit(1);
      }
    });
    // Hard exit if draining takes too long
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
