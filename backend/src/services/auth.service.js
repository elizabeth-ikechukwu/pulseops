// src/services/auth.service.js
// Registration, login, refresh rotation, logout.
//
// Token design:
//  - Access token: short-lived JWT carrying { sub, org, role }.
//    Stateless: verified by signature only, never hits Redis.
//  - Refresh token: long-lived JWT carrying { sub, jti }, and the jti
//    is whitelisted in Redis. Refresh rotates: old jti is deleted,
//    new one written. A stolen+reused refresh token therefore fails
//    the moment the legitimate client has rotated.

'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const { redis } = require('../config/redis');
const userModel = require('../models/user.model');
const {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} = require('../utils/errors');

const refreshKey = (userId, jti) => `refresh:${userId}:${jti}`;

// '15m' / '7d' -> seconds, for Redis TTLs
function ttlToSeconds(ttl) {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) throw new Error(`Invalid TTL format: ${ttl}`);
  const n = Number(match[1]);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, org: user.org_id, role: user.role },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessTtl }
  );
}

async function signRefreshToken(user) {
  const jti = uuidv4();
  const token = jwt.sign({ sub: user.id, jti }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
  });
  await redis.set(refreshKey(user.id, jti), '1', {
    EX: ttlToSeconds(env.jwt.refreshTtl),
  });
  return token;
}

async function issueTokenPair(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: await signRefreshToken(user),
  };
}

async function register({ orgName, orgSlug, email, password, fullName }) {
  if (password.length < 10) {
    throw new BadRequestError('Password must be at least 10 characters');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  try {
    const { org, user } = await userModel.createOrgWithAdmin({
      orgName,
      orgSlug,
      email,
      passwordHash,
      fullName,
    });
    const tokens = await issueTokenPair(user);
    return { org, user, ...tokens };
  } catch (err) {
    // 23505 = unique_violation
    if (err.code === '23505') {
      throw new ConflictError('Organization slug or email already in use');
    }
    throw err;
  }
}

async function login({ orgSlug, email, password }) {
  const user = await userModel.findByEmailForLogin(orgSlug, email);

  // Hash comparison runs even when the user is missing so response
  // timing does not reveal whether an email exists.
  const hash = user?.password_hash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalid123456789012';
  const passwordOk = await bcrypt.compare(password, hash);

  if (!user || !passwordOk || !user.is_active) {
    throw new UnauthorizedError('Invalid credentials');
  }

  await userModel.touchLastLogin(user.id);
  const tokens = await issueTokenPair(user);
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, ...tokens };
}

async function refresh(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const key = refreshKey(payload.sub, payload.jti);
  const deleted = await redis.del(key); // atomic consume: rotate or reject
  if (deleted !== 1) {
    throw new UnauthorizedError('Refresh token revoked or already used');
  }

  const user = await userModel.findById(payload.sub);
  if (!user || !user.is_active) {
    throw new UnauthorizedError('Account is disabled');
  }

  return issueTokenPair(user);
}

async function logout(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
    await redis.del(refreshKey(payload.sub, payload.jti));
  } catch {
    // Already invalid: logout is idempotent, nothing to do.
  }
}

module.exports = { register, login, refresh, logout };
