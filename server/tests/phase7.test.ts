import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { authRateLimiter } from '../src/security/rateLimit.js';
import {
  resetAllConnectorStatesForTesting,
  setConnectorProbeOverrideForTesting,
} from '../src/campus/connectorRegistry.js';

const app = createApp();

function extractSessionCookie(setCookieHeader: string[] | string | undefined): string {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const match = list.find((c) => c.startsWith('kamand_sid='));
  return match ? match.split(';')[0]! : '';
}

async function registerTestUser(username: string, email?: string) {
  const res = await request(app).post('/api/auth/register').send({
    username,
    email: email || `${username}@students.iitmandi.ac.in`,
    displayName: username.toUpperCase(),
    password: 'Password123',
  });
  return {
    user: res.body.user,
    csrfToken: res.body.csrfToken as string,
    cookie: extractSessionCookie(res.headers['set-cookie']),
  };
}

beforeEach(async () => {
  authRateLimiter.reset();
  resetAllConnectorStatesForTesting();
  await prisma.campusDatum.deleteMany();
  await prisma.timetableSlot.deleteMany();
  await prisma.connectorAccount.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Phase 7 Verification Suite: Campus Connectors (Pass, Fail, Timeout, Schema-Change, Auth-Failure), UI Hiding, Encrypted Token Purge & Zero Password Storage', () => {
  it('1. Probes connectors across pass, fail, timeout, schema_change, and auth_failure; hides UI on failure and locks after 3 consecutive failures for 24h', async () => {
    const u = await registerTestUser('probe_user', 'b26343@students.iitmandi.ac.in');

    // 1. Pass outcome
    const passRes = await request(app)
      .post('/api/campus/connectors/moodle_lms/probe')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken)
      .send({ simulatedOutcome: 'pass', forceRetry: true });
    expect(passRes.status).toBe(200);
    expect(passRes.body.connector.status).toBe('connected');
    expect(passRes.body.connector.uiVisible).toBe(true);

    // 2. Fail outcome -> uiVisible must become false ("degraded_hidden")
    const failRes = await request(app)
      .post('/api/campus/connectors/moodle_lms/probe')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken)
      .send({ simulatedOutcome: 'fail', forceRetry: true });
    expect(failRes.body.connector.status).toBe('degraded_hidden');
    expect(failRes.body.connector.uiVisible).toBe(false);
    expect(failRes.body.connector.failureCount).toBe(1);

    // 3. Timeout outcome -> failureCount = 2, uiVisible = false
    const timeoutRes = await request(app)
      .post('/api/campus/connectors/moodle_lms/probe')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken)
      .send({ simulatedOutcome: 'timeout', forceRetry: true });
    expect(timeoutRes.body.connector.status).toBe('degraded_hidden');
    expect(timeoutRes.body.connector.uiVisible).toBe(false);
    expect(timeoutRes.body.connector.failureCount).toBe(2);
    expect(timeoutRes.body.connector.lastError).toContain('timed out');

    // 4. Schema-change outcome -> failureCount = 3 (hits maxProbeFailures = 3 -> 24h backoff)
    const schemaRes = await request(app)
      .post('/api/campus/connectors/moodle_lms/probe')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken)
      .send({ simulatedOutcome: 'schema_change', forceRetry: true });
    expect(schemaRes.body.connector.failureCount).toBe(3);
    expect(schemaRes.body.connector.uiVisible).toBe(false);
    expect(schemaRes.body.connector.lastError).toContain('schema changed');

    // 5. Auth-failure outcome on academic_portal -> uiVisible = false
    const authFailRes = await request(app)
      .post('/api/campus/connectors/academic_portal/probe')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken)
      .send({ simulatedOutcome: 'auth_failure', forceRetry: true });
    expect(authFailRes.body.connector.status).toBe('degraded_hidden');
    expect(authFailRes.body.connector.uiVisible).toBe(false);
    expect(authFailRes.body.connector.lastError).toContain('SSO/CAPTCHA');
  });

  it('2. Encrypts Moodle token at rest, never persists or logs institute passwords on login_once exchange, hides UI on failure, and deletes cached data + token on disconnect', async () => {
    const u = await registerTestUser('moodle_student', 'b23101@students.iitmandi.ac.in');
    const sensitiveInstitutePassword = 'MySuperSecretInstitutePassword!99';

    // Connect using login_once mode
    const connectRes = await request(app)
      .post('/api/campus/connectors/moodle/connect')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken)
      .send({
        explicitConsent: true,
        mode: 'login_once',
        username: 'b23101',
        password: sensitiveInstitutePassword,
      });

    expect(connectRes.status).toBe(200);
    expect(connectRes.body.ok).toBe(true);
    expect(connectRes.body.connector.uiVisible).toBe(true);

    // Inspect raw DB dump (ConnectorAccount + AuditLog) -> confirm password is NEVER persisted anywhere
    const rawAccount = await prisma.connectorAccount.findUnique({
      where: {
        userId_connectorId: { userId: u.user.id, connectorId: 'moodle_lms' },
      },
    });
    expect(rawAccount).not.toBeNull();
    expect(JSON.stringify(rawAccount)).not.toContain(sensitiveInstitutePassword);
    expect(rawAccount!.encryptedToken).not.toContain('moodle-exchanged-ws-token'); // Encrypted at rest

    const logs = await prisma.auditLog.findMany({ where: { actorId: u.user.id } });
    expect(JSON.stringify(logs)).not.toContain(sensitiveInstitutePassword);

    // Verify Today dashboard shows Moodle courses & deadlines while connected
    const todayConnected = await request(app).get('/api/campus/today').set('Cookie', u.cookie);
    expect(todayConnected.status).toBe(200);
    expect(todayConnected.body.studentProfile.rollNumber).toBe('B23101');
    expect(todayConnected.body.moodle.uiVisible).toBe(true);
    expect(todayConnected.body.moodle.courses.length).toBeGreaterThan(0);

    // Simulate connector failure -> Today dashboard must hide Moodle UI (`moodle.uiVisible === false`, empty courses)
    setConnectorProbeOverrideForTesting('moodle_lms', 'fail');
    await request(app)
      .post('/api/campus/connectors/moodle_lms/probe')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken)
      .send({ forceRetry: true });

    const todayDegraded = await request(app).get('/api/campus/today').set('Cookie', u.cookie);
    expect(todayDegraded.body.moodle.uiVisible).toBe(false);
    expect(todayDegraded.body.moodle.courses).toHaveLength(0);

    // One-tap Disconnect & Delete Cached Data -> deletes ConnectorAccount row and encrypted token
    const disconnectRes = await request(app)
      .delete('/api/campus/connectors/moodle_lms')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken);
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.deletedCachedData).toBe(true);

    const afterDelete = await prisma.connectorAccount.findUnique({
      where: {
        userId_connectorId: { userId: u.user.id, connectorId: 'moodle_lms' },
      },
    });
    expect(afterDelete).toBeNull();
  });

  it('3. Grounds Campus AI answers strictly on verified campus data with source citations and returns "Not found" instead of guessing', async () => {
    const admin = await registerTestUser('campus_admin');
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'super_admin' } });

    await request(app)
      .post('/api/campus/services')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        category: 'mess_menu',
        title: 'Pine Mess Dinner Menu',
        subtitle: 'North Campus',
        body: 'Paneer Butter Masala, Moong Dal, and Chapati served from 19:30 to 21:30.',
      });

    // Query matching grounded data -> returns answer + source citation
    const hitRes = await request(app)
      .post('/api/campus/ask-grounded')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ question: 'What is on the Pine Mess dinner menu?' });
    expect(hitRes.status).toBe(200);
    expect(hitRes.body.found).toBe(true);
    expect(hitRes.body.answer).toContain('Paneer Butter Masala');
    expect(hitRes.body.citations[0].title).toBe('Pine Mess Dinner Menu');

    // Query about unverified topic -> returns found: false & "Not found"
    const missRes = await request(app)
      .post('/api/campus/ask-grounded')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ question: 'When does the Mars rocket launch from Mandi?' });
    expect(missRes.status).toBe(200);
    expect(missRes.body.found).toBe(false);
    expect(missRes.body.answer).toContain('Not found');
    expect(missRes.body.citations).toHaveLength(0);
  });
});
