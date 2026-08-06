// src/controllers/auth.controller.js
// Thin HTTP layer: validate input shape, call the service, format the
// response. No business logic here.

'use strict';

const authService = require('../services/auth.service');
const { BadRequestError } = require('../utils/errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function requireString(body, field, { max = 200 } = {}) {
  const value = body?.[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestError(`Field '${field}' is required`);
  }
  if (value.length > max) {
    throw new BadRequestError(`Field '${field}' exceeds ${max} characters`);
  }
  return value.trim();
}

async function register(req, res, next) {
  try {
    const orgName = requireString(req.body, 'orgName', { max: 100 });
    const orgSlug = requireString(req.body, 'orgSlug', { max: 50 });
    const email = requireString(req.body, 'email');
    const password = requireString(req.body, 'password', { max: 128 });
    const fullName = requireString(req.body, 'fullName', { max: 100 });

    if (!SLUG_RE.test(orgSlug)) {
      throw new BadRequestError('orgSlug must be lowercase letters, numbers, and hyphens');
    }
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestError('Invalid email format');
    }

    const result = await authService.register({ orgName, orgSlug, email, password, fullName });
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const orgSlug = requireString(req.body, 'orgSlug', { max: 50 });
    const email = requireString(req.body, 'email');
    const password = requireString(req.body, 'password', { max: 128 });

    const result = await authService.login({ orgSlug, email, password });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const refreshToken = requireString(req.body, 'refreshToken', { max: 2048 });
    const tokens = await authService.refresh(refreshToken);
    return res.json(tokens);
  } catch (err) {
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    const refreshToken = requireString(req.body, 'refreshToken', { max: 2048 });
    await authService.logout(refreshToken);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, refresh, logout };
