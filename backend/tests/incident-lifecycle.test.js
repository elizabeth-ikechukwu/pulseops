// tests/incident-lifecycle.test.js
// Two things must hold for the incident workflow to be trustworthy:
//  1. Status can only move through the real sequence — no skipping
//     straight from "open" to "resolved"
//  2. Only the right roles can create or change incidents

'use strict';

const bcrypt = require('bcrypt');
const request = require('supertest');
const app = require('../src/app');
const userModel = require('../src/models/user.model');
const { setupTestLifecycle } = require('./helpers/hooks');

setupTestLifecycle();

async function registerOrg(orgSlug) {
  const res = await request(app).post('/api/auth/register').send({
    orgName: orgSlug,
    orgSlug,
    email: `admin@${orgSlug}.com`,
    password: 'correct-horse-battery',
    fullName: 'Test Admin',
  });
  return res.body;
}

// Seeds a second user with a specific role directly through the model
// layer, since there is no self-serve "invite a viewer" endpoint yet.
// This is how role restrictions get tested until that exists.
async function seedUserWithRole(orgId, role) {
  const passwordHash = await bcrypt.hash('correct-horse-battery', 4);
  const user = await userModel.createUser({
    orgId,
    email: `${role}@seeded.com`,
    passwordHash,
    fullName: `Test ${role}`,
    role,
  });
  return user;
}

async function loginAs(orgSlug, email) {
  const res = await request(app).post('/api/auth/login').send({
    orgSlug,
    email,
    password: 'correct-horse-battery',
  });
  return res.body.accessToken;
}

describe('role restrictions', () => {
  it('a viewer cannot create an incident', async () => {
    // Arrange
    const org = await registerOrg('role-test-org');
    await seedUserWithRole(org.org.id, 'viewer');
    const viewerToken = await loginAs('role-test-org', 'viewer@seeded.com');

    // Act
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ title: 'Should not be allowed', severity: 'P1' });

    // Assert
    expect(res.status).toBe(403);
  });

  it('a viewer CAN read the incident list', async () => {
    const org = await registerOrg('role-test-org');
    await seedUserWithRole(org.org.id, 'viewer');
    const viewerToken = await loginAs('role-test-org', 'viewer@seeded.com');

    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
  });

  it('an engineer CAN create an incident', async () => {
    const org = await registerOrg('role-test-org');
    await seedUserWithRole(org.org.id, 'engineer');
    const engineerToken = await loginAs('role-test-org', 'engineer@seeded.com');

    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${engineerToken}`)
      .send({ title: 'Engineer-created incident', severity: 'P2' });

    expect(res.status).toBe(201);
  });

  it('only an admin can delete an incident, not an engineer', async () => {
    const org = await registerOrg('role-test-org');
    await seedUserWithRole(org.org.id, 'engineer');
    const engineerToken = await loginAs('role-test-org', 'engineer@seeded.com');

    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${engineerToken}`)
      .send({ title: 'Try to delete me', severity: 'P3' });

    const res = await request(app)
      .delete(`/api/incidents/${created.body.id}`)
      .set('Authorization', `Bearer ${engineerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('status state machine', () => {
  it('cannot jump straight from open to resolved', async () => {
    // Arrange
    const org = await registerOrg('state-test-org');
    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ title: 'New incident', severity: 'P1' });

    // Act: try the illegal jump
    const res = await request(app)
      .post(`/api/incidents/${created.body.id}/transition`)
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ status: 'resolved' });

    // Assert
    expect(res.status).toBe(400);
    expect(created.body.status).toBe('open'); // started correctly
  });

  it('the full legal chain works end to end and stamps timestamps', async () => {
    // Arrange
    const org = await registerOrg('state-test-org');
    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ title: 'Full lifecycle incident', severity: 'P1' });
    const id = created.body.id;

    // Act + Assert, one legal step at a time
    const ack = await request(app)
      .post(`/api/incidents/${id}/transition`)
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ status: 'acknowledged' });
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledged_at).not.toBeNull();

    const inProgress = await request(app)
      .post(`/api/incidents/${id}/transition`)
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ status: 'in_progress' });
    expect(inProgress.status).toBe(200);

    const resolved = await request(app)
      .post(`/api/incidents/${id}/transition`)
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ status: 'resolved' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.resolved_at).not.toBeNull();
    expect(resolved.body.timers.time_to_resolve_seconds).toBeGreaterThanOrEqual(0);
  });

  it('cannot transition an already-closed incident', async () => {
    // Arrange: walk an incident all the way to closed
    const org = await registerOrg('state-test-org');
    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ title: 'Will be closed', severity: 'P2' });
    const id = created.body.id;

    for (const status of ['acknowledged', 'in_progress', 'resolved', 'closed']) {
      await request(app)
        .post(`/api/incidents/${id}/transition`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ status });
    }

    // Act: try to move a closed incident anywhere
    const res = await request(app)
      .post(`/api/incidents/${id}/transition`)
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ status: 'acknowledged' });

    // Assert: closed is terminal
    expect(res.status).toBe(400);
  });
});
