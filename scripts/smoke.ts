import http from 'node:http';
import crypto from 'node:crypto';
import request from 'supertest';
import { io as createClientSocket } from 'socket.io-client';
import { createApp } from '../server/src/app.js';
import { attachSocketServer } from '../server/src/ws/socketServer.js';
import { prisma } from '../server/src/db.js';

/**
 * End-to-End Automated Smoke Verification Script (Section 2 & Section 16)
 * Usage: npx tsx scripts/smoke.ts
 */
async function runSmoke() {
  console.log('1. Booting Kamand Chat Server + WebSocket hub on ephemeral port...');
  const app = createApp();
  const httpServer = http.createServer(app);
  attachSocketServer(httpServer);

  const serverUrl = await new Promise<string>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      const port = addr && typeof addr === 'object' ? addr.port : 4000;
      resolve(`http://localhost:${port}`);
    });
  });

  const health = await request(app).get('/api/health');
  if (health.status !== 200) {
    throw new Error(`Health check failed: ${health.status}`);
  }
  console.log('2. Health check OK:', health.body);

  const suffix = Date.now().toString().slice(-5);
  const regA = await request(app).post('/api/auth/register').send({
    username: `smoke_a_${suffix}`,
    email: `smoke_a_${suffix}@students.iitmandi.ac.in`,
    displayName: 'Smoke User A',
    password: 'Password123',
    roomCode: 'B-19',
  });
  const regB = await request(app).post('/api/auth/register').send({
    username: `smoke_b_${suffix}`,
    email: `smoke_b_${suffix}@students.iitmandi.ac.in`,
    displayName: 'Smoke User B',
    password: 'Password123',
    roomCode: 'A-12',
  });

  if (regA.status !== 201 || regB.status !== 201) {
    throw new Error('User registration failed during smoke test');
  }

  const cookieA = (regA.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
  const csrfA = regA.body.csrfToken as string;

  const convRes = await request(app)
    .post('/api/conversations/direct')
    .set('Cookie', cookieA)
    .set('X-CSRF-Token', csrfA)
    .send({ targetUserId: regB.body.user.id });

  const convId = convRes.body.conversation.id as string;
  console.log('3. Created 1:1 conversation:', convId);

  const socketA = createClientSocket(serverUrl, {
    extraHeaders: { Cookie: cookieA },
    transports: ['websocket'],
  });

  await new Promise<void>((resolve) => socketA.on('connect', () => resolve()));

  const ack = await new Promise<{ ok: boolean }>((resolve) => {
    socketA.emit(
      'message:send',
      {
        id: crypto.randomUUID(),
        conversationId: convId,
        body: 'Smoke test ping over WebSocket',
      },
      (res: { ok: boolean }) => resolve(res)
    );
  });

  if (!ack.ok) {
    throw new Error('WebSocket message send failed');
  }
  console.log('4. WebSocket message delivered & sequenced OK.');

  socketA.disconnect();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
  console.log('SMOKE VERIFICATION PASSED.');
}

runSmoke().catch((err) => {
  console.error('SMOKE VERIFICATION FAILED:', err);
  process.exit(1);
});
