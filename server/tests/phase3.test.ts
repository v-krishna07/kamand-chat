import http from 'node:http';
import crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachSocketServer, closeSocketServer } from '../src/ws/socketServer.js';
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
    roomCode: 'B-19',
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
  await prisma.callLog.deleteMany();
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
  await prisma.faceChallenge.deleteMany();
  await prisma.faceTemplate.deleteMany();
  await prisma.groupSenderKey.deleteMany();
  await prisma.device.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await closeSocketServer();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
});

describe('Phase 3 Verification Suite: Structured Grouping (Communities, Categories, Channels, Roles, Overrides, Invites, JoinRequests & Threads)', () => {
  it('1. Creates a Community with Categories and Channels, and persists drag-to-reorder positions for both', async () => {
    const owner = await registerTestUser('comm_owner');

    const createComm = await request(app)
      .post('/api/communities')
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({
        name: 'IIT Mandi',
        slug: 'iit-mandi',
        description: 'Campus community',
        isPrivate: false,
      });

    expect(createComm.status).toBe(201);
    const commId = createComm.body.community.id as string;
    const generalCatId = createComm.body.community.categories[0].id as string;

    // Create two more categories: "Clubs" and "Hostels"
    await request(app)
      .post(`/api/communities/${commId}/categories`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ name: 'Clubs' });

    const catRes = await request(app)
      .post(`/api/communities/${commId}/categories`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ name: 'Hostels' });

    const categories = catRes.body.community.categories as Array<{ id: string; name: string }>;
    expect(categories.map((c) => c.name)).toEqual(['General', 'Clubs', 'Hostels']);

    // Reorder categories so "Hostels" is first, "Clubs" second, "General" third
    const reversedCatIds = categories.map((c) => c.id).reverse();
    const reorderCatRes = await request(app)
      .put(`/api/communities/${commId}/categories/reorder`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ orderedCategoryIds: reversedCatIds });

    expect(reorderCatRes.status).toBe(200);
    expect(
      reorderCatRes.body.community.categories.map((c: { name: string }) => c.name)
    ).toEqual(['Hostels', 'Clubs', 'General']);

    // Create a second channel inside General category and reorder channels
    const chRes = await request(app)
      .post(`/api/communities/${commId}/channels`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({
        categoryId: generalCatId,
        name: 'random-chat',
        topic: 'Random campus banter',
        type: 'text',
      });
    expect(chRes.status).toBe(201);

    const generalCat = chRes.body.community.categories.find(
      (c: { id: string }) => c.id === generalCatId
    );
    const channelIds = generalCat.channels.map((ch: { id: string }) => ch.id).reverse();

    const reorderChRes = await request(app)
      .put(`/api/communities/${commId}/channels/reorder`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ categoryId: generalCatId, orderedChannelIds: channelIds });

    expect(reorderChRes.status).toBe(200);
    const updatedGeneralCat = reorderChRes.body.community.categories.find(
      (c: { id: string }) => c.id === generalCatId
    );
    expect(updatedGeneralCat.channels.map((ch: { name: string }) => ch.name)).toEqual([
      'random-chat',
      'general',
    ]);
  });

  it('2. Enforces Invite Links (maxUses & expiry) and Join Request approval workflow', async () => {
    const owner = await registerTestUser('owner2');
    const joiner1 = await registerTestUser('joiner1');
    const joiner2 = await registerTestUser('joiner2');
    const applicant = await registerTestUser('applicant');

    const createComm = await request(app)
      .post('/api/communities')
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({
        name: 'Kamand Robotics',
        slug: 'kamand-robotics',
        isPrivate: true,
      });
    const commId = createComm.body.community.id as string;

    // Create an invite link with maxUses = 1
    const invRes = await request(app)
      .post(`/api/communities/${commId}/invites`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ expiresInHours: 24, maxUses: 1 });
    expect(invRes.status).toBe(201);
    const code = invRes.body.invite.code as string;

    // joiner1 uses the invite -> succeeds (200)
    const j1Res = await request(app)
      .post(`/api/communities/join/${code}`)
      .set('Cookie', joiner1.cookie)
      .set('X-CSRF-Token', joiner1.csrfToken);
    expect(j1Res.status).toBe(200);
    expect(j1Res.body.community.myRole).toBe('member');

    // joiner2 tries to use the same maxUses=1 invite -> 410 Gone
    const j2Res = await request(app)
      .post(`/api/communities/join/${code}`)
      .set('Cookie', joiner2.cookie)
      .set('X-CSRF-Token', joiner2.csrfToken);
    expect(j2Res.status).toBe(410);

    // applicant submits a join request -> owner approves -> applicant becomes member
    const reqJoin = await request(app)
      .post(`/api/communities/${commId}/join-requests`)
      .set('Cookie', applicant.cookie)
      .set('X-CSRF-Token', applicant.csrfToken)
      .send({ note: 'B26 EE student interested in drones' });
    expect(reqJoin.status).toBe(201);
    const requestId = reqJoin.body.joinRequest.id as string;

    const approveRes = await request(app)
      .post(`/api/communities/join-requests/${requestId}/respond`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ action: 'approve' });
    expect(approveRes.status).toBe(200);

    const listRes = await request(app)
      .get('/api/communities')
      .set('Cookie', applicant.cookie);
    const joinedComm = listRes.body.communities.find((c: { id: string }) => c.id === commId);
    expect(joinedComm.myRole).toBe('member');
  });

  it('3. Enforces announcement-only channels, readonly role, per-channel permission overrides, and threaded replies over WebSockets', async () => {
    const owner = await registerTestUser('owner3');
    const member = await registerTestUser('member3');

    const createComm = await request(app)
      .post('/api/communities')
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({
        name: 'SNTC IIT Mandi',
        slug: 'sntc',
        isPrivate: false,
      });
    const commId = createComm.body.community.id as string;
    const catId = createComm.body.community.categories[0].id as string;
    const generalChannel = createComm.body.community.categories[0].channels[0];

    // Add member via invite
    const invRes = await request(app)
      .post(`/api/communities/${commId}/invites`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ expiresInHours: 24 });
    await request(app)
      .post(`/api/communities/join/${invRes.body.invite.code}`)
      .set('Cookie', member.cookie)
      .set('X-CSRF-Token', member.csrfToken);

    // Owner creates an announcement-only channel
    const annRes = await request(app)
      .post(`/api/communities/${commId}/channels`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({
        categoryId: catId,
        name: 'notices',
        topic: 'Official notices only',
        type: 'announcement',
      });
    const noticesChannel = annRes.body.community.categories[0].channels.find(
      (c: { name: string }) => c.name === 'notices'
    );

    const ownerSocket: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: owner.cookie },
      transports: ['websocket'],
    });
    const memberSocket: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: member.cookie },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((r) => ownerSocket.on('connect', () => r())),
      new Promise<void>((r) => memberSocket.on('connect', () => r())),
    ]);

    // 1. Member attempts to post in announcement-only channel -> FORBIDDEN
    const memberAnnAck = await new Promise<WsSendMessageAck>((resolve) => {
      memberSocket.emit(
        'message:send',
        {
          id: crypto.randomUUID(),
          conversationId: noticesChannel.conversationId,
          body: 'Can a regular member post here?',
        },
        (res: WsSendMessageAck) => resolve(res)
      );
    });
    expect(memberAnnAck.ok).toBe(false);
    if (!memberAnnAck.ok) expect(memberAnnAck.code).toBe('FORBIDDEN');

    // 2. Owner posts in announcement-only channel -> OK
    const ownerAnnAck = await new Promise<WsSendMessageAck>((resolve) => {
      ownerSocket.emit(
        'message:send',
        {
          id: crypto.randomUUID(),
          conversationId: noticesChannel.conversationId,
          body: 'Official Hackathon Deadline at 10 AM',
        },
        (res: WsSendMessageAck) => resolve(res)
      );
    });
    expect(ownerAnnAck.ok).toBe(true);

    // 3. Threaded reply in #general: Owner posts root message, Member posts threaded reply
    const rootMsgId = crypto.randomUUID();
    const rootAck = await new Promise<WsSendMessageAck>((resolve) => {
      ownerSocket.emit(
        'message:send',
        {
          id: rootMsgId,
          conversationId: generalChannel.conversationId,
          body: 'Thread Root: Post your questions here',
        },
        (res: WsSendMessageAck) => resolve(res)
      );
    });
    expect(rootAck.ok).toBe(true);

    const threadReplyAck = await new Promise<WsSendMessageAck>((resolve) => {
      memberSocket.emit(
        'message:send',
        {
          id: crypto.randomUUID(),
          conversationId: generalChannel.conversationId,
          body: 'First threaded reply from member!',
          threadRootId: rootMsgId,
        },
        (res: WsSendMessageAck) => resolve(res)
      );
    });
    expect(threadReplyAck.ok).toBe(true);

    // Fetch thread via REST API
    const threadRes = await request(app)
      .get(`/api/communities/threads/${rootMsgId}`)
      .set('Cookie', member.cookie);
    expect(threadRes.status).toBe(200);
    expect(threadRes.body.rootMessage.id).toBe(rootMsgId);
    expect(threadRes.body.rootMessage.threadReplyCount).toBe(1);
    expect(threadRes.body.replies).toHaveLength(1);
    expect(threadRes.body.replies[0].body).toBe('First threaded reply from member!');

    // 4. Owner applies a ChannelPermissionOverride blocking `member` role from sending in #general
    await request(app)
      .put(`/api/communities/channels/${generalChannel.id}/overrides`)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ role: 'member', canView: true, canSend: false });

    const blockedOverrideAck = await new Promise<WsSendMessageAck>((resolve) => {
      memberSocket.emit(
        'message:send',
        {
          id: crypto.randomUUID(),
          conversationId: generalChannel.conversationId,
          body: 'Should be blocked by channel override',
        },
        (res: WsSendMessageAck) => resolve(res)
      );
    });
    expect(blockedOverrideAck.ok).toBe(false);
    if (!blockedOverrideAck.ok) expect(blockedOverrideAck.code).toBe('FORBIDDEN');

    ownerSocket.disconnect();
    memberSocket.disconnect();
  });
});
