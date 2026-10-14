import http from 'node:http';
import crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachSocketServer, closeSocketServer } from '../src/ws/socketServer.js';
import { prisma } from '../src/db.js';
import { authRateLimiter } from '../src/security/rateLimit.js';
import { stripJpegExif, detectMimeByMagicBytes } from '../src/security/fileSafety.js';
import { isPrivateOrReservedIp, validateUrlAgainstSsrf } from '../src/security/ssrf.js';
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

async function registerTestUser(username: string, role = 'member') {
  const res = await request(app).post('/api/auth/register').send({
    username,
    email: `${username}@students.iitmandi.ac.in`,
    displayName: username.toUpperCase(),
    password: 'Password123',
  });
  if (role !== 'member') {
    await prisma.user.update({ where: { id: res.body.user.id }, data: { role } });
  }
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
  await prisma.readReceipt.deleteMany();
  await prisma.message.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await closeSocketServer();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
});

describe('Phase 9 Verification Suite: Admin Dashboard, Moderation Queue, File Safety, SSRF & Rich Chat Actions', () => {
  it('1. Enforces File Safety: magic-byte validation, blocking executables/scripts, EXIF stripping, and attachment authorization check', async () => {
    // 1.1 Magic-byte checks
    const peExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // "MZ"
    expect(detectMimeByMagicBytes(peExe).safe).toBe(false);

    const elfExe = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // "\x7FELF"
    expect(detectMimeByMagicBytes(elfExe).safe).toBe(false);

    const shebang = Buffer.from('#!/bin/bash\nrm -rf /');
    expect(detectMimeByMagicBytes(shebang).safe).toBe(false);

    const fakePng = Buffer.from('not a real png image at all');
    expect(detectMimeByMagicBytes(fakePng).safe).toBe(false);

    // Valid PNG signature
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectMimeByMagicBytes(validPng).safe).toBe(true);
    expect(detectMimeByMagicBytes(validPng).detectedMime).toBe('image/png');

    // 1.2 EXIF Stripping on JPEG
    // SOI (FF D8) + APP1 EXIF (FF E1 00 08 45 78 69 66) + SOS (FF DA) + image data + EOI (FF D9)
    const jpegWithExif = Buffer.from([
      0xff, 0xd8, // SOI
      0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, // APP1 marker with length 6
      0xff, 0xda, 0x12, 0x34, // SOS + compressed data
      0xff, 0xd9, // EOI
    ]);
    const stripped = stripJpegExif(jpegWithExif);
    // Verified that APP1 marker is stripped
    expect(stripped.includes(Buffer.from([0xff, 0xe1]))).toBe(false);

    // 1.3 Upload endpoint with unauthorized user / valid user
    const alice = await registerTestUser('alice_fs');
    const bob = await registerTestUser('bob_fs');
    const eve = await registerTestUser('eve_fs');

    // Reject executable extension or contents
    const badUpload = await request(app)
      .post('/api/media/upload')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({
        fileName: 'malicious.exe',
        mimeType: 'application/octet-stream',
        base64Data: peExe.toString('base64'),
      });
    expect(badUpload.status).toBe(400);

    // Accept valid PNG attachment
    const goodUpload = await request(app)
      .post('/api/media/upload')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({
        fileName: 'campus-photo.png',
        mimeType: 'image/png',
        base64Data: validPng.toString('base64'),
      });
    expect(goodUpload.status).toBe(201);
    const attachmentId = goodUpload.body.attachment.id as string;
    expect(attachmentId).toBeDefined();

    // Create 1:1 conversation between Alice & Bob and attach the media to a message
    const convRes = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({ targetUserId: bob.user.id });
    const convId = convRes.body.conversation.id as string;

    await prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        conversationId: convId,
        senderId: alice.user.id,
        body: 'Check this campus photo',
        seq: 1,
        attachmentId,
      },
    });

    // Alice (uploader) and Bob (conversation member) can access media
    const aliceFetch = await request(app)
      .get(`/api/media/${attachmentId}`)
      .set('Cookie', alice.cookie);
    expect(aliceFetch.status).toBe(200);

    const bobFetch = await request(app)
      .get(`/api/media/${attachmentId}`)
      .set('Cookie', bob.cookie);
    expect(bobFetch.status).toBe(200);

    // Eve (non-member) is rejected with 403 Forbidden (§14 & §16.4)
    const eveFetch = await request(app)
      .get(`/api/media/${attachmentId}`)
      .set('Cookie', eve.cookie);
    expect(eveFetch.status).toBe(403);
  });

  it('2. Enforces SSRF Protection: blocks private/loopback/cloud-metadata IPs, localhost hostnames, and validates link preview safety', async () => {
    // 2.1 Private IP detection checks
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.5')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true); // AWS/GCP metadata
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false); // Public DNS

    // 2.2 SSRF URL validation
    const localRes = await validateUrlAgainstSsrf('http://localhost:8080/admin');
    expect(localRes.safe).toBe(false);

    const internalRes = await validateUrlAgainstSsrf('http://metadata.internal/secrets');
    expect(internalRes.safe).toBe(false);

    const metaRes = await validateUrlAgainstSsrf('http://169.254.169.254/latest/meta-data/');
    expect(metaRes.safe).toBe(false);

    const user = await registerTestUser('ssrf_user');
    const blockedApi = await request(app)
      .post('/api/media/link-preview')
      .set('Cookie', user.cookie)
      .set('X-CSRF-Token', user.csrfToken)
      .send({ url: 'http://127.0.0.1:3000/internal-status' });
    expect(blockedApi.status).toBe(403);
  });

  it('3. Supports Rich Message Actions: emoji reactions toggle, 15-minute edit window, delete for me vs for everyone, and pin/star', async () => {
    const alice = await registerTestUser('alice_rich');
    const bob = await registerTestUser('bob_rich');

    const convRes = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({ targetUserId: bob.user.id });
    const convId = convRes.body.conversation.id as string;

    const aliceSocket: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: alice.cookie },
      transports: ['websocket'],
    });
    const bobSocket: ClientSocket = createClientSocket(serverUrl, {
      extraHeaders: { Cookie: bob.cookie },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((r) => aliceSocket.on('connect', () => r())),
      new Promise<void>((r) => bobSocket.on('connect', () => r())),
    ]);

    const msgId = crypto.randomUUID();
    const sendAck = await new Promise<WsSendMessageAck>((resolve) => {
      aliceSocket.emit(
        'message:send',
        { id: msgId, conversationId: convId, body: 'Hello IIT Mandi!' },
        (res: WsSendMessageAck) => resolve(res)
      );
    });
    expect(sendAck.ok).toBe(true);

    // 3.1 Reaction Toggle
    const reactPromise = new Promise<{ messageId: string; reactions: Array<{ emoji: string }> }>(
      (resolve) => {
        bobSocket.on('message:updated', (ev) => {
          if (ev.reactions) resolve(ev);
        });
      }
    );

    const reactAck = await new Promise<{ ok: boolean; reactions?: Array<{ emoji: string }> }>(
      (resolve) => {
        bobSocket.emit(
          'message:react',
          { conversationId: convId, messageId: msgId, emoji: '❤️' },
          (res: { ok: boolean }) => resolve(res)
        );
      }
    );
    expect(reactAck.ok).toBe(true);
    const updatedEv = await reactPromise;
    expect(updatedEv.reactions.some((r) => r.emoji === '❤️')).toBe(true);

    // 3.2 Edit Message within 15-Minute Window
    const editAck = await new Promise<{ ok: boolean; message?: { body: string } }>((resolve) => {
      aliceSocket.emit(
        'message:edit',
        { conversationId: convId, messageId: msgId, newBody: 'Hello IIT Mandi! (Updated)' },
        (res: { ok: boolean; message?: { body: string } }) => resolve(res)
      );
    });
    expect(editAck.ok).toBe(true);
    expect(editAck.message?.body).toBe('Hello IIT Mandi! (Updated)');

    // Non-sender (Bob) cannot edit Alice's message
    const bobEditAck = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      bobSocket.emit(
        'message:edit',
        { conversationId: convId, messageId: msgId, newBody: 'Bob hacked this' },
        (res: { ok: boolean; error?: string }) => resolve(res)
      );
    });
    expect(bobEditAck.ok).toBe(false);

    // 3.3 Pin & Star
    const pinAck = await new Promise<{ ok: boolean; isPinned?: boolean }>((resolve) => {
      aliceSocket.emit(
        'message:pin-star',
        { conversationId: convId, messageId: msgId, action: 'pin' },
        (res: { ok: boolean }) => resolve(res)
      );
    });
    expect(pinAck.ok).toBe(true);
    expect(pinAck.isPinned).toBe(true);

    const starAck = await new Promise<{ ok: boolean; isStarred?: boolean }>((resolve) => {
      bobSocket.emit(
        'message:pin-star',
        { conversationId: convId, messageId: msgId, action: 'star' },
        (res: { ok: boolean }) => resolve(res)
      );
    });
    expect(starAck.ok).toBe(true);
    expect(starAck.isStarred).toBe(true);

    // 3.4 Delete For Me vs Delete For Everyone
    // Create another message for Alice to delete for me
    const msg2Id = crypto.randomUUID();
    await new Promise<WsSendMessageAck>((resolve) => {
      aliceSocket.emit(
        'message:send',
        { id: msg2Id, conversationId: convId, body: 'Message to delete for me' },
        (res: WsSendMessageAck) => resolve(res)
      );
    });

    const deleteForMeAck = await new Promise<{ ok: boolean }>((resolve) => {
      aliceSocket.emit(
        'message:delete',
        { conversationId: convId, messageId: msg2Id, mode: 'for_me' },
        (res: { ok: boolean }) => resolve(res)
      );
    });
    expect(deleteForMeAck.ok).toBe(true);

    // Alice queries messages -> msg2Id is filtered out
    const aliceMsgs = await request(app)
      .get(`/api/conversations/${convId}/messages`)
      .set('Cookie', alice.cookie);
    expect(aliceMsgs.body.messages.some((m: { id: string }) => m.id === msg2Id)).toBe(false);

    // Bob queries messages -> msg2Id is still visible to Bob
    const bobMsgs = await request(app)
      .get(`/api/conversations/${convId}/messages`)
      .set('Cookie', bob.cookie);
    expect(bobMsgs.body.messages.some((m: { id: string }) => m.id === msg2Id)).toBe(true);

    // Delete for everyone on msgId
    const deleteForEveryoneAck = await new Promise<{ ok: boolean }>((resolve) => {
      aliceSocket.emit(
        'message:delete',
        { conversationId: convId, messageId: msgId, mode: 'for_everyone' },
        (res: { ok: boolean }) => resolve(res)
      );
    });
    expect(deleteForEveryoneAck.ok).toBe(true);

    // In DB and for both users, body is now 'This message was deleted'
    const dbDeleted = await prisma.message.findUnique({ where: { id: msgId } });
    expect(dbDeleted?.body).toBe('This message was deleted');
    expect(dbDeleted?.deletedAt).not.toBeNull();

    aliceSocket.disconnect();
    bobSocket.disconnect();
  });

  it('4. Enforces Moderation Queue, Zero-Knowledge Invariant, User Suspension & Session Revocation', async () => {
    const student = await registerTestUser('abusive_user', 'member');
    const reporter = await registerTestUser('reporter_user', 'member');
    const admin = await registerTestUser('campus_admin', 'admin');

    // 4.1 Regular member cannot access admin endpoints
    const forbiddenOverview = await request(app)
      .get('/api/admin/overview')
      .set('Cookie', reporter.cookie);
    expect(forbiddenOverview.status).toBe(403);

    // 4.2 Reporter submits a report with voluntarily attached message snapshots
    const reportRes = await request(app)
      .post('/api/admin/reports')
      .set('Cookie', reporter.cookie)
      .set('X-CSRF-Token', reporter.csrfToken)
      .send({
        targetUserId: student.user.id,
        reason: 'Repeated harassment and spam',
        voluntarilyAttachedMessages: [
          { senderName: 'abusive_user', body: 'Harassing message snapshot 1' },
          { senderName: 'abusive_user', body: 'Harassing message snapshot 2' },
        ],
      });
    expect(reportRes.status).toBe(201);
    const reportId = reportRes.body.report.id as string;
    expect(reportRes.body.report.status).toBe('open');

    // 4.3 Admin views moderation queue and system overview
    const adminReports = await request(app)
      .get('/api/admin/reports')
      .set('Cookie', admin.cookie);
    expect(adminReports.status).toBe(200);
    expect(adminReports.body.reports.some((r: { id: string }) => r.id === reportId)).toBe(true);

    const adminOverview = await request(app)
      .get('/api/admin/overview')
      .set('Cookie', admin.cookie);
    expect(adminOverview.status).toBe(200);
    expect(adminOverview.body.stats.e2eeContentReadableByAdmin).toBe(false); // Hard Invariant Guarantee (§5)
    expect(adminOverview.body.stats.openReportsCount).toBeGreaterThanOrEqual(1);

    // 4.4 Admin resolves report and suspends the target user
    const resolveRes = await request(app)
      .post(`/api/admin/reports/${reportId}/resolve`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        status: 'resolved',
        resolutionNote: 'Reviewed by administrator; user suspended for policy violations',
        suspendTargetUser: true,
      });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.report.status).toBe('resolved');

    // 4.5 Verify suspended user cannot use their session anymore
    const studentMe = await request(app)
      .get('/api/auth/me')
      .set('Cookie', student.cookie);
    expect(studentMe.status).toBe(401);

    // Suspended user cannot log in again
    const loginAttempt = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'abusive_user', password: 'Password123' });
    expect(loginAttempt.status).toBe(403);
  });
});
