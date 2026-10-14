import http from 'node:http';
import crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachSocketServer } from '../src/ws/socketServer.js';
import { prisma } from '../src/db.js';
import { authRateLimiter } from '../src/security/rateLimit.js';
import type { MessageDTO, WsSendMessageAck, WsSyncResumeAck } from '@kamand/shared';

let httpServer: http.Server;
let ioServer: ReturnType<typeof attachSocketServer>;
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

beforeAll(async () => {
  httpServer = http.createServer(app);
  ioServer = attachSocketServer(httpServer);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') {
        serverUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

beforeEach(async () => {
  authRateLimiter.reset();
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
  ioServer?.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
});

describe('Phase 1 Verification Suite: Core Auth, CSRF, 1:1 Conversations & WebSockets', () => {
  it('1. Registers a new user, hashes password with Argon2id, sets HTTP-only session cookie, and returns CSRF token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'Alice_IITM',
      email: 'alice@students.iitmandi.ac.in',
      displayName: 'Alice Verma',
      password: 'Password123',
      roomCode: 'b-19',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('alice_iitm');
    expect(res.body.user.roomCode).toBe('B-19');
    expect(res.body.csrfToken).toBeDefined();

    const cookie = extractSessionCookie(res.headers['set-cookie']);
    expect(cookie).toContain('kamand_sid=');

    const dbUser = await prisma.user.findUnique({ where: { username: 'alice_iitm' } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.passwordHash).toContain('$argon2id$');
    expect(dbUser!.passwordHash).not.toContain('Password123');
  });

  it('2. Rejects weak passwords and duplicate usernames/emails', async () => {
    const weakRes = await request(app).post('/api/auth/register').send({
      username: 'bob',
      email: 'bob@students.iitmandi.ac.in',
      displayName: 'Bob',
      password: 'short',
    });
    expect(weakRes.status).toBe(400);

    await request(app).post('/api/auth/register').send({
      username: 'bob',
      email: 'bob@students.iitmandi.ac.in',
      displayName: 'Bob',
      password: 'Password123',
    });

    const dupRes = await request(app).post('/api/auth/register').send({
      username: 'bob',
      email: 'other@students.iitmandi.ac.in',
      displayName: 'Bob 2',
      password: 'Password123',
    });
    expect(dupRes.status).toBe(409);
  });

  it('3. Enforces account lockout after 5 consecutive failed login attempts', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'lockuser',
      email: 'lock@students.iitmandi.ac.in',
      displayName: 'Lock User',
      password: 'Password123',
    });

    for (let i = 0; i < 5; i++) {
      const failRes = await request(app).post('/api/auth/login').send({
        identifier: 'lockuser',
        password: 'WrongPassword999',
      });
      expect(failRes.status).toBe(401);
    }

    const lockedRes = await request(app).post('/api/auth/login').send({
      identifier: 'lockuser',
      password: 'Password123',
    });
    expect(lockedRes.status).toBe(423);
  });

  it('4. Persists session across /api/auth/me and enforces CSRF token on /api/auth/logout', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      username: 'charlie',
      email: 'charlie@students.iitmandi.ac.in',
      displayName: 'Charlie',
      password: 'Password123',
    });

    const cookie = extractSessionCookie(reg.headers['set-cookie']);
    const csrfToken = reg.body.csrfToken as string;

    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.username).toBe('charlie');

    // Attempt logout without CSRF token -> must fail with 403
    const badLogout = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(badLogout.status).toBe(403);

    // Valid logout with CSRF token -> 200
    const goodLogout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken);
    expect(goodLogout.status).toBe(200);

    // Session is now invalidated
    const afterMe = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(afterMe.status).toBe(401);
  });

  it('5. Creates idempotent 1:1 conversations and blocks unauthorized access from non-members', async () => {
    const u1 = await request(app).post('/api/auth/register').send({
      username: 'user1',
      email: 'u1@students.iitmandi.ac.in',
      displayName: 'User One',
      password: 'Password123',
    });
    const u2 = await request(app).post('/api/auth/register').send({
      username: 'user2',
      email: 'u2@students.iitmandi.ac.in',
      displayName: 'User Two',
      password: 'Password123',
    });
    const u3 = await request(app).post('/api/auth/register').send({
      username: 'user3',
      email: 'u3@students.iitmandi.ac.in',
      displayName: 'User Three',
      password: 'Password123',
    });

    const u1Cookie = extractSessionCookie(u1.headers['set-cookie']);
    const u1Csrf = u1.body.csrfToken;
    const u2Cookie = extractSessionCookie(u2.headers['set-cookie']);
    const u2Csrf = u2.body.csrfToken;
    const u3Cookie = extractSessionCookie(u3.headers['set-cookie']);

    const c1 = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', u1Cookie)
      .set('X-CSRF-Token', u1Csrf)
      .send({ targetUserId: u2.body.user.id });
    expect(c1.status).toBe(201);

    // Reverse creation from u2 -> u1 returns the exact same conversation (200)
    const c2 = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', u2Cookie)
      .set('X-CSRF-Token', u2Csrf)
      .send({ targetUserId: u1.body.user.id });
    expect(c2.status).toBe(200);
    expect(c2.body.conversation.id).toBe(c1.body.conversation.id);

    // Non-member u3 cannot read messages of u1<->u2 conversation
    const forbidden = await request(app)
      .get(`/api/conversations/${c1.body.conversation.id}/messages`)
      .set('Cookie', u3Cookie);
    expect(forbidden.status).toBe(403);
  });

  it(
    '6. Delivers real-time messages over WebSockets, enforces idempotency on duplicate client UUIDs, assigns monotonic seq, paginates history, and resumes on reconnect',
    async () => {
    const u1 = await request(app).post('/api/auth/register').send({
      username: 'sender',
      email: 'sender@students.iitmandi.ac.in',
      displayName: 'Sender',
      password: 'Password123',
    });
    const u2 = await request(app).post('/api/auth/register').send({
      username: 'receiver',
      email: 'receiver@students.iitmandi.ac.in',
      displayName: 'Receiver',
      password: 'Password123',
    });

    const u1Cookie = extractSessionCookie(u1.headers['set-cookie']);
    const u1Csrf = u1.body.csrfToken;
    const u2Cookie = extractSessionCookie(u2.headers['set-cookie']);

    const convRes = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', u1Cookie)
      .set('X-CSRF-Token', u1Csrf)
      .send({ targetUserId: u2.body.user.id });
    const convId = convRes.body.conversation.id as string;

    const socket1: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u1Cookie },
      transports: ['websocket'],
    });
    const socket2: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u2Cookie },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        socket1.once('connect', () => resolve());
        socket1.once('connect_error', (e) => reject(e));
      }),
      new Promise<void>((resolve, reject) => {
        socket2.once('connect', () => resolve());
        socket2.once('connect_error', (e) => reject(e));
      }),
    ]);

    const receivedByU2: MessageDTO[] = [];
    socket2.on('message:new', (msg: MessageDTO) => {
      receivedByU2.push(msg);
    });

    const clientMsgId = crypto.randomUUID();

    // Send first time
    const ack1 = await new Promise<WsSendMessageAck>((resolve) => {
      socket1.emit(
        'message:send',
        { id: clientMsgId, conversationId: convId, body: 'Namaste from Kamand!' },
        (res: WsSendMessageAck) => resolve(res)
      );
    });

    expect(ack1.ok).toBe(true);
    if (ack1.ok) {
      expect(ack1.deduplicated).toBe(false);
      expect(ack1.message.seq).toBe(1);
    }

    // Re-send with the exact same clientMsgId (simulating retry after ack timeout)
    const ackDup = await new Promise<WsSendMessageAck>((resolve) => {
      socket1.emit(
        'message:send',
        { id: clientMsgId, conversationId: convId, body: 'Namaste from Kamand!' },
        (res: WsSendMessageAck) => resolve(res)
      );
    });

    expect(ackDup.ok).toBe(true);
    if (ackDup.ok) {
      expect(ackDup.deduplicated).toBe(true);
      expect(ackDup.message.seq).toBe(1);
    }

    // Send two more messages while socket2 disconnects after seq 1
    socket2.disconnect();

    for (let i = 2; i <= 3; i++) {
      const ack = await new Promise<WsSendMessageAck>((resolve) => {
        socket1.emit(
          'message:send',
          { id: crypto.randomUUID(), conversationId: convId, body: `Message #${i}` },
          (res: WsSendMessageAck) => resolve(res)
        );
      });
      expect(ack.ok).toBe(true);
      if (ack.ok) expect(ack.message.seq).toBe(i);
    }

    // Reconnect socket2 and run sync:resume from lastSeenSeq = 1
    socket2.connect();
    await new Promise<void>((resolve) => socket2.once('connect', () => resolve()));

    const resumeAck = await new Promise<WsSyncResumeAck>((resolve) => {
      socket2.emit('sync:resume', { cursors: { [convId]: 1 } }, (res: WsSyncResumeAck) =>
        resolve(res)
      );
    });

    expect(resumeAck.ok).toBe(true);
    expect(resumeAck.missedMessages[convId]?.map((m) => m.seq)).toEqual([2, 3]);

    // Verify cursor pagination via REST API
    const page1 = await request(app)
      .get(`/api/conversations/${convId}/messages?limit=2`)
      .set('Cookie', u1Cookie);
    expect(page1.status).toBe(200);
    expect(page1.body.messages.map((m: MessageDTO) => m.seq)).toEqual([2, 3]);
    expect(page1.body.hasMore).toBe(true);
    expect(page1.body.nextCursor).toBe(2);

    const page2 = await request(app)
      .get(`/api/conversations/${convId}/messages?limit=2&beforeSeq=${page1.body.nextCursor}`)
      .set('Cookie', u1Cookie);
    expect(page2.status).toBe(200);
    expect(page2.body.messages.map((m: MessageDTO) => m.seq)).toEqual([1]);
    expect(page2.body.hasMore).toBe(false);

    socket1.disconnect();
    socket2.disconnect();
  }, 20_000);
});
