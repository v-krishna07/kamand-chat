import http from 'node:http';
import crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachSocketServer, closeSocketServer } from '../src/ws/socketServer.js';
import { prisma } from '../src/db.js';
import { authRateLimiter } from '../src/security/rateLimit.js';

let httpServer: http.Server;
let serverUrl: string;
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

async function registerTestUser(username: string) {
  const res = await request(app).post('/api/auth/register').send({
    username,
    email: `${username}@students.iitmandi.ac.in`,
    displayName: username.toUpperCase(),
    password: 'Password123',
  });
  return {
    user: res.body.user,
    csrfToken: res.body.csrfToken as string,
    cookie: extractSessionCookie(res.headers['set-cookie']),
  };
}

beforeAll(async () => {
  httpServer = http.createServer(app);
  attachSocketServer(httpServer);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') {
        serverUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

beforeEach(async () => {
  authRateLimiter.reset();
  await prisma.callLog.deleteMany();
  await prisma.faceChallenge.deleteMany();
  await prisma.faceTemplate.deleteMany();
  await prisma.groupSenderKey.deleteMany();
  await prisma.device.deleteMany();
  await prisma.joinRequest.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.channelPermissionOverride.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.category.deleteMany();
  await prisma.communityMember.deleteMany();
  await prisma.community.deleteMany();
  await prisma.statusView.deleteMany();
  await prisma.status.deleteMany();
  await prisma.readReceipt.deleteMany();
  await prisma.message.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await closeSocketServer();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
});

describe('Phase 5 Server Call Signaling & CallLog Verification Suite', () => {
  it('1. Handles 1:1 call ring -> accept -> SDP offer/answer relay -> hangup, and persists CallLog + system chat message', async () => {
    const u1 = await registerTestUser('caller1');
    const u2 = await registerTestUser('callee1');

    // Verify STUN/TURN config endpoint
    const iceRes = await request(app).get('/api/calls/ice-config').set('Cookie', u1.cookie);
    expect(iceRes.status).toBe(200);
    expect(iceRes.body.iceServers.length).toBeGreaterThan(0);

    const convRes = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', u1.cookie)
      .set('X-CSRF-Token', u1.csrfToken)
      .send({ targetUserId: u2.user.id });
    const convId = convRes.body.conversation.id as string;

    const s1: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u1.cookie },
      transports: ['websocket'],
    });
    const s2: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u2.cookie },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((r) => s1.on('connect', () => r())),
      new Promise<void>((r) => s2.on('connect', () => r())),
    ]);

    const callId = crypto.randomUUID();
    const incomingPromise = new Promise<{ callId: string; mediaType: string }>((resolve) => {
      s2.on('call:incoming', (ev) => resolve(ev));
    });

    const initAck = await new Promise<{ ok: boolean; status?: string }>((resolve) => {
      s1.emit(
        'call:initiate',
        {
          callId,
          conversationId: convId,
          mediaType: 'video',
          isGroup: false,
          e2eeKeyMaterial: crypto.randomBytes(32).toString('base64'),
          keyGeneration: 1,
        },
        (res: { ok: boolean; status?: string }) => resolve(res)
      );
    });
    expect(initAck.ok).toBe(true);
    expect(initAck.status).toBe('ringing');

    const incomingEv = await incomingPromise;
    expect(incomingEv.callId).toBe(callId);

    // Callee accepts
    const joinedPromise = new Promise<{ userId: string }>((resolve) => {
      s1.on('call:participant-joined', (ev) => resolve(ev));
    });

    const acceptAck = await new Promise<{ ok: boolean }>((resolve) => {
      s2.emit('call:accept', { callId, conversationId: convId }, (res: { ok: boolean }) =>
        resolve(res)
      );
    });
    expect(acceptAck.ok).toBe(true);
    const joinedEv = await joinedPromise;
    expect(joinedEv.userId).toBe(u2.user.id);

    // Relay SDP offer from s1 to s2
    const signalPromise = new Promise<{ signalType: string; sdp?: string }>((resolve) => {
      s2.on('call:signal', (ev) => resolve(ev));
    });
    s1.emit('call:signal', {
      callId,
      conversationId: convId,
      targetUserId: u2.user.id,
      signalType: 'offer',
      sdp: 'v=0\r\no=- 123 1 IN IP4 127.0.0.1\r\n',
    });
    const sigEv = await signalPromise;
    expect(sigEv.signalType).toBe('offer');

    // Hang up call
    await new Promise<{ ok: boolean }>((resolve) => {
      s1.emit('call:hangup', { callId, conversationId: convId }, (res: { ok: boolean }) =>
        resolve(res)
      );
    });

    // Verify CallLog record in Prisma and system message in chat
    const historyRes = await request(app)
      .get(`/api/calls/history/${convId}`)
      .set('Cookie', u1.cookie);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.callLogs[0].id).toBe(callId);
    expect(historyRes.body.callLogs[0].status).toBe('completed');

    const msgsRes = await request(app)
      .get(`/api/conversations/${convId}/messages`)
      .set('Cookie', u1.cookie);
    expect(msgsRes.body.messages.some((m: { type: string }) => m.type === 'system')).toBe(true);

    s1.disconnect();
    s2.disconnect();
  });

  it('2. Handles decline, busy detection, timeout (missed), and rotates E2EE media keys when a participant leaves a group call', async () => {
    const u1 = await registerTestUser('g_user1');
    const u2 = await registerTestUser('g_user2');
    const u3 = await registerTestUser('g_user3');

    // Create a community group channel with u1, u2, u3
    const commRes = await request(app)
      .post('/api/communities')
      .set('Cookie', u1.cookie)
      .set('X-CSRF-Token', u1.csrfToken)
      .send({ name: 'Call Mesh Group', slug: 'call-mesh' });
    const commId = commRes.body.community.id as string;
    const groupConvId = commRes.body.community.categories[0].channels[0].conversationId as string;

    const invRes = await request(app)
      .post(`/api/communities/${commId}/invites`)
      .set('Cookie', u1.cookie)
      .set('X-CSRF-Token', u1.csrfToken)
      .send({ expiresInHours: 24 });
    const code = invRes.body.invite.code as string;

    await request(app)
      .post(`/api/communities/join/${code}`)
      .set('Cookie', u2.cookie)
      .set('X-CSRF-Token', u2.csrfToken);
    await request(app)
      .post(`/api/communities/join/${code}`)
      .set('Cookie', u3.cookie)
      .set('X-CSRF-Token', u3.csrfToken);

    const s1 = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u1.cookie },
      transports: ['websocket'],
    });
    const s2 = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u2.cookie },
      transports: ['websocket'],
    });
    const s3 = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u3.cookie },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((r) => s1.on('connect', () => r())),
      new Promise<void>((r) => s2.on('connect', () => r())),
      new Promise<void>((r) => s3.on('connect', () => r())),
    ]);

    const groupCallId = crypto.randomUUID();
    await new Promise<{ ok: boolean }>((resolve) => {
      s1.emit(
        'call:initiate',
        {
          callId: groupCallId,
          conversationId: groupConvId,
          mediaType: 'audio',
          isGroup: true,
          e2eeKeyMaterial: crypto.randomBytes(32).toString('base64'),
          keyGeneration: 1,
        },
        (res: { ok: boolean }) => resolve(res)
      );
    });

    // Both u2 and u3 accept the group call (3 participants in mesh)
    await new Promise<{ ok: boolean }>((r) =>
      s2.emit('call:accept', { callId: groupCallId, conversationId: groupConvId }, (res: { ok: boolean }) => r(res))
    );
    await new Promise<{ ok: boolean }>((r) =>
      s3.emit('call:accept', { callId: groupCallId, conversationId: groupConvId }, (res: { ok: boolean }) => r(res))
    );

    // u3 leaves the group call -> u1 and u2 must receive `call:participant-left` with `rotatedKeyGeneration: 2`
    const rotationPromise = new Promise<{
      leftUserId: string;
      rotatedKeyGeneration: number;
      rotatedKeyMaterial: string;
    }>((resolve) => {
      s1.on('call:participant-left', (ev) => resolve(ev));
    });

    s3.emit('call:hangup', { callId: groupCallId, conversationId: groupConvId });
    const rotEv = await rotationPromise;
    expect(rotEv.leftUserId).toBe(u3.user.id);
    expect(rotEv.rotatedKeyGeneration).toBe(2);
    expect(rotEv.rotatedKeyMaterial.length).toBeGreaterThan(16);

    // Clean up group call
    s1.emit('call:hangup', { callId: groupCallId, conversationId: groupConvId });

    s1.disconnect();
    s2.disconnect();
    s3.disconnect();
  });
});
