// src/app.js
// App assembly only: no .listen() here so tests can import the app.

'use strict';

const express = require('express');
const helmet = require('helmet');
const authRoutes = require('./routes/auth.routes');
const incidentRoutes = require('./routes/incident.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const userRoutes = require('./routes/user.routes');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const db = require('./config/db');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // running behind Nginx; req.ip = client IP

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

// Health endpoints: liveness is cheap, readiness checks dependencies.
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', async (_req, res) => {
  try {
    await db.ping();
    return res.json({ status: 'ready' });
  } catch {
    return res.status(503).json({ status: 'unavailable' });
  }
});

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', userRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
