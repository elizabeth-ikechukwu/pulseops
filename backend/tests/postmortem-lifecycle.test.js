// tests/postmortem-lifecycle.test.js
// Rules that must hold:
//  - a postmortem can only be generated for a resolved or closed incident
//  - only one postmortem can exist per incident, ever
//  - once published, a postmortem becomes read-only

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
  return res.body;
}

async function createResolvedIncident(token) {
  const created = await request(app)
    .post('/api/incidents')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Incident to close out', severity: 'P1' });
  const id = created.body.id;

  for (const status of ['acknowledged', 'in_progress', 'resolved']) {
    await request(app)
      .post(`/api/incidents/${id}/transition`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });
  }
  return id;
}

describe('postmortem generation', () => {
  it('refuses to generate a postmortem for an open incident', async () => {
    // Arrange: an incident that is still open, never resolved
    const org = await registerOrg('pm-test-org');
    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ title: 'Still burning', severity: 'P1' });

    // Act
    const res = await request(app)
      .post(`/api/incidents/${created.body.id}/postmortem`)
      .set('Authorization', `Bearer ${org.accessToken}`);

    // Assert
    expect(res.status).toBe(400);
  });

  it('generates a draft postmortem for a resolved incident, pre-filled with real data', async () => {
    // Arrange
    const org = await registerOrg('pm-test-org');
    const incidentId = await createResolvedIncident(org.accessToken);

    // Act
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/postmortem`)
      .set('Authorization', `Bearer ${org.accessToken}`);

    // Assert
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.content_md).toContain('Incident to close out');
    expect(res.body.content_md).toContain('P1');
  });

  it('refuses a second postmortem for the same incident', async () => {
    // Arrange: generate one already
    const org = await registerOrg('pm-test-org');
    const incidentId = await createResolvedIncident(org.accessToken);
    await request(app)
      .post(`/api/incidents/${incidentId}/postmortem`)
      .set('Authorization', `Bearer ${org.accessToken}`);

    // Act: try to generate a second one
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/postmortem`)
      .set('Authorization', `Bearer ${org.accessToken}`);

    // Assert
    expect(res.status).toBe(409);
  });
});

describe('postmortem draft → publish lifecycle', () => {
  it('a draft can be edited', async () => {
    // Arrange
    const org = await registerOrg('pm-test-org');
    const incidentId = await createResolvedIncident(org.accessToken);
    await request(app)
      .post(`/api/incidents/${incidentId}/postmortem`)
      .set('Authorization', `Bearer ${org.accessToken}`);

    // Act
    const res = await request(app)
      .patch(`/api/incidents/${incidentId}/postmortem`)
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ content: '# Edited root cause analysis' });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.content_md).toBe('# Edited root cause analysis');
  });

  it('publishing locks the postmortem — no further edits allowed', async () => {
    // Arrange: a draft, published
    const org = await registerOrg('pm-test-org');
    const incidentId = await createResolvedIncident(org.accessToken);
    await request(app)
      .post(`/api/incidents/${incidentId}/postmortem`)
      .set('Authorization', `Bearer ${org.accessToken}`);

    const published = await request(app)
      .post(`/api/incidents/${incidentId}/postmortem/publish`)
      .set('Authorization', `Bearer ${org.accessToken}`);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('published');
    expect(published.body.published_at).not.toBeNull();

    // Act: try to edit it after publishing
    const editAttempt = await request(app)
      .patch(`/api/incidents/${incidentId}/postmortem`)
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ content: 'trying to sneak an edit in' });

    // Assert: rejected — published is immutable
    expect(editAttempt.status).toBe(409);
  });

  it('cannot publish the same postmortem twice', async () => {
    const org = await registerOrg('pm-test-org');
    const incidentId = await createResolvedIncident(org.accessToken);
    await request(app)
      .post(`/api/incidents/${incidentId}/postmortem`)
      .set('Authorization', `Bearer ${org.accessToken}`);
    await request(app)
      .post(`/api/incidents/${incidentId}/postmortem/publish`)
      .set('Authorization', `Bearer ${org.accessToken}`);

    const secondPublish = await request(app)
      .post(`/api/incidents/${incidentId}/postmortem/publish`)
      .set('Authorization', `Bearer ${org.accessToken}`);

    expect(secondPublish.status).toBe(409);
  });
});
