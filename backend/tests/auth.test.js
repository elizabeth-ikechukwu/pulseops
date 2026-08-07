// tests/auth.test.js
// Tests for registration and login. These two flows are the
// foundation everything else stands on, if a request can't get a
// valid token, nothing else in the app works, so they're the right
// place to start.

'use strict';

const request = require('supertest');
const app = require('../src/app');
const { setupTestLifecycle } = require('./helpers/hooks');

setupTestLifecycle();

// A reusable "arrange" step: most tests need a registered org+admin
// to exist first, so we don't repeat this five times.
async function registerTestOrg(overrides = {}) {
  return request(app)
    .post('/api/auth/register')
    .send({
      orgName: 'Test Org',
      orgSlug: 'test-org',
      email: 'admin@test-org.com',
      password: 'correct-horse-battery',
      fullName: 'Test Admin',
      ...overrides,
    });
}

describe('POST /api/auth/register', () => {
  it('creates an org and its first admin, and returns usable tokens', async () => {
    // Act
    const res = await registerTestOrg();

    // Assert
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.org.slug).toBe('test-org');
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects a second registration with the same org slug', async () => {
    // Arrange: an org already exists
    await registerTestOrg();

    // Act: try to create another org with the same slug
    const res = await registerTestOrg({ email: 'someone-else@test-org.com' });

    // Assert
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects a password shorter than 10 characters', async () => {
    const res = await registerTestOrg({ password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    // Arrange
    await registerTestOrg();

    // Act
    const res = await request(app).post('/api/auth/login').send({
      orgSlug: 'test-org',
      email: 'admin@test-org.com',
      password: 'correct-horse-battery',
    });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.user.email.toLowerCase()).toBe('admin@test-org.com');
  });

  it('rejects the wrong password', async () => {
    // Arrange
    await registerTestOrg();

    // Act
    const res = await request(app).post('/api/auth/login').send({
      orgSlug: 'test-org',
      email: 'admin@test-org.com',
      password: 'totally-the-wrong-password',
    });

    // Assert: must be rejected, and must not leak a token
    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
  });

  it('rejects login for a slug that does not exist', async () => {
    const res = await request(app).post('/api/auth/login').send({
      orgSlug: 'does-not-exist',
      email: 'nobody@nowhere.com',
      password: 'whatever-password-123',
    });
    expect(res.status).toBe(401);
  });
});

describe('protected routes', () => {
  it('rejects a request with no token at all', async () => {
    // Act: hit an incidents endpoint with zero Authorization header
    const res = await request(app).get('/api/incidents');

    // Assert
    expect(res.status).toBe(401);
  });

  it('rejects a request with a garbage token', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', 'Bearer this-is-not-a-real-token');

    expect(res.status).toBe(401);
  });

  it('accepts a request with a real token from a fresh login', async () => {
    // Arrange
    await registerTestOrg();
    const login = await request(app).post('/api/auth/login').send({
      orgSlug: 'test-org',
      email: 'admin@test-org.com',
      password: 'correct-horse-battery',
    });

    // Act
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    // Assert
    expect(res.status).toBe(200);
  });
});

describe('refresh token rotation', () => {
  it('a used refresh token cannot be reused', async () => {
    // Arrange: register, note the first refresh token
    const registered = await registerTestOrg();
    const firstRefreshToken = registered.body.refreshToken;

    // Act: use it once, successfully
    const firstUse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: firstRefreshToken });
    expect(firstUse.status).toBe(200); // sanity check on the setup step

    // Act again: try to reuse the SAME token a second time
    const secondUse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: firstRefreshToken });

    // Assert: this is the security property that matters — a stolen,
    // already-used refresh token must not work again
    expect(secondUse.status).toBe(401);
  });
});
