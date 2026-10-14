import crypto from 'node:crypto';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/security/password.js';
import { config } from '../src/config.js';
import { ensureDefaultMapPlacesSeeded } from '../src/routes/map.js';

async function main() {
  console.log('Seeding Kamand Chat database (1 super_admin + 6 IIT Mandi demo users + full fixtures)...');

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

  const demoSpecs = [
    {
      username: 'aravind',
      email: 'b23101@students.iitmandi.ac.in',
      displayName: 'Aravind Sharma',
      role: 'member',
      roomCode: 'B-19',
      bio: 'CSE ’27 · Kamand Prompt · Building fluid interfaces',
    },
    {
      username: 'priya',
      email: 'b23142@students.iitmandi.ac.in',
      displayName: 'Priya Nair',
      role: 'member',
      roomCode: 'A-12',
      bio: 'DSE ’27 · Robotics Club · South Campus',
    },
    {
      username: 'rohan',
      email: 'b22088@students.iitmandi.ac.in',
      displayName: 'Rohan Verma',
      role: 'moderator',
      roomCode: 'C-10',
      bio: 'EE ’26 · Hostel Secretary · North Campus',
    },
    {
      username: 'ananya',
      email: 'b24019@students.iitmandi.ac.in',
      displayName: 'Ananya Gupta',
      role: 'member',
      roomCode: 'B-12',
      bio: 'ME ’28 · Design & Animation Club',
    },
    {
      username: 'kabir',
      email: 'b25110@students.iitmandi.ac.in',
      displayName: 'Kabir Mehta',
      role: 'member',
      roomCode: 'B-19',
      bio: 'EE ’29 · Embedded Systems & Drones',
    },
    {
      username: 'meera',
      email: 'b23055@students.iitmandi.ac.in',
      displayName: 'Meera Iyer',
      role: 'admin',
      roomCode: 'A-12',
      bio: 'CSE ’27 · SNTC Coordinator',
    },
  ];

  const demoUsers = [];
  for (const spec of demoSpecs) {
    const u = await prisma.user.upsert({
      where: { username: spec.username },
      update: {},
      create: {
        ...spec,
        passwordHash: commonPasswordHash,
        isRoomPrivate: true,
      },
    });
    demoUsers.push(u);
  }

  const [aravind, priya, rohan, ananya, kabir, meera] = demoUsers as [
    typeof superAdmin,
    typeof superAdmin,
    typeof superAdmin,
    typeof superAdmin,
    typeof superAdmin,
    typeof superAdmin,
  ];

  await prisma.contact.upsert({
    where: { requesterId_targetId: { requesterId: aravind.id, targetId: priya.id } },
    update: { status: 'accepted' },
    create: { requesterId: aravind.id, targetId: priya.id, status: 'accepted' },
  });

  await prisma.contact.upsert({
    where: { requesterId_targetId: { requesterId: aravind.id, targetId: kabir.id } },
    update: { status: 'accepted' },
    create: { requesterId: aravind.id, targetId: kabir.id, status: 'accepted' },
  });

  await prisma.contact.upsert({
    where: { requesterId_targetId: { requesterId: rohan.id, targetId: aravind.id } },
    update: {},
    create: { requesterId: rohan.id, targetId: aravind.id, status: 'pending' },
  });

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

  // Structured Community ("IIT Mandi")
  const existingComm = await prisma.community.findUnique({ where: { slug: 'iit-mandi' } });
  if (!existingComm) {
    const allUsers = [
      { id: superAdmin.id, role: 'owner' },
      { id: aravind.id, role: 'admin' },
      { id: meera.id, role: 'admin' },
      { id: rohan.id, role: 'moderator' },
      { id: priya.id, role: 'member' },
      { id: ananya.id, role: 'member' },
      { id: kabir.id, role: 'member' },
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

  // Campus Data
  const existingCampusCount = await prisma.campusDatum.count();
  if (existingCampusCount === 0) {
    await prisma.campusDatum.createMany({
      data: [
        {
          category: 'mess_menu',
          title: 'Pine Mess (Pure Vegetarian · North Campus)',
          subtitle: 'Today’s Menu · Lunch & Dinner',
          body: 'Lunch: Paneer Butter Masala, Moong Dal Tadka, Jeera Rice, Hot Chapatis, Sprouted Chana Salad, Curd. Dinner: Mix Veg, Dal Makhani, Gulab Jamun, Warm Milk.',
          locationCode: 'PINE-MESS',
          authorId: superAdmin.id,
        },
        {
          category: 'bus_schedule',
          title: 'North Campus ↔ South Campus ↔ Mandi Town Shuttle',
          subtitle: 'Every 30 mins from B-19 / Gate 1',
          body: 'Next departures from North Campus Gate: 09:00, 09:30, 10:00, 12:30, 14:00, 17:30, 19:00, 21:00. Mandi Bus Stand Express: 16:30 & 18:15.',
          locationCode: 'GATE-1',
          authorId: superAdmin.id,
        },
        {
          category: 'notice',
          title: 'First Commit 24h Hackathon Submission Reminder',
          subtitle: 'Kamand Prompt · Programming Club IIT Mandi',
          body: 'Ensure your GitHub repository remains private during the 24h sprint and make it public at final submission along with your YouTube demo and Drive PPT links.',
          locationCode: 'A13-LH1',
          authorId: superAdmin.id,
        },
        {
          category: 'helpline',
          title: 'IIT Mandi Campus Medical Center & Security Helpline',
          subtitle: '24×7 Emergency Support',
          body: 'Medical Unit (South/North Campus): 01905-267111 · Main Gate Security Control Room: 01905-267009.',
          locationCode: 'HOSPITAL',
          authorId: superAdmin.id,
        },
        {
          category: 'lost_found',
          title: 'Found: Casio Scientific Calculator FX-991EX',
          subtitle: 'Found near Library Reading Room 2nd Floor',
          body: 'Left on the corner desk after the IC-112 tutorial. Ping @priya or pick up from A-12 common room.',
          locationCode: 'LIBRARY',
          authorId: priya.id,
        },
        {
          category: 'ride_share',
          title: 'Cab Share: IIT Mandi → Chandigarh Airport (Saturday 6 AM)',
          subtitle: '2 seats available in Innova',
          body: 'Leaving from North Campus B-19 at 06:00 AM sharp. Splitting fare 4 ways.',
          locationCode: 'B-19',
          eventTime: 'Saturday 06:00 AM',
          authorId: rohan.id,
        },
        {
          category: 'club_event',
          title: 'Robotics Club: ESP32 Autonomous Drone Workshop',
          subtitle: 'SNTC Tinkering Lab · Tomorrow 5:30 PM',
          body: 'Hands-on session covering ESP32 Wi-Fi telemetry, PID flight tuning, and sensor debugging.',
          locationCode: 'A17-LAB2',
          eventTime: 'Tomorrow 17:30',
          authorId: aravind.id,
        },
      ],
    });
  }

  const existingSlots = await prisma.timetableSlot.count({ where: { userId: aravind.id } });
  if (existingSlots === 0) {
    await prisma.timetableSlot.createMany({
      data: [
        {
          userId: aravind.id,
          courseCode: 'IC-112',
          courseTitle: 'Calculus',
          dayOfWeek: 'Wed',
          startTime: '09:00',
          endTime: '09:55',
          roomCode: 'A13-LH1',
        },
        {
          userId: aravind.id,
          courseCode: 'IC-152',
          courseTitle: 'Computing and Data Science',
          dayOfWeek: 'Wed',
          startTime: '11:00',
          endTime: '11:55',
          roomCode: 'A17-LAB2',
        },
        {
          userId: aravind.id,
          courseCode: 'IC-131',
          courseTitle: 'Applied Electronics for Engineers',
          dayOfWeek: 'Wed',
          startTime: '14:00',
          endTime: '15:55',
          roomCode: 'A13-LH2',
        },
      ],
    });
  }

  await ensureDefaultMapPlacesSeeded();

  console.log('Seed completed:', {
    superAdmin: superAdmin.username,
    demoUsers: demoUsers.map((u) => u.username),
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
