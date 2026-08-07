// tests/tenant-isolation.test.js
// The one guarantee this entire app depends on: an organization can
// never see, read, modify, or delete another organization's data,
// even with a valid, real login token, even by guessing a UUID.
//
// If any test in this file ever fails, that is a data breach between
// customers, not a cosmetic bug. This file matters more than any
// other test in the project.

'use strict';

const request = require('supertest');
const app = require('../src/app');
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
  return res.body; // { org, user, accessToken, refreshToken }
}

describe('tenant isolation', () => {
  it('an org cannot see another org\'s incidents in its list', async () => {
    // Arrange: two separate companies, each with their own admin
    const orgA = await registerOrg('org-a');
    const orgB = await registerOrg('org-b');

    await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ title: 'Org A private incident', severity: 'P1' });

    // Act: Org B lists incidents
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${orgB.accessToken}`);

    // Assert: Org B sees nothing, not even a count of 1
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.incidents).toHaveLength(0);
  });

  it('an org cannot fetch another org\'s incident by direct ID', async () => {
    // Arrange
    const orgA = await registerOrg('org-a');
    const orgB = await registerOrg('org-b');

    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ title: 'Org A private incident', severity: 'P1' });
    const incidentId = created.body.id;

    // Act: Org B tries the EXACT real ID, not a guess
    const res = await request(app)
      .get(`/api/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${orgB.accessToken}`);

    // Assert: 404, not 403 — the app should not even confirm the
    // incident exists to an org that doesn't own it
    expect(res.status).toBe(404);
  });

  it('an org cannot transition another org\'s incident', async () => {
    const orgA = await registerOrg('org-a');
    const orgB = await registerOrg('org-b');

    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ title: 'Org A private incident', severity: 'P1' });

    const res = await request(app)
      .post(`/api/incidents/${created.body.id}/transition`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({ status: 'acknowledged' });

    expect(res.status).toBe(404);
  });

  it('an org cannot delete another org\'s incident', async () => {
    const orgA = await registerOrg('org-a');
    const orgB = await registerOrg('org-b');

    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ title: 'Org A private incident', severity: 'P1' });

    const res = await request(app)
      .delete(`/api/incidents/${created.body.id}`)
      .set('Authorization', `Bearer ${orgB.accessToken}`);

    expect(res.status).toBe(404);

    // Control check: the incident must still exist for its real owner
    const stillThere = await request(app)
      .get(`/api/incidents/${created.body.id}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`);
    expect(stillThere.status).toBe(200);
  });

  it('an org cannot assign one of its incidents to a user from another org', async () => {
    // Arrange
    const orgA = await registerOrg('org-a');
    const orgB = await registerOrg('org-b');

    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ title: 'Org A private incident', severity: 'P1' });

    // Act: Org A tries to assign it to Org B's admin user
    const res = await request(app)
      .patch(`/api/incidents/${created.body.id}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ assignedTo: orgB.user.id });

    // Assert: rejected — cross-org assignment is not a valid target
    expect(res.status).toBe(400);
  });

  it('the real owner can still access their own incident normally', async () => {
    // Control test: isolation should never block legitimate access
    const orgA = await registerOrg('org-a');

    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ title: 'Org A incident', severity: 'P2' });

    const res = await request(app)
      .get(`/api/incidents/${created.body.id}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Org A incident');
  });
});
