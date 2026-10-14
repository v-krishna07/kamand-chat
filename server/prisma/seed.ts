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

  // Phase 7: Seed Campus Layer Data
  console.log('Seeding Phase 7 Campus Layer data (Courses, Timetable, Bus, Mess, Services)...');

  const cs302 = await prisma.course.upsert({
    where: { code: 'CS302' },
    update: {},
    create: {
      code: 'CS302',
      title: 'Data Structures and Algorithms',
      instructor: 'Dr. Varun Dutt',
      credits: 4,
      slot: 'A',
      room: 'A1-NKN',
      description: 'Advanced data structures, balanced trees, graph algorithms, and algorithmic complexity.',
    },
  });

  const cs307 = await prisma.course.upsert({
    where: { code: 'CS307' },
    update: {},
    create: {
      code: 'CS307',
      title: 'Operating Systems & Concurrency',
      instructor: 'Dr. Manoj Thakur',
      credits: 4,
      slot: 'B',
      room: 'B-19',
      description: 'Process management, concurrency primitives, memory management, and file systems.',
    },
  });

  const ee201 = await prisma.course.upsert({
    where: { code: 'EE201' },
    update: {},
    create: {
      code: 'EE201',
      title: 'Signals and Systems',
      instructor: 'Dr. Ankush Pathania',
      credits: 3,
      slot: 'C',
      room: 'A2-201',
      description: 'Continuous and discrete-time signals, Fourier analysis, Laplace and Z-transforms.',
    },
  });

  // Enrollments
  await prisma.courseEnrollment.upsert({
    where: { userId_courseId: { userId: aravind.id, courseId: cs302.id } },
    update: {},
    create: { userId: aravind.id, courseId: cs302.id },
  });
  await prisma.courseEnrollment.upsert({
    where: { userId_courseId: { userId: aravind.id, courseId: cs307.id } },
    update: {},
    create: { userId: aravind.id, courseId: cs307.id },
  });
  await prisma.courseEnrollment.upsert({
    where: { userId_courseId: { userId: priya.id, courseId: cs302.id } },
    update: {},
    create: { userId: priya.id, courseId: cs302.id },
  });
  await prisma.courseEnrollment.upsert({
    where: { userId_courseId: { userId: priya.id, courseId: ee201.id } },
    update: {},
    create: { userId: priya.id, courseId: ee201.id },
  });

  // Assignments
  const existingAssignCount = await prisma.assignment.count();
  if (existingAssignCount === 0) {
    const due1 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const due2 = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

    await prisma.assignment.create({
      data: {
        courseId: cs302.id,
        moodleAssignId: 1042,
        title: 'Assignment 3: Red-Black Trees & Treaps',
        description: 'Implement balance rotations, node insertions, and prove O(log N) depth invariants.',
        dueDate: due1,
        maxPoints: 100,
        submissionUrl: 'https://moodle.iitmandi.ac.in/mod/assign/view.php?id=1042',
      },
    });

    await prisma.assignment.create({
      data: {
        courseId: cs307.id,
        moodleAssignId: 1088,
        title: 'Lab 4: xv6 Kernel Synchronization & Mutexes',
        description: 'Implement sleeping locks and ticket spinlocks in xv6 kernel source tree.',
        dueDate: due2,
        maxPoints: 100,
        submissionUrl: 'https://moodle.iitmandi.ac.in/mod/assign/view.php?id=1088',
      },
    });
  }

  // Timetable Slots
  const existingSlotsCount = await prisma.timetableSlot.count();
  if (existingSlotsCount === 0) {
    const defaultSlots = [
      { userId: aravind.id, courseId: cs302.id, dayOfWeek: 'Monday', startTime: '09:00', endTime: '09:50', location: 'A1-NKN', title: 'CS302: Data Structures', slotCode: 'A' },
      { userId: aravind.id, courseId: cs307.id, dayOfWeek: 'Monday', startTime: '10:00', endTime: '10:50', location: 'B-19', title: 'CS307: Operating Systems', slotCode: 'B' },
      { userId: aravind.id, courseId: cs302.id, dayOfWeek: 'Wednesday', startTime: '09:00', endTime: '09:50', location: 'A1-NKN', title: 'CS302: Data Structures', slotCode: 'A' },
      { userId: aravind.id, courseId: cs307.id, dayOfWeek: 'Wednesday', startTime: '14:00', endTime: '17:00', location: 'SC-Lab 2', title: 'CS307: OS Lab', slotCode: 'B' },
      { userId: aravind.id, courseId: cs302.id, dayOfWeek: 'Friday', startTime: '09:00', endTime: '09:50', location: 'A1-NKN', title: 'CS302: Data Structures', slotCode: 'A' },
      { userId: aravind.id, courseId: ee201.id, dayOfWeek: 'Tuesday', startTime: '11:00', endTime: '11:50', location: 'A2-201', title: 'EE201: Signals & Systems', slotCode: 'C' },
      { userId: aravind.id, courseId: ee201.id, dayOfWeek: 'Thursday', startTime: '11:00', endTime: '11:50', location: 'A2-201', title: 'EE201: Signals & Systems', slotCode: 'C' },
    ];
    for (const s of defaultSlots) {
      await prisma.timetableSlot.create({ data: s });
    }
  }

  // Bus Trips
  const existingBusCount = await prisma.busTrip.count();
  if (existingBusCount === 0) {
    const northToSouth = ['07:30', '08:15', '09:00', '10:30', '12:00', '14:15', '16:30', '18:00', '19:30', '21:00', '22:30'];
    const southToNorth = ['08:00', '08:45', '09:45', '11:15', '13:00', '15:00', '17:15', '18:45', '20:15', '21:45', '23:00'];

    for (const time of northToSouth) {
      await prisma.busTrip.create({
        data: {
          routeName: 'North Campus -> South Campus',
          fromLocation: 'North Campus (Mind Tree)',
          toLocation: 'South Campus (Main Gate)',
          departureTime: time,
          busType: 'Electric Bus',
        },
      });
    }

    for (const time of southToNorth) {
      await prisma.busTrip.create({
        data: {
          routeName: 'South Campus -> North Campus',
          fromLocation: 'South Campus (Main Gate)',
          toLocation: 'North Campus (Mind Tree)',
          departureTime: time,
          busType: 'Electric Bus',
        },
      });
    }
  }

  // Mess Menu
  const existingMessCount = await prisma.messMenu.count();
  if (existingMessCount === 0) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const d of days) {
      await prisma.messMenu.create({
        data: {
          hostelName: 'Oak Mess',
          dayOfWeek: d,
          mealType: 'breakfast',
          items: JSON.stringify(['Aloo Paratha / Poha', 'Boiled Eggs / Sprouts', 'Curd & Pickle', 'Tea / Coffee']),
          dietaryNote: 'Egg & Veg counters separate',
        },
      });
      await prisma.messMenu.create({
        data: {
          hostelName: 'Oak Mess',
          dayOfWeek: d,
          mealType: 'lunch',
          items: JSON.stringify(['Rajma Madra / Chana Dal', 'Steamed Rice', 'Phulka Roti', 'Mix Veg Sabzi', 'Boondi Raita']),
          dietaryNote: 'Himachali Madra special',
        },
      });
      await prisma.messMenu.create({
        data: {
          hostelName: 'Oak Mess',
          dayOfWeek: d,
          mealType: 'snacks',
          items: JSON.stringify(['Samosa / Veg Cutlet', 'Green Chutney', 'Special Adrak Chai']),
        },
      });
      await prisma.messMenu.create({
        data: {
          hostelName: 'Oak Mess',
          dayOfWeek: d,
          mealType: 'dinner',
          items: JSON.stringify(['Paneer Butter Masala', 'Dal Tadka', 'Jeera Rice', 'Tandoori Roti', 'Gulab Jamun']),
          dietaryNote: 'Sweet dish served at dinner',
        },
      });
    }
  }

  // Campus Services
  const existingServiceCount = await prisma.campusService.count();
  if (existingServiceCount === 0) {
    const services = [
      {
        title: 'Kamand Health Clinic & Ambulance',
        category: 'medical',
        phone: '+91-1905-267011',
        alternatePhone: '+91-98055-12345',
        location: 'South Campus Medical Block',
        operatingHours: '24x7 Doctor on Call',
        description: 'Emergency trauma care, inpatient clinic, pharmacy, and all-weather 4x4 ambulance.',
        priorityOrder: 1,
      },
      {
        title: 'Security Control Room',
        category: 'emergency',
        phone: '+91-1905-267115',
        location: 'South Campus Main Gate',
        operatingHours: '24x7',
        description: 'Campus perimeter security, gate passes, night escort service, and lost-and-found desk.',
        priorityOrder: 2,
      },
      {
        title: 'Campus Transit & Bus Dispatch',
        category: 'transport',
        phone: '+91-1905-267020',
        location: 'North Campus Transport Desk',
        operatingHours: '07:00 - 23:00',
        description: 'Electric bus operations, town shuttle passes, and breakdown support.',
        priorityOrder: 3,
      },
      {
        title: 'Dean of Student Affairs Office',
        category: 'admin',
        phone: '+91-1905-267035',
        email: 'dost@iitmandi.ac.in',
        location: 'North Campus Admin Block',
        operatingHours: '09:00 - 17:30 (Mon-Fri)',
        description: 'Hostel allocations, student welfare, clubs, and extracurricular permissions.',
        priorityOrder: 4,
      },
      {
        title: 'WingNet & Campus IT Helpdesk',
        category: 'it',
        phone: '+91-1905-267050',
        email: 'helpdesk@iitmandi.ac.in',
        location: 'A1-NKN Ground Floor',
        operatingHours: '09:00 - 18:00',
        description: 'Hostel Wi-Fi, LDAP credentials, institute email, and Moodle LMS access.',
        priorityOrder: 5,
      },
    ];

    for (const s of services) {
      await prisma.campusService.create({ data: s });
    }
  }

  // Phase 7: Seed Public Campus Data (Pine Mess, Kamand Bus, Notices, Helplines & Campus Services)
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

  // Seed Timetable Slots for Aravind
  const existingAravindSlots = await prisma.timetableSlot.count({ where: { userId: aravind.id } });
  if (existingAravindSlots === 0) {
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
