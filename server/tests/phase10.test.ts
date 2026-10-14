import http from 'node:http';
import crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachSocketServer } from '../src/ws/socketServer.js';
import { prisma } from '../src/db.js';
import { authRateLimiter } from '../src/security/rateLimit.js';
import type { WsSendMessageAck } from '@kamand/shared';

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
  await prisma.report.deleteMany();
  await prisma.reaction.deleteMany();
  await prisma.attachment.deleteMany();
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
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
});

describe('Phase 10 Final Security & Cross-User Authorization Audit (Section 16.4)', () => {
  it('Denies cross-user unauthorized access across conversations, attachments, statuses, admin routes, and WebSocket events', async () => {
    const alice = await registerTestUser('alice_sec');
    const bob = await registerTestUser('bob_sec');
    const mallory = await registerTestUser('mallory_attacker');

    // 1. Alice and Bob create a private 1:1 conversation
    const convRes = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({ targetUserId: bob.user.id });
    const convId = convRes.body.conversation.id as string;

    // Mallory tries to read Alice<->Bob conversation messages -> 403 Forbidden
    const malloryReadConv = await request(app)
      .get(`/api/conversations/${convId}/messages`)
      .set('Cookie', mallory.cookie);
    expect(malloryReadConv.status).toBe(403);

    // 2. Alice uploads a PNG attachment and posts it in Alice<->Bob conversation
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const uploadRes = await request(app)
      .post('/api/media/upload')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({
        fileName: 'private.png',
        mimeType: 'image/png',
        base64Data: pngBytes.toString('base64'),
      });
    const attachmentId = uploadRes.body.attachment.id as string;

    await prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        conversationId: convId,
        senderId: alice.user.id,
        body: 'Private attachment',
        type: 'image',
        attachmentId,
        seq: 1,
      },
    });

    // Mallory tries to download Alice's attachment -> 403 Forbidden
    const malloryDownload = await request(app)
      .get(`/api/media/${attachmentId}`)
      .set('Cookie', mallory.cookie);
    expect(malloryDownload.status).toBe(403);

    // 3. Alice posts a contacts-only 24h Status -> Mallory (non-contact) is denied viewing it (403)
    const statusRes = await request(app)
      .post('/api/statuses')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({
        caption: 'Contacts-only status',
        bgColor: '#0284c7',
        visibility: 'contacts',
      });
    const statusId = statusRes.body.status.id as string;

    const malloryStatusView = await request(app)
      .post(`/api/statuses/${statusId}/view`)
      .set('Cookie', mallory.cookie)
      .set('X-CSRF-Token', mallory.csrfToken);
    expect(malloryStatusView.status).toBe(403);

    // 4. Mallory tries to access Admin routes (/api/admin/overview, /api/admin/users, /api/admin/reports) -> all 403
    expect(
      (await request(app).get('/api/admin/overview').set('Cookie', mallory.cookie)).status
    ).toBe(403);
    expect(
      (await request(app).get('/api/admin/users').set('Cookie', mallory.cookie)).status
    ).toBe(403);
    expect(
      (await request(app).get('/api/admin/reports').set('Cookie', mallory.cookie)).status
    ).toBe(403);

    // 5. Mallory connects over WebSockets and tries to send a message into Alice<->Bob's conversation -> FORBIDDEN
    const mallorySocket: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: mallory.cookie },
      transports: ['websocket'],
    });
    await new Promise<void>((r) => mallorySocket.on('connect', () => r()));

    const wsAttackAck = await new Promise<WsSendMessageAck>((resolve) => {
      mallorySocket.emit(
        'message:send',
        {
          id: crypto.randomUUID(),
          conversationId: convId,
          body: 'Unauthorized WebSocket injection attempt',
        },
        (res: WsSendMessageAck) => resolve(res)
      );
    });
    expect(wsAttackAck.ok).toBe(false);
    if (!wsAttackAck.ok) {
      expect(wsAttackAck.code).toBe('FORBIDDEN');
    }

    mallorySocket.disconnect();
  });
});
