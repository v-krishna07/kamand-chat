import crypto from 'node:crypto';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/security/password.js';
import { config } from '../src/config.js';

async function main() {
  console.log('Seeding Kamand Chat database (Phase 1–3: Core, Social & Structured Communities)...');

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

  // Contacts
  await prisma.contact.upsert({
    where: { requesterId_targetId: { requesterId: aravind.id, targetId: priya.id } },
    update: { status: 'accepted' },
    create: { requesterId: aravind.id, targetId: priya.id, status: 'accepted' },
  });

  await prisma.contact.upsert({
    where: { requesterId_targetId: { requesterId: rohan.id, targetId: aravind.id } },
    update: {},
    create: { requesterId: rohan.id, targetId: aravind.id, status: 'pending' },
  });

  // 24h Statuses
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

  // 1:1 Conversation between Aravind and Priya
  const [firstId, secondId] = [aravind.id, priya.id].sort();
  const directPairKey = `${firstId}:${secondId}`;
  const existingConv = await prisma.conversation.findUnique({ where: { directPairKey } });

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

  // Phase 3: Seed Structured Community ("IIT Mandi") -> Categories ("Clubs", "Hostels", "Courses") -> Channels
  const existingComm = await prisma.community.findUnique({ where: { slug: 'iit-mandi' } });
  if (!existingComm) {
    const allUsers = [
      { id: superAdmin.id, role: 'owner' },
      { id: aravind.id, role: 'admin' },
      { id: rohan.id, role: 'moderator' },
      { id: priya.id, role: 'member' },
    ];

    const comm = await prisma.community.create({
      data: {
        name: 'IIT Mandi',
        slug: 'iit-mandi',
        description: 'Official campus workspace for Clubs, Hostels, and Courses at IIT Mandi.',
        isPrivate: false,
        members: {
          create: allUsers.map((u) => ({ userId: u.id, role: u.role })),
        },
      },
    });

    const catClubs = await prisma.category.create({
      data: { communityId: comm.id, name: 'Clubs', position: 0 },
    });
    const catHostels = await prisma.category.create({
      data: { communityId: comm.id, name: 'Hostels', position: 1 },
    });
    const catCourses = await prisma.category.create({
      data: { communityId: comm.id, name: 'Courses', position: 2 },
    });

    const createSeededChannel = async (
      categoryId: string,
      name: string,
      topic: string,
      type: 'text' | 'announcement' | 'voice',
      position: number
    ) => {
      const conv = await prisma.conversation.create({
        data: {
          type: 'group',
          title: `#${name}`,
          memberships: {
            create: allUsers.map((u) => ({ userId: u.id, role: u.role })),
          },
        },
      });
      return prisma.channel.create({
        data: {
          communityId: comm.id,
          categoryId,
          conversationId: conv.id,
          name,
          topic,
          type,
          position,
        },
      });
    };

    const chAnnouncements = await createSeededChannel(
      catClubs.id,
      'announcements',
      'Official Kamand Prompt & SNTC announcements (Moderators & Admins post)',
      'announcement',
      0
    );
    const chKamandPrompt = await createSeededChannel(
      catClubs.id,
      'kamand-prompt',
      'Programming Club IIT Mandi · First Commit 24h Hackathon HQ',
      'text',
      1
    );
    await createSeededChannel(
      catHostels.id,
      'b19-north-campus',
      'Hostel B-19 & North Campus discussions',
      'text',
      0
    );
    await createSeededChannel(
      catCourses.id,
      'ic-112-calculus',
      'IC-112 tutorials, lecture notes & exam prep',
      'text',
      0
    );

    // Seed an announcement and a threaded discussion in #kamand-prompt
    await prisma.conversation.update({
      where: { id: chAnnouncements.conversationId },
      data: { lastSeq: 1 },
    });
    await prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        conversationId: chAnnouncements.conversationId,
        senderId: rohan.id,
        body: 'Welcome to First Commit! Keep your repo private until submission and verify real-time WebSocket delivery.',
        seq: 1,
        status: 'sent',
      },
    });

    const rootId = crypto.randomUUID();
    await prisma.conversation.update({
      where: { id: chKamandPrompt.conversationId },
      data: { lastSeq: 2 },
    });
    await prisma.message.create({
      data: {
        id: rootId,
        conversationId: chKamandPrompt.conversationId,
        senderId: aravind.id,
        body: 'Thread: Share your First Commit team architecture & tech stack below!',
        seq: 1,
        status: 'sent',
      },
    });
    await prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        conversationId: chKamandPrompt.conversationId,
        senderId: priya.id,
        body: 'We are using React + Motion springs, Socket.IO with sequence numbers, and Prisma SQLite!',
        threadRootId: rootId,
        seq: 2,
        status: 'sent',
      },
    });

    await prisma.invite.create({
      data: {
        code: 'KAMAND26',
        communityId: comm.id,
        creatorId: aravind.id,
        maxUses: 100,
      },
    });
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
