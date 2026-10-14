import http from 'node:http';
import crypto from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachSocketServer, closeSocketServer } from '../src/ws/socketServer.js';
import { prisma } from '../src/db.js';
import { config } from '../src/config.js';
import { authRateLimiter } from '../src/security/rateLimit.js';
import { computeKeyFingerprint } from '../src/routes/keys.js';
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

describe('Phase 4 Verification Suite: Security & E2EE (Device Keys, Safety Numbers, Google OAuth, Face Authentication & Zero-Plaintext Storage)', () => {
  it('1. Registers Device E2EE Identity Keys, calculates Safety Number fingerprints, and manages PIN-wrapped private key backups', async () => {
    const user = await registerTestUser('e2ee_user');

    const identityPubKey = 'sample-ecdh-p256-public-key-user-1-abcdef123456';
    const signingPubKey = 'sample-ecdsa-p256-public-key-user-1-abcdef123456';

    const regRes = await request(app)
      .post('/api/keys/devices')
      .set('Cookie', user.cookie)
      .set('X-CSRF-Token', user.csrfToken)
      .send({
        deviceName: 'MacBook Air M2',
        identityPublicKey: identityPubKey,
        signingPublicKey: signingPubKey,
        wrappedPrivateKeyBackup: 'base64-aes-gcm-wrapped-key-backup-bytes',
        backupSalt: 'base64-pbkdf2-salt',
        backupIv: 'base64-aes-iv',
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.device.deviceName).toBe('MacBook Air M2');
    expect(regRes.body.device.keyFingerprint).toBe(
      computeKeyFingerprint(identityPubKey, signingPubKey)
    );

    // Another user fetches user's public keys
    const peer = await registerTestUser('peer_user');
    const peerFetchRes = await request(app)
      .get(`/api/keys/users/${user.user.id}`)
      .set('Cookie', peer.cookie);

    expect(peerFetchRes.status).toBe(200);
    expect(peerFetchRes.body.devices).toHaveLength(1);
    expect(peerFetchRes.body.devices[0].keyFingerprint).toBe(
      regRes.body.device.keyFingerprint
    );

    // User retrieves their own PIN-wrapped key backup
    const backupRes = await request(app)
      .get('/api/keys/backup/me')
      .set('Cookie', user.cookie);

    expect(backupRes.status).toBe(200);
    expect(backupRes.body.backup.wrappedPrivateKeyBackup).toBe(
      'base64-aes-gcm-wrapped-key-backup-bytes'
    );
    expect(backupRes.body.backup.backupSalt).toBe('base64-pbkdf2-salt');
  });

  it('2. Enforces Google OAuth 2.0 Login, Institute Domain restrictions, Active Sessions list, and Session Revocation', async () => {
    // 1. Valid Google Login with IIT Mandi student domain
    const validToken = 'demo-google-token:b24101@students.iitmandi.ac.in:Aman Gupta:students.iitmandi.ac.in';
    const googleRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: validToken });

    expect(googleRes.status).toBe(200);
    expect(googleRes.body.user.email).toBe('b24101@students.iitmandi.ac.in');
    const cookie1 = extractSessionCookie(googleRes.headers['set-cookie']);
    const csrfToken1 = googleRes.body.csrfToken as string;

    // 2. Reject Google Login when domain enforcement fails
    config.enforceInstituteDomain = true;
    const invalidDomainToken = 'demo-google-token:intruder@gmail.com:Intruder:gmail.com';
    const invalidRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: invalidDomainToken });

    expect(invalidRes.status).toBe(401);
    config.enforceInstituteDomain = false;

    // 3. User establishes a second session (e.g. from mobile)
    const secondLogin = await request(app)
      .post('/api/auth/google')
      .send({ idToken: validToken });
    expect(secondLogin.status).toBe(200);
    const cookie2 = extractSessionCookie(secondLogin.headers['set-cookie']);

    // 4. List sessions
    const sessionsRes = await request(app)
      .get('/api/auth/sessions')
      .set('Cookie', cookie2);
    expect(sessionsRes.status).toBe(200);
    expect(sessionsRes.body.sessions.length).toBeGreaterThanOrEqual(2);
    const currentSession = sessionsRes.body.sessions.find(
      (s: { isCurrent: boolean }) => s.isCurrent
    );
    expect(currentSession).toBeDefined();

    // 5. Revoke other sessions
    const revokeRes = await request(app)
      .post('/api/auth/sessions/revoke-others')
      .set('Cookie', cookie2)
      .set('X-CSRF-Token', secondLogin.body.csrfToken);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.revokedCount).toBeGreaterThanOrEqual(1);

    // Verify session 1 is now invalid
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie1);
    expect(meRes.status).toBe(401);

    // Verify session 2 remains active
    const meRes2 = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie2);
    expect(meRes2.status).toBe(200);
  });

  it('3. Enforces On-Device Face Recognition Login: raw image rejection, challenge freshness, embedding distance threshold, ECDSA signature check, and replay prevention', async () => {
    const user = await registerTestUser('face_user');
    const deviceId = crypto.randomUUID();

    // Generate test ECDSA P-256 keypair for signing challenge
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const spkiPublicKey = publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('base64');

    // 1. Reject raw image uploads
    const rawImageRes = await request(app)
      .post('/api/face/enroll')
      .set('Cookie', user.cookie)
      .set('X-CSRF-Token', user.csrfToken)
      .send({
        deviceId,
        deviceName: 'Test Phone',
        encryptedEmbedding: 'data:image/jpeg;base64,RAW_CAMERA_FRAME',
        embeddingIv: 'random-iv',
        faceSigningPublicKey: spkiPublicKey,
      });
    expect(rawImageRes.status).toBe(400);

    // 2. Successful enrollment of encrypted embedding + device signing key
    const enrollRes = await request(app)
      .post('/api/face/enroll')
      .set('Cookie', user.cookie)
      .set('X-CSRF-Token', user.csrfToken)
      .send({
        deviceId,
        deviceName: 'Test Phone',
        encryptedEmbedding: 'encrypted-base64-embedding-data',
        embeddingIv: 'valid-iv-base64',
        faceSigningPublicKey: spkiPublicKey,
      });
    expect(enrollRes.status).toBe(201);
    expect(enrollRes.body.ok).toBe(true);

    // 3. Request a single-use login challenge
    const challengeRes = await request(app)
      .post('/api/face/challenge')
      .send({
        identifier: 'face_user',
        deviceId,
      });
    expect(challengeRes.status).toBe(200);
    const { challengeId, challenge } = challengeRes.body;
    expect(challenge).toBeDefined();

    // 4. Reject verification if embedding distance is too high (> 0.48)
    const highDistRes = await request(app)
      .post('/api/face/verify')
      .send({
        challengeId,
        deviceId,
        livenessGesture: 'blink',
        embeddingDistance: 0.65, // Too distant
        signatureBase64: 'dummy-signature-exceeds-sixteen-chars',
      });
    expect(highDistRes.status).toBe(401);

    // 5. Valid verification with signed challenge: `${challenge}:${deviceId}:${livenessGesture}`
    const livenessGesture = 'blink';
    const payloadToSign = `${challenge}:${deviceId}:${livenessGesture}`;
    const validSignature = crypto
      .sign('sha256', Buffer.from(payloadToSign, 'utf8'), privateKey)
      .toString('base64');

    const verifyRes = await request(app)
      .post('/api/face/verify')
      .send({
        challengeId,
        deviceId,
        livenessGesture,
        embeddingDistance: 0.22, // Good match (< 0.48)
        signatureBase64: validSignature,
      });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.username).toBe('face_user');
    const faceCookie = extractSessionCookie(verifyRes.headers['set-cookie']);
    expect(faceCookie).toBeTruthy();

    // 6. Replay attack rejection (using the same challenge again fails)
    const replayRes = await request(app)
      .post('/api/face/verify')
      .send({
        challengeId,
        deviceId,
        livenessGesture,
        embeddingDistance: 0.22,
        signatureBase64: validSignature,
      });
    expect(replayRes.status).toBe(401);

    // 7. Privacy deletion: User deletes all face data
    const deleteRes = await request(app)
      .delete('/api/face')
      .set('Cookie', faceCookie)
      .set('X-CSRF-Token', verifyRes.body.csrfToken);
    expect(deleteRes.status).toBe(200);

    const statusAfterDelete = await request(app)
      .get('/api/face/status')
      .set('Cookie', faceCookie);
    expect(statusAfterDelete.body.templates).toHaveLength(0);
  });

  it('4. Enforces Zero-Plaintext storage in database when E2EE ciphertext is supplied, Group Sender Key distribution, and Sender Key rotation on member removal', async () => {
    const alice = await registerTestUser('alice');
    const bob = await registerTestUser('bob');

    // Create 1:1 conversation
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
    await new Promise<void>((r) => aliceSocket.on('connect', () => r()));

    const msgId = crypto.randomUUID();
    const e2eeAck = await new Promise<WsSendMessageAck>((resolve) => {
      aliceSocket.emit(
        'message:send',
        {
          id: msgId,
          conversationId: convId,
          body: 'This plaintext should NOT be in the DB',
          ciphertext: 'AQIDBAUG-CIPHERTEXT-AES-GCM-256',
          nonce: '123456789012',
          type: 'text',
        },
        (res: WsSendMessageAck) => resolve(res)
      );
    });

    expect(e2eeAck.ok).toBe(true);

    // Verify database record has body = '[E2EE]'
    const dbMsg = await prisma.message.findUnique({ where: { id: msgId } });
    expect(dbMsg).toBeDefined();
    expect(dbMsg!.body).toBe('[E2EE]');
    expect(dbMsg!.ciphertext).toBe('AQIDBAUG-CIPHERTEXT-AES-GCM-256');
    expect(dbMsg!.nonce).toBe('123456789012');

    // Create community with Alice as Owner, add Bob as Member
    const commRes = await request(app)
      .post('/api/communities')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({ name: 'E2EE Group Community', slug: 'e2ee-group' });
    const commId = commRes.body.community.id as string;
    const channelConvId = commRes.body.community.categories[0].channels[0].conversationId as string;

    const invRes = await request(app)
      .post(`/api/communities/${commId}/invites`)
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({ expiresInHours: 24 });
    await request(app)
      .post(`/api/communities/join/${invRes.body.invite.code}`)
      .set('Cookie', bob.cookie)
      .set('X-CSRF-Token', bob.csrfToken);

    // Alice distributes Group Sender Key to Bob
    const distRes = await request(app)
      .post('/api/keys/group-sender-keys')
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken)
      .send({
        conversationId: channelConvId,
        generation: 1,
        envelopes: [
          {
            recipientUserId: bob.user.id,
            wrappedSenderKey: 'wrapped-sender-key-aes-gcm-for-bob',
            nonce: 'nonce12345678',
          },
        ],
      });
    expect(distRes.status).toBe(201);
    expect(distRes.body.generation).toBe(1);

    // Bob fetches his sender keys
    const bobKeysRes = await request(app)
      .get(`/api/keys/group-sender-keys/${channelConvId}`)
      .set('Cookie', bob.cookie);
    expect(bobKeysRes.status).toBe(200);
    expect(bobKeysRes.body.senderKeys).toHaveLength(1);
    expect(bobKeysRes.body.senderKeys[0].wrappedSenderKey).toBe(
      'wrapped-sender-key-aes-gcm-for-bob'
    );

    // Alice removes Bob from Community -> triggers Sender Key rotation (generation++)
    const removeRes = await request(app)
      .delete(`/api/communities/${commId}/members/${bob.user.id}`)
      .set('Cookie', alice.cookie)
      .set('X-CSRF-Token', alice.csrfToken);

    expect(removeRes.status).toBe(200);

    // Verify conversation senderKeyGeneration incremented to 2
    const updatedConv = await prisma.conversation.findUnique({
      where: { id: channelConvId },
      select: { senderKeyGeneration: true },
    });
    expect(updatedConv!.senderKeyGeneration).toBe(2);

    // Verify Bob's sender keys were purged
    const purgedKeys = await prisma.groupSenderKey.findMany({
      where: { conversationId: channelConvId, recipientId: bob.user.id },
    });
    expect(purgedKeys).toHaveLength(0);

    aliceSocket.disconnect();
  });
});
