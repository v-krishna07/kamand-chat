import http from 'node:http';
import crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachSocketServer, closeSocketServer } from '../src/ws/socketServer.js';
import { prisma } from '../src/db.js';
import { authRateLimiter } from '../src/security/rateLimit.js';
import type { WsSendMessageAck, WsTypingUpdateEvent } from '@kamand/shared';

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

async function registerTestUser(username: string, roomCode = 'C-10') {
  const res = await request(app).post('/api/auth/register').send({
    username,
    email: `${username}@students.iitmandi.ac.in`,
    displayName: username.toUpperCase(),
    password: 'Password123',
    roomCode,
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

describe('Phase 2 Verification Suite: Social Layer (Contacts, QR, Blocking, Room Privacy, Typing, ReadReceipts & 24h Status)', () => {
  it('1. Keeps "My room: C-10" private by default from non-contacts, and reveals it once contact request is accepted', async () => {
    const alice = await registerTestUser('alice', 'C-10');
    const bob = await registerTestUser('bob', 'B-19');

    // Before becoming contacts, Bob searches for Alice -> Alice's roomCode must be null
    const searchBefore = await request(app)
      .get('/api/users/search?q=alice')
      .set('Cookie', bob.cookie);
    expect(searchBefore.status).toBe(200);
    expect(searchBefore.body.users[0].username).toBe('alice');
    expect(searchBefore.body.users[0].roomCode).toBeNull();

    // Bob views Alice's profile -> roomCode is null
    const profileBefore = await request(app)
      .get(`/api/profile/${alice.user.id}`)
      .set('Cookie', bob.cookie);
    expect(profileBefore.status).toBe(200);
    expect(profileBefore.body.user.roomCode).toBeNull();
    expect(profileBefore.body.isAcceptedContact).toBe(false);

    // Bob sends contact request via Alice's QR payload
    const qrPayload = `kamand://contact/${alice.user.id}:alice`;
    const reqRes = await request(app)
      .post('/api/contacts/request')
      .set('Cookie', bob.cookie)
      .set('X-CSRF-Token', bob.csrfToken)
      .send({ identifier: qrPayload });
    expect(reqRes.status).toBe(201);
    const contactId = reqRes.body.contact.id as string;

    // Bob cannot accept his own outgoing request (must be 403)
    const selfAccept = await request(app)
      .post(`/api/contacts/${contactId}/respond`)
      .set('Cookie', bob.cookie)
      .set('X-CSRF-Token', bob.csrfToken)
      .send({ action: 'accept' });
    expect(selfAccept.status).toBe(403);

    // Alice accepts Bob's request
    const acceptRes = await request(app)
      .post(`/api/contacts/${contactId}/respond`)
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({ action: 'accept' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.contact.status).toBe('accepted');

    // Now Bob can see Alice's private roomCode ("C-10")
    const profileAfter = await request(app)
      .get(`/api/profile/${alice.user.id}`)
      .set('Cookie', bob.cookie);
    expect(profileAfter.status).toBe(200);
    expect(profileAfter.body.user.roomCode).toBe('C-10');
    expect(profileAfter.body.isAcceptedContact).toBe(true);
  });

  it('2. Allows updating profile (displayName, bio, roomCode, isRoomPrivate)', async () => {
    const alice = await registerTestUser('alice_prof', 'A-12');

    const patchRes = await request(app)
      .patch('/api/profile/me')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({
        displayName: 'Alice IITM',
        bio: 'Robotics & Embedded Systems',
        roomCode: 'b-22',
        isRoomPrivate: false,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.user.displayName).toBe('Alice IITM');
    expect(patchRes.body.user.bio).toBe('Robotics & Embedded Systems');
    expect(patchRes.body.user.roomCode).toBe('B-22');
    expect(patchRes.body.user.isRoomPrivate).toBe(false);
  });

  it('3. Blocking a user blocks contact requests, 1:1 conversation creation, and real-time WebSocket messages', async () => {
    const u1 = await registerTestUser('blocker', 'A-10');
    const u2 = await registerTestUser('blocked', 'B-10');

    // Create a 1:1 conversation first while unblocked
    const convRes = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', u1.cookie)
      .set('X-CSRF-Token', u1.csrfToken)
      .send({ targetUserId: u2.user.id });
    expect(convRes.status).toBe(201);
    const convId = convRes.body.conversation.id as string;

    // u1 blocks u2
    const blockRes = await request(app)
      .post('/api/contacts/block')
      .set('Cookie', u1.cookie)
      .set('X-CSRF-Token', u1.csrfToken)
      .send({ targetUserId: u2.user.id });
    expect(blockRes.status).toBe(200);

    // u2 tries to send a contact request to u1 -> 403 Forbidden
    const contactAttempt = await request(app)
      .post('/api/contacts/request')
      .set('Cookie', u2.cookie)
      .set('X-CSRF-Token', u2.csrfToken)
      .send({ identifier: 'blocker' });
    expect(contactAttempt.status).toBe(403);

    // u2 tries to initiate a direct conversation with u1 -> 403 Forbidden
    const convAttempt = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', u2.cookie)
      .set('X-CSRF-Token', u2.csrfToken)
      .send({ targetUserId: u1.user.id });
    expect(convAttempt.status).toBe(403);

    // u2 tries to send a WebSocket message in the existing conversation -> FORBIDDEN ack
    const socket2: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u2.cookie },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve) => socket2.on('connect', () => resolve()));

    const sendAck = await new Promise<WsSendMessageAck>((resolve) => {
      socket2.emit(
        'message:send',
        { id: crypto.randomUUID(), conversationId: convId, body: 'Should be blocked' },
        (res: WsSendMessageAck) => resolve(res)
      );
    });
    expect(sendAck.ok).toBe(false);
    if (!sendAck.ok) {
      expect(sendAck.code).toBe('FORBIDDEN');
    }

    // u1 unblocks u2 -> messaging works again
    const unblockRes = await request(app)
      .delete(`/api/contacts/block/${u2.user.id}`)
      .set('Cookie', u1.cookie)
      .set('X-CSRF-Token', u1.csrfToken);
    expect(unblockRes.status).toBe(200);

    const sendAfterUnblock = await new Promise<WsSendMessageAck>((resolve) => {
      socket2.emit(
        'message:send',
        { id: crypto.randomUUID(), conversationId: convId, body: 'Unblocked message!' },
        (res: WsSendMessageAck) => resolve(res)
      );
    });
    expect(sendAfterUnblock.ok).toBe(true);

    socket2.disconnect();
  });

  it('4. Broadcasts real-time typing indicators and records ReadReceipt entries in Prisma', async () => {
    const u1 = await registerTestUser('typer1');
    const u2 = await registerTestUser('typer2');

    const convRes = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', u1.cookie)
      .set('X-CSRF-Token', u1.csrfToken)
      .send({ targetUserId: u2.user.id });
    const convId = convRes.body.conversation.id as string;

    const socket1: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u1.cookie },
      transports: ['websocket'],
    });
    const socket2: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: u2.cookie },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve) => socket1.on('connect', () => resolve())),
      new Promise<void>((resolve) => socket2.on('connect', () => resolve())),
    ]);

    const typingPromise = new Promise<WsTypingUpdateEvent>((resolve) => {
      socket2.on('typing:update', (ev: WsTypingUpdateEvent) => resolve(ev));
    });

    socket1.emit('typing:set', { conversationId: convId, isTyping: true });
    const typingEv = await typingPromise;
    expect(typingEv.conversationId).toBe(convId);
    expect(typingEv.userId).toBe(u1.user.id);
    expect(typingEv.isTyping).toBe(true);

    // Send a message from u1 and mark read from u2 -> verify ReadReceipt row in DB
    const msgId = crypto.randomUUID();
    await new Promise<WsSendMessageAck>((resolve) => {
      socket1.emit(
        'message:send',
        { id: msgId, conversationId: convId, body: 'Testing ReadReceipt table' },
        (res: WsSendMessageAck) => resolve(res)
      );
    });

    const readEventPromise = new Promise<{ conversationId: string; readerId: string; upToSeq: number }>(
      (resolve) => {
        socket1.on('conversation:read', (ev) => resolve(ev));
      }
    );

    socket2.emit('message:read', { conversationId: convId, seq: 1 });
    const readEv = await readEventPromise;
    expect(readEv.readerId).toBe(u2.user.id);
    expect(readEv.upToSeq).toBe(1);

    const receipt = await prisma.readReceipt.findUnique({
      where: { messageId_userId: { messageId: msgId, userId: u2.user.id } },
    });
    expect(receipt).not.toBeNull();

    socket1.disconnect();
    socket2.disconnect();
  });

  it('5. Enforces 24h Status expiration, per-contact custom visibility, and records StatusView receipts', async () => {
    const author = await registerTestUser('author');
    const friend1 = await registerTestUser('friend1');
    const friend2 = await registerTestUser('friend2');
    const stranger = await registerTestUser('stranger');

    // Make friend1 and friend2 accepted contacts of author
    await prisma.contact.createMany({
      data: [
        { requesterId: author.user.id, targetId: friend1.user.id, status: 'accepted' },
        { requesterId: author.user.id, targetId: friend2.user.id, status: 'accepted' },
      ],
    });

    // Author posts a custom-visibility status shared ONLY with friend1
    const createRes = await request(app)
      .post('/api/statuses')
      .set('Cookie', author.cookie)
      .set('X-CSRF-Token', author.csrfToken)
      .send({
        caption: 'Secret meetup at B-19 roof!',
        bgColor: '#0284c7',
        visibility: 'custom',
        allowedUserIds: [friend1.user.id],
      });
    expect(createRes.status).toBe(201);
    const statusId = createRes.body.status.id as string;

    // Insert an already-expired status directly in DB to verify 24h filtering
    await prisma.status.create({
      data: {
        authorId: author.user.id,
        caption: 'Expired yesterday',
        bgColor: '#000000',
        visibility: 'contacts',
        expiresAt: new Date(Date.now() - 3600_000),
      },
    });

    // friend1 fetches statuses -> sees the custom status, does NOT see the expired one
    const f1List = await request(app).get('/api/statuses').set('Cookie', friend1.cookie);
    expect(f1List.status).toBe(200);
    expect(f1List.body.statuses).toHaveLength(1);
    expect(f1List.body.statuses[0].id).toBe(statusId);
    expect(f1List.body.statuses[0].hasViewed).toBe(false);

    // friend2 fetches statuses -> excluded by custom visibility
    const f2List = await request(app).get('/api/statuses').set('Cookie', friend2.cookie);
    expect(f2List.status).toBe(200);
    expect(f2List.body.statuses).toHaveLength(0);

    // stranger tries to record a view on statusId -> 403 Forbidden
    const strangerView = await request(app)
      .post(`/api/statuses/${statusId}/view`)
      .set('Cookie', stranger.cookie)
      .set('X-CSRF-Token', stranger.csrfToken);
    expect(strangerView.status).toBe(403);

    // friend1 views statusId -> 200 OK
    const f1View = await request(app)
      .post(`/api/statuses/${statusId}/view`)
      .set('Cookie', friend1.cookie)
      .set('X-CSRF-Token', friend1.csrfToken);
    expect(f1View.status).toBe(200);

    // Author fetches statuses -> sees viewCount = 1 and friend1 in views receipt array
    const authorList = await request(app).get('/api/statuses').set('Cookie', author.cookie);
    expect(authorList.status).toBe(200);
    const ownStatus = authorList.body.statuses.find((s: { id: string }) => s.id === statusId);
    expect(ownStatus.viewCount).toBe(1);
    expect(ownStatus.views[0].viewer.username).toBe('friend1');
  });
});
