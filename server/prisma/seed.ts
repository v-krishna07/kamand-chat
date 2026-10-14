import crypto from 'node:crypto';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/security/password.js';
import { config } from '../src/config.js';

async function main() {
  console.log('Seeding Kamand Chat database (Phase 1 + Phase 2 Social Layer)...');

  const commonPasswordHash = await hashPassword(config.adminPassword);

  const superAdmin = await prisma.user.upsert({
    where: { username: config.adminUsername },
    update: {},
    create: {
      username: config.adminUsername,
      email: config.adminEmail,
      displayName: 'Kamand Admin',
      passwordHash: commonPasswordHash,
      role: 'super_admin',
      roomCode: 'D-01',
      isRoomPrivate: true,
      bio: 'System Administrator · IIT Mandi',
    },
  });

  const aravind = await prisma.user.upsert({
    where: { username: 'aravind' },
    update: {},
    create: {
      username: 'aravind',
      email: 'b23101@students.iitmandi.ac.in',
      displayName: 'Aravind Sharma',
      passwordHash: commonPasswordHash,
      role: 'member',
      roomCode: 'B-19',
      isRoomPrivate: true,
      bio: 'CSE ’27 · Kamand Prompt · Building fluid interfaces',
    },
  });

  const priya = await prisma.user.upsert({
    where: { username: 'priya' },
    update: {},
    create: {
      username: 'priya',
      email: 'b23142@students.iitmandi.ac.in',
      displayName: 'Priya Nair',
      passwordHash: commonPasswordHash,
      role: 'member',
      roomCode: 'A-12',
      isRoomPrivate: true,
      bio: 'DSE ’27 · Robotics Club · South Campus',
    },
  });

  const rohan = await prisma.user.upsert({
    where: { username: 'rohan' },
    update: {},
    create: {
      username: 'rohan',
      email: 'b22088@students.iitmandi.ac.in',
      displayName: 'Rohan Verma',
      passwordHash: commonPasswordHash,
      role: 'moderator',
      roomCode: 'C-10',
      isRoomPrivate: true,
      bio: 'EE ’26 · Hostel Secretary · North Campus',
    },
  });

  // Seed accepted contact between Aravind and Priya, and incoming pending request from Rohan to Aravind
  await prisma.contact.upsert({
    where: {
      requesterId_targetId: { requesterId: aravind.id, targetId: priya.id },
    },
    update: { status: 'accepted' },
    create: {
      requesterId: aravind.id,
      targetId: priya.id,
      status: 'accepted',
    },
  });

  await prisma.contact.upsert({
    where: {
      requesterId_targetId: { requesterId: rohan.id, targetId: aravind.id },
    },
    update: {},
    create: {
      requesterId: rohan.id,
      targetId: aravind.id,
      status: 'pending',
    },
  });

  // Seed 24h expiring Statuses
  const existingStatuses = await prisma.status.count({ where: { authorId: priya.id } });
  if (existingStatuses === 0) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.status.create({
      data: {
        authorId: priya.id,
        caption: 'Late night hacking at Kamand Prompt First Commit! Coffee at Nescafé near A-12 ☕',
        bgColor: '#0284c7',
        visibility: 'contacts',
        expiresAt,
      },
    });
    await prisma.status.create({
      data: {
        authorId: aravind.id,
        caption: 'Spring physics + WebSockets running at 60fps 🚀 Meet at B-19!',
        bgColor: '#4f46e5',
        visibility: 'contacts',
        expiresAt,
      },
    });
  }

  // Create a seeded 1:1 conversation between Aravind and Priya
  const [firstId, secondId] = [aravind.id, priya.id].sort();
  const directPairKey = `${firstId}:${secondId}`;

  const existingConv = await prisma.conversation.findUnique({
    where: { directPairKey },
  });

  if (!existingConv) {
    const conv = await prisma.conversation.create({
      data: {
        type: 'direct',
        directPairKey,
        lastSeq: 3,
        memberships: {
          create: [
            { userId: aravind.id, role: 'member', lastReadSeq: 3, lastDeliveredSeq: 3 },
            { userId: priya.id, role: 'member', lastReadSeq: 2, lastDeliveredSeq: 3 },
          ],
        },
      },
    });

    const msg1Id = crypto.randomUUID();
    const msg2Id = crypto.randomUUID();
    const msg3Id = crypto.randomUUID();

    await prisma.message.create({
      data: {
        id: msg1Id,
        conversationId: conv.id,
        senderId: priya.id,
        body: 'Hey Aravind! Are we meeting near the Library or B-19 for First Commit?',
        seq: 1,
        status: 'read',
      },
    });

    await prisma.message.create({
      data: {
        id: msg2Id,
        conversationId: conv.id,
        senderId: aravind.id,
        body: 'Let’s meet at B-19 common room in 10 mins. The WebSocket sync is already live!',
        replyToId: msg1Id,
        seq: 2,
        status: 'read',
      },
    });

    await prisma.message.create({
      data: {
        id: msg3Id,
        conversationId: conv.id,
        senderId: aravind.id,
        body: 'Swipe right on any message bubble to test the rubber-band reply gesture.',
        seq: 3,
        status: 'delivered',
      },
    });
  }

  console.log('Seed completed:', {
    superAdmin: superAdmin.username,
    demoUsers: [aravind.username, priya.username, rohan.username],
  });
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
