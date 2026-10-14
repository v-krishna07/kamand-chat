import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { authRateLimiter } from '../src/security/rateLimit.js';
import { tryThenDegrade } from '../src/campus/connector.js';
import { parseIcsEvents } from '../src/campus/moodle.js';
import { timetableService } from '../src/campus/timetable.js';
import { busService } from '../src/campus/bus.js';
import { determineCurrentMealType } from '../src/campus/mess.js';

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
    await prisma.user.update({
      where: { id: res.body.user.id },
      data: { role },
    });
  }
  return {
    user: res.body.user,
    csrfToken: res.body.csrfToken as string,
    cookie: extractSessionCookie(res.headers['set-cookie']),
  };
}

beforeEach(async () => {
  authRateLimiter.reset();
  await prisma.assignment.deleteMany();
  await prisma.timetableSlot.deleteMany();
  await prisma.courseEnrollment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.busTrip.deleteMany();
  await prisma.messMenu.deleteMany();
  await prisma.campusService.deleteMany();
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
  await prisma.$disconnect();
});

describe('Phase 7 Verification Suite: IIT Mandi Campus Layer (Try, Then Degrade Connectors, Moodle & ICS Sync, Timetable Free Slots, Bus & Mess, Grounded AI Citations & Admin CRUD)', () => {
  it('1. Verifies connector probe() and "Try, Then Degrade" pattern returns healthy/degraded status without throwing', async () => {
    const u = await registerTestUser('campus_student');

    // Test direct tryThenDegrade utility behavior
    const result = await tryThenDegrade(
      async () => {
        throw new Error('Simulated Moodle LMS network outage');
      },
      async () => {
        return ['Cached Course CS302', 'Cached Course CS307'];
      },
      100
    );

    expect(result.fallbackActive).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toBe('Cached Course CS302');

    // Test GET /api/campus/health
    const healthRes = await request(app)
      .get('/api/campus/health')
      .set('Cookie', u.cookie);

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.connectors).toBeInstanceOf(Array);
    const moodleConnector = healthRes.body.connectors.find(
      (c: { id: string }) => c.id === 'iitmandi-moodle'
    );
    expect(moodleConnector).toBeDefined();
    expect(moodleConnector.fallbackActive).toBe(true);
  });

  it('2. Parses standard iCalendar (.ics) exports and executes Moodle sync with graceful fallback', async () => {
    const u = await registerTestUser('moodle_user');

    const sampleIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Moodle//NONSGML Moodle 4.x//EN',
      'BEGIN:VEVENT',
      'SUMMARY:[CS302] Assignment 3: Red-Black Trees',
      'DESCRIPTION:Implement balance rotations and verify logarithmic depth',
      'DTSTART:20261028T180000Z',
      'DTEND:20261028T180000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:CS307: Lab 4 Concurrency Primitives',
      'DESCRIPTION:Sleeping locks and spinlocks in xv6',
      'DTSTART:20261102T180000Z',
      'DTEND:20261102T180000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const parsedEvents = parseIcsEvents(sampleIcs);
    expect(parsedEvents).toHaveLength(2);
    expect(parsedEvents[0]!.courseCode).toBe('CS302');
    expect(parsedEvents[0]!.title).toContain('Assignment 3: Red-Black Trees');
    expect(parsedEvents[1]!.courseCode).toBe('CS307');

    // Test POST /api/campus/courses/sync-moodle
    const syncRes = await request(app)
      .post('/api/campus/courses/sync-moodle')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken);

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.fallbackActive).toBe(true);
    expect(syncRes.body.source).toBe('local_cache');
    expect(syncRes.body.syncedAt).toBeDefined();
  });

  it('3. Computes mutual unallocated free-slots across multiple students to find common meeting times', async () => {
    const student1 = await registerTestUser('peer_aravind');
    const student2 = await registerTestUser('peer_priya');

    // Create course and timetable slots on Monday
    const c1 = await prisma.course.create({
      data: {
        code: 'CS302',
        title: 'Algorithms',
        instructor: 'Dr. Varun',
        slot: 'A',
      },
    });
    const c2 = await prisma.course.create({
      data: {
        code: 'EE201',
        title: 'Signals',
        instructor: 'Dr. Ankush',
        slot: 'B',
      },
    });

    // Student 1 is busy 09:00 - 10:00 (CS302)
    await prisma.courseEnrollment.create({
      data: { userId: student1.user.id, courseId: c1.id },
    });
    await prisma.timetableSlot.create({
      data: {
        courseId: c1.id,
        dayOfWeek: 'Monday',
        startTime: '09:00',
        endTime: '10:00',
        location: 'A1-NKN',
        title: 'CS302: Algorithms',
      },
    });

    // Student 2 is busy 11:00 - 12:00 (EE201)
    await prisma.courseEnrollment.create({
      data: { userId: student2.user.id, courseId: c2.id },
    });
    await prisma.timetableSlot.create({
      data: {
        courseId: c2.id,
        dayOfWeek: 'Monday',
        startTime: '11:00',
        endTime: '12:00',
        location: 'A2-201',
        title: 'EE201: Signals',
      },
    });

    // Calculate free slots between 08:00 and 14:00
    const freeSlots = await timetableService.findCommonFreeSlots({
      userIds: [student1.user.id, student2.user.id],
      dayOfWeek: 'Monday',
      windowStart: '08:00',
      windowEnd: '14:00',
      minDurationMins: 30,
    });

    // Expected mutual free slots:
    // 08:00 - 09:00 (60 mins)
    // 10:00 - 11:00 (60 mins)
    // 12:00 - 14:00 (120 mins)
    expect(freeSlots).toHaveLength(3);
    expect(freeSlots[0]!.startTime).toBe('08:00');
    expect(freeSlots[0]!.endTime).toBe('09:00');
    expect(freeSlots[0]!.durationMins).toBe(60);

    expect(freeSlots[1]!.startTime).toBe('10:00');
    expect(freeSlots[1]!.endTime).toBe('11:00');
    expect(freeSlots[1]!.durationMins).toBe(60);

    expect(freeSlots[2]!.startTime).toBe('12:00');
    expect(freeSlots[2]!.endTime).toBe('14:00');
    expect(freeSlots[2]!.durationMins).toBe(120);

    // Verify endpoint POST /api/campus/timetable/free-slots
    const endpointRes = await request(app)
      .post('/api/campus/timetable/free-slots')
      .set('Cookie', student1.cookie)
      .set('X-CSRF-Token', student1.csrfToken)
      .send({
        userIds: [student1.user.id, student2.user.id],
        dayOfWeek: 'Monday',
        windowStart: '08:00',
        windowEnd: '14:00',
        minDurationMins: 30,
      });

    expect(endpointRes.status).toBe(200);
    expect(endpointRes.body.freeSlots).toHaveLength(3);
  });

  it('4. Computes live bus schedule and accurately identifies the immediate next upcoming valley bus', async () => {
    const u = await registerTestUser('bus_rider');

    await prisma.busTrip.create({
      data: {
        routeName: 'North Campus -> South Campus',
        fromLocation: 'Mind Tree',
        toLocation: 'South Gate',
        departureTime: '10:00',
      },
    });
    await prisma.busTrip.create({
      data: {
        routeName: 'North Campus -> South Campus',
        fromLocation: 'Mind Tree',
        toLocation: 'South Gate',
        departureTime: '14:30',
      },
    });

    // Test at 09:40 AM (before 10:00 AM trip)
    const testTime1 = new Date();
    testTime1.setHours(9, 40, 0, 0);

    const schedule1 = await busService.getBusSchedule(testTime1);
    const trip1 = schedule1.find((t) => t.departureTime === '10:00');
    expect(trip1).toBeDefined();
    expect(trip1!.minutesUntilDeparture).toBe(20);
    expect(trip1!.isNext).toBe(true);

    // Test at 11:00 AM (after 10:00 trip, before 14:30 trip)
    const testTime2 = new Date();
    testTime2.setHours(11, 0, 0, 0);

    const schedule2 = await busService.getBusSchedule(testTime2);
    const trip2 = schedule2.find((t) => t.departureTime === '14:30');
    expect(trip2).toBeDefined();
    expect(trip2!.minutesUntilDeparture).toBe(210);
    expect(trip2!.isNext).toBe(true);

    // Verify GET /api/campus/bus
    const res = await request(app).get('/api/campus/bus').set('Cookie', u.cookie);
    expect(res.status).toBe(200);
    expect(res.body.schedule).toHaveLength(2);
  });

  it('5. Retrieves mess menus and dynamically identifies meal types by operating hours', async () => {
    const u = await registerTestUser('mess_student');

    expect(determineCurrentMealType(8)).toBe('breakfast');
    expect(determineCurrentMealType(13)).toBe('lunch');
    expect(determineCurrentMealType(17)).toBe('snacks');
    expect(determineCurrentMealType(20)).toBe('dinner');

    await prisma.messMenu.create({
      data: {
        hostelName: 'Oak Mess',
        dayOfWeek: 'Monday',
        mealType: 'lunch',
        items: JSON.stringify(['Rajma Madra', 'Steamed Rice', 'Phulka Roti']),
        dietaryNote: 'Himachali Special',
      },
    });

    const res = await request(app)
      .get('/api/campus/mess?hostel=Oak%20Mess')
      .set('Cookie', u.cookie);

    expect(res.status).toBe(200);
    expect(res.body.menu).toHaveLength(1);
    expect(res.body.menu[0].items).toContain('Rajma Madra');
    expect(res.body.menu[0].dietaryNote).toBe('Himachali Special');
  });

  it('6. Answers campus queries via Grounded Campus AI with verifiable citations', async () => {
    const u = await registerTestUser('qa_user');

    // Query 1: Transit
    const busRes = await request(app)
      .post('/api/campus/ask')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken)
      .send({ query: 'Tell me about the electric buses between North and South campus' });

    expect(busRes.status).toBe(200);
    expect(busRes.body.answer).toContain('North Campus');
    expect(busRes.body.citations).toBeInstanceOf(Array);
    expect(busRes.body.citations.length).toBeGreaterThan(0);
    expect(busRes.body.citations[0].sourceType).toBe('bus_schedule');
    expect(busRes.body.citations[0].reference).toContain('Transport Desk');

    // Query 2: Emergency Clinic
    const clinicRes = await request(app)
      .post('/api/campus/ask')
      .set('Cookie', u.cookie)
      .set('X-CSRF-Token', u.csrfToken)
      .send({ query: 'What is the ambulance phone number for emergency at Kamand health clinic?' });

    expect(clinicRes.status).toBe(200);
    expect(clinicRes.body.answer).toContain('267011');
    expect(clinicRes.body.citations[0].sourceType).toBe('campus_handbook');
  });

  it('7. Enforces role-based permissions: members are forbidden from mutating bus/mess data, admins succeed', async () => {
    const member = await registerTestUser('regular_student', 'member');
    const admin = await registerTestUser('campus_admin', 'admin');

    // Member attempts to create bus trip -> 403 Forbidden
    const forbiddenBus = await request(app)
      .post('/api/campus/bus')
      .set('Cookie', member.cookie)
      .set('X-CSRF-Token', member.csrfToken)
      .send({
        routeName: 'South -> Town',
        fromLocation: 'South Campus',
        toLocation: 'Mandi Town',
        departureTime: '17:00',
      });
    expect(forbiddenBus.status).toBe(403);

    // Admin creates bus trip -> 201 Created
    const allowedBus = await request(app)
      .post('/api/campus/bus')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        routeName: 'South -> Town',
        fromLocation: 'South Campus',
        toLocation: 'Mandi Town',
        departureTime: '17:00',
      });
    expect(allowedBus.status).toBe(201);
    expect(allowedBus.body.trip.departureTime).toBe('17:00');

    // Member attempts to update mess -> 403 Forbidden
    const forbiddenMess = await request(app)
      .put('/api/campus/mess')
      .set('Cookie', member.cookie)
      .set('X-CSRF-Token', member.csrfToken)
      .send({
        hostelName: 'Oak Mess',
        dayOfWeek: 'Monday',
        mealType: 'dinner',
        items: ['Pizza', 'Pasta'],
      });
    expect(forbiddenMess.status).toBe(403);

    // Admin updates mess -> 200 OK
    const allowedMess = await request(app)
      .put('/api/campus/mess')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        hostelName: 'Oak Mess',
        dayOfWeek: 'Monday',
        mealType: 'dinner',
        items: ['Dal Makhani', 'Shahi Paneer', 'Naan'],
      });
    expect(allowedMess.status).toBe(200);
    expect(allowedMess.body.meal.items).toContain('Dal Makhani');
  });
});
