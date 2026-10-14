import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  ConnectMoodleInputSchema,
  TimetableSlotInputSchema,
  CreateCampusDatumInputSchema,
  GroundedCampusAiQuerySchema,
  ConnectorIdSchema,
  FreeSlotQuerySchema,
  CreateBusTripInputSchema,
  UpdateMessMealInputSchema,
  CreateCampusServiceInputSchema,
  GroundedCampusQARequestSchema,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import {
  encryptConnectorToken,
  decryptConnectorToken,
} from '../campus/tokenCrypto.js';
import {
  probeConnectorAndRecordHealth,
  getAllConnectorsHealth,
  type SimulatedProbeOutcome,
} from '../campus/connectorRegistry.js';
import {
  DEMO_MOODLE_COURSES,
  getDemoMoodleDeadlines,
  DEMO_WEATHER_MANDI,
  inferRollNumberProfile,
} from '../campus/fixtures.js';
import { MOODLE_WS_FUNCTIONS } from '../campus/campus.config.js';
import { timetableService } from '../campus/timetable.js';
import { busService } from '../campus/bus.js';
import { messService } from '../campus/mess.js';
import { campusDirectoryService } from '../campus/services.js';
import { moodleConnector } from '../campus/moodle.js';
import { groundedCampusQa } from '../campus/groundedQa.js';

export const campusRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.authUser?.role;
  if (role !== 'admin' && role !== 'super_admin') {
    res.status(403).json({ error: 'Admin or Super Admin role is required for this operation.' });
    return;
  }
  next();
}

// 1. Get Connector Health & "Try, Then Degrade" Statuses
campusRouter.get('/connectors', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const globalHealth = await getAllConnectorsHealth();
    const userAccounts = await prisma.connectorAccount.findMany({
      where: { userId },
    });

    const merged = globalHealth.map((gh) => {
      const userAcc = userAccounts.find((a) => a.connectorId === gh.id);
      if (gh.id === 'moodle_lms') {
        if (!userAcc || userAcc.status === 'disconnected') {
          return {
            ...gh,
            status: 'disconnected' as const,
            uiVisible: false,
            lastSyncAt: null,
          };
        }
        const isDegraded = gh.status === 'degraded_hidden' || userAcc.status === 'degraded_hidden';
        return {
          ...gh,
          status: isDegraded ? ('degraded_hidden' as const) : ('connected' as const),
          uiVisible: !isDegraded,
          lastSyncAt: userAcc.lastSyncAt ? userAcc.lastSyncAt.toISOString() : gh.lastSyncAt,
          sourceMode: (userAcc.sourceMode as typeof gh.sourceMode) || gh.sourceMode,
        };
      }
      return gh;
    });

    res.status(200).json({
      connectors: merged,
      supportedMoodleFunctions: MOODLE_WS_FUNCTIONS,
    });
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/health', requireAuth, async (_req, res, next) => {
  try {
    const globalHealth = await getAllConnectorsHealth();
    const anyDegraded = globalHealth.some((c) => c.status === 'degraded_hidden');
    res.status(200).json({
      overallStatus: anyDegraded ? 'degraded' : 'healthy',
      connectors: globalHealth.map((c) => ({
        id: c.id,
        name: c.name,
        isHealthy: c.status === 'connected',
        latencyMs: 1,
        lastChecked: c.lastSyncAt || new Date().toISOString(),
        fallbackActive: c.status === 'degraded_hidden' || c.sourceMode === 'demo_fixtures',
        message: c.lastError || 'Connector active',
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// 2. Trigger Manual "Try Again" Probe on a Connector
campusRouter.post('/connectors/:id/probe', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsedId = ConnectorIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(400).json({ error: 'Invalid connector ID' });
      return;
    }

    const simulatedOutcome = req.body?.simulatedOutcome as SimulatedProbeOutcome | undefined;
    const health = await probeConnectorAndRecordHealth(parsedId.data, {
      simulatedOutcome,
      forceRetry: Boolean(req.body?.forceRetry),
    });

    if (parsedId.data === 'moodle_lms') {
      await prisma.connectorAccount.updateMany({
        where: { userId: req.authUser!.id, connectorId: 'moodle_lms' },
        data: {
          status: health.status,
          failureCount: health.failureCount,
          lastError: health.lastError,
        },
      });
    }

    res.status(200).json({ connector: health });
  } catch (err) {
    next(err);
  }
});

// 3. Connect Moodle LMS Account
campusRouter.post('/connectors/moodle/connect', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = ConnectMoodleInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid Moodle connection payload',
      });
      return;
    }

    const userId = req.authUser!.id;
    const { mode, token, username, password, icsUrl } = parsed.data;

    let resolvedSecret = '';
    let sourceMode: 'official_api' | 'ics_export' = 'official_api';

    if (mode === 'token') {
      if (!token) {
        res.status(400).json({ error: 'Moodle mobile web-service token is required.' });
        return;
      }
      resolvedSecret = token;
    } else if (mode === 'login_once') {
      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required for one-time token exchange.' });
        return;
      }
      resolvedSecret = `moodle-exchanged-ws-token-${userId.slice(0, 8)}-${Date.now()}`;
    } else {
      if (!icsUrl || !icsUrl.startsWith('http')) {
        res.status(400).json({ error: 'Valid Moodle calendar export ICS URL is required.' });
        return;
      }
      resolvedSecret = icsUrl;
      sourceMode = 'ics_export';
    }

    const health = await probeConnectorAndRecordHealth('moodle_lms', {
      token: resolvedSecret,
      forceRetry: true,
    });

    if (health.status === 'degraded_hidden') {
      res.status(200).json({
        ok: false,
        degraded: true,
        connector: health,
      });
      return;
    }

    const { encryptedToken, tokenIv } = encryptConnectorToken(userId, resolvedSecret);
    const cachedPayload = JSON.stringify({
      courses: DEMO_MOODLE_COURSES,
      deadlines: getDemoMoodleDeadlines(),
      syncedFunctions: MOODLE_WS_FUNCTIONS,
    });

    const now = new Date();
    await prisma.connectorAccount.upsert({
      where: {
        userId_connectorId: { userId, connectorId: 'moodle_lms' },
      },
      update: {
        encryptedToken,
        tokenIv,
        sourceMode,
        status: 'connected',
        failureCount: 0,
        lastSyncAt: now,
        lastError: null,
        cachedJson: cachedPayload,
      },
      create: {
        userId,
        connectorId: 'moodle_lms',
        encryptedToken,
        tokenIv,
        sourceMode,
        status: 'connected',
        failureCount: 0,
        lastSyncAt: now,
        cachedJson: cachedPayload,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'CAMPUS_MOODLE_CONNECTED',
        metadata: JSON.stringify({ mode, sourceMode }),
        ipAddress: req.ip ?? null,
      },
    });

    res.status(200).json({
      ok: true,
      degraded: false,
      connector: {
        ...health,
        status: 'connected',
        uiVisible: true,
        lastSyncAt: now.toISOString(),
        sourceMode,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 4. One-Tap "Disconnect & Delete Cached Data"
campusRouter.delete('/connectors/:id', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const connectorId = req.params.id;

    await prisma.connectorAccount.deleteMany({
      where: { userId, connectorId },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'CAMPUS_CONNECTOR_DISCONNECTED_AND_PURGED',
        metadata: JSON.stringify({ connectorId }),
        ipAddress: req.ip ?? null,
      },
    });

    res.status(200).json({ ok: true, deletedCachedData: true });
  } catch (err) {
    next(err);
  }
});

// 5. "Today" Campus Dashboard
campusRouter.get('/today', requireAuth, async (req, res, next) => {
  try {
    const user = req.authUser!;
    const connectors = await getAllConnectorsHealth();

    const moodleAccount = await prisma.connectorAccount.findUnique({
      where: {
        userId_connectorId: { userId: user.id, connectorId: 'moodle_lms' },
      },
    });

    const moodleGlobal = connectors.find((c) => c.id === 'moodle_lms');
    const isMoodleVisible =
      Boolean(moodleAccount) &&
      moodleAccount!.status === 'connected' &&
      moodleGlobal?.status !== 'degraded_hidden';

    let courses: typeof DEMO_MOODLE_COURSES = [];
    let deadlines: ReturnType<typeof getDemoMoodleDeadlines> = [];

    if (isMoodleVisible && moodleAccount) {
      decryptConnectorToken(user.id, moodleAccount.encryptedToken, moodleAccount.tokenIv);
      const parsedCache = JSON.parse(moodleAccount.cachedJson || '{}') as {
        courses?: typeof DEMO_MOODLE_COURSES;
        deadlines?: ReturnType<typeof getDemoMoodleDeadlines>;
      };
      courses = parsedCache.courses ?? DEMO_MOODLE_COURSES;
      deadlines = parsedCache.deadlines ?? getDemoMoodleDeadlines();
    }

    const timetable = await prisma.timetableSlot.findMany({
      where: { userId: user.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    const publicConnector = connectors.find((c) => c.id === 'public_institute');
    const isPublicVisible = publicConnector?.uiVisible ?? true;

    const campusData = isPublicVisible
      ? await prisma.campusDatum.findMany({
          orderBy: { createdAt: 'desc' },
          take: 60,
        })
      : [];

    const weatherConnector = connectors.find((c) => c.id === 'mandi_weather');
    const weather = weatherConnector?.uiVisible ? DEMO_WEATHER_MANDI : null;

    const studentProfile = inferRollNumberProfile(user.email || user.username);

    // Also calculate nextClass, nextBus, currentMeal for backwards compatibility
    const nextBus = await busService.getNextUpcomingBus();
    const requestedMess = typeof req.query.mess === 'string' ? req.query.mess : 'Pine Mess';
    const currentMeal = await messService.getCurrentMeal(requestedMess);
    const upcomingAssignments = await moodleConnector.getUpcomingAssignments(user.id);
    const quickContacts = await campusDirectoryService.getQuickEmergencyContacts();

    res.status(200).json({
      studentProfile,
      moodle: {
        uiVisible: isMoodleVisible,
        lastSyncAt: moodleAccount?.lastSyncAt ? moodleAccount.lastSyncAt.toISOString() : null,
        courses,
        deadlines,
      },
      timetable,
      weather,
      publicData: {
        uiVisible: isPublicVisible,
        messMenu: campusData.filter((d) => d.category === 'mess_menu'),
        buses: campusData.filter((d) => d.category === 'bus_schedule'),
        notices: campusData.filter((d) => d.category === 'notice' || d.category === 'calendar'),
        helplines: campusData.filter((d) => d.category === 'helpline'),
        services: campusData.filter((d) =>
          [
            'lost_found',
            'ride_share',
            'marketplace',
            'mess_poll',
            'club_event',
            'study_buddy',
            'peer_note',
            'anonymous_feedback',
            'sos_alert',
          ].includes(d.category)
        ),
      },
      // Summary cards compatibility:
      dateStr: new Date().toISOString().split('T')[0]!,
      dayOfWeek: 'Wednesday',
      nextClass: timetable[0] ? {
        id: timetable[0].id,
        courseId: null,
        dayOfWeek: 'Wednesday' as const,
        startTime: timetable[0].startTime,
        endTime: timetable[0].endTime,
        location: timetable[0].roomCode,
        title: timetable[0].courseTitle,
        slotCode: timetable[0].courseCode,
      } : null,
      nextBus,
      currentMeal,
      upcomingAssignments: upcomingAssignments.slice(0, 5),
      quickContacts,
      connectorsStatus: moodleGlobal?.status === 'degraded_hidden' ? 'degraded' : 'healthy',
    });
  } catch (err) {
    next(err);
  }
});

// 6. Timetable CRUD & Free Slots
campusRouter.post('/timetable', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = TimetableSlotInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid timetable slot',
      });
      return;
    }

    const slot = await prisma.timetableSlot.create({
      data: {
        userId: req.authUser!.id,
        courseCode: parsed.data.courseCode,
        courseTitle: parsed.data.courseTitle,
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        roomCode: parsed.data.roomCode,
        location: parsed.data.roomCode,
        title: `${parsed.data.courseCode}: ${parsed.data.courseTitle}`,
      },
    });

    res.status(201).json({ slot });
  } catch (err) {
    next(err);
  }
});

campusRouter.delete('/timetable/:id', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    await prisma.timetableSlot.deleteMany({
      where: { id: req.params.id, userId: req.authUser!.id },
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/timetable/free-slots', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const day = typeof req.query.day === 'string' ? req.query.day : 'Wed';
    const candidateHours = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

    const myBusy = await prisma.timetableSlot.findMany({
      where: { userId, dayOfWeek: day },
      select: { startTime: true },
    });
    const busyStarts = new Set(myBusy.map((b) => b.startTime));
    const freeSlots = candidateHours.filter((h) => !busyStarts.has(h));

    res.status(200).json({ day, freeSlots });
  } catch (err) {
    next(err);
  }
});

campusRouter.post('/timetable/free-slots', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = FreeSlotQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid free slot query' });
      return;
    }

    const freeSlots = await timetableService.findCommonFreeSlots(parsed.data);
    res.status(200).json({ freeSlots });
  } catch (err) {
    next(err);
  }
});

// 7. Campus Services & Admin Data CRUD
campusRouter.get('/services', requireAuth, async (req, res, next) => {
  try {
    const category = req.query.category ? String(req.query.category) : undefined;
    const services = await campusDirectoryService.getServices(category);
    res.status(200).json({ services });
  } catch (err) {
    next(err);
  }
});

campusRouter.post('/services', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = CreateCampusDatumInputSchema.safeParse(req.body);
    if (!parsed.success) {
      // Fallback for CreateCampusServiceInputSchema
      const srvParsed = CreateCampusServiceInputSchema.safeParse(req.body);
      if (srvParsed.success) {
        const s = await campusDirectoryService.createService(srvParsed.data);
        res.status(201).json({ service: s });
        return;
      }
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid campus service item',
      });
      return;
    }

    const userId = req.authUser!.id;
    const role = req.authUser!.role;
    const adminOnlyCategories = new Set(['mess_menu', 'bus_schedule', 'notice', 'calendar', 'helpline']);

    if (
      adminOnlyCategories.has(parsed.data.category) &&
      role !== 'admin' &&
      role !== 'super_admin' &&
      role !== 'moderator'
    ) {
      res.status(403).json({
        error: 'Only campus admins or moderators can publish official institute data.',
      });
      return;
    }

    const created = await prisma.campusDatum.create({
      data: {
        ...parsed.data,
        authorId: parsed.data.category === 'anonymous_feedback' ? null : userId,
      },
    });

    res.status(201).json({ item: created });
  } catch (err) {
    next(err);
  }
});

campusRouter.post('/services/:id/upvote', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const updated = await prisma.campusDatum.update({
      where: { id: req.params.id },
      data: { upvotes: { increment: 1 } },
    });
    res.status(200).json({ item: updated });
  } catch (err) {
    next(err);
  }
});

// 8. Grounded Campus AI Assistant
campusRouter.post('/ask-grounded', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = GroundedCampusAiQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid campus question' });
      return;
    }

    const userId = req.authUser!.id;
    const q = parsed.data.question.toLowerCase();

    const publicRecords = await prisma.campusDatum.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 40,
    });

    const citations: Array<{ source: string; title: string }> = [];
    const matchedFacts: string[] = [];

    const STOP_WORDS = new Set([
      'when', 'what', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
      'does', 'did', 'done', 'will', 'would', 'shall', 'should', 'can', 'could',
      'the', 'this', 'that', 'these', 'those', 'from', 'with', 'about', 'into',
      'through', 'during', 'before', 'after', 'above', 'below', 'under', 'down',
      'off', 'over', 'and', 'but', 'for', 'nor', 'yet', 'you', 'your', 'are',
      'tell', 'mandi', 'iit',
    ]);

    const keywords = q
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9-]/g, ''))
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    for (const item of publicRecords) {
      const textBlob = `${item.category} ${item.title} ${item.subtitle} ${item.body}`.toLowerCase();

      if (keywords.length > 0 && keywords.some((kw) => textBlob.includes(kw))) {
        citations.push({
          source: `Public Campus Data (${item.category})`,
          title: item.title,
        });
        matchedFacts.push(`• **${item.title}** (${item.subtitle || item.category}): ${item.body}`);
      }
    }

    if (parsed.data.includePersonalConsentedData) {
      const moodleAcc = await prisma.connectorAccount.findUnique({
        where: { userId_connectorId: { userId, connectorId: 'moodle_lms' } },
      });
      if (moodleAcc && moodleAcc.status === 'connected') {
        const deadlines = getDemoMoodleDeadlines();
        if (q.includes('deadline') || q.includes('assign') || q.includes('quiz') || q.includes('ic-')) {
          for (const d of deadlines) {
            citations.push({
              source: `Consented Moodle LMS (${d.courseCode})`,
              title: d.title,
            });
            matchedFacts.push(
              `• **${d.courseCode} — ${d.title}** (${d.type}) due at ${new Date(
                d.dueAt
              ).toLocaleString()}`
            );
          }
        }
      }
    }

    if (matchedFacts.length === 0) {
      res.status(200).json({
        found: false,
        answer:
          'Not found in verified IIT Mandi public campus data or your consented Moodle/timetable records. I do not guess unverified campus facts.',
        citations: [],
      });
      return;
    }

    res.status(200).json({
      found: true,
      answer: matchedFacts.slice(0, 5).join('\n'),
      citations: citations.slice(0, 5),
    });
  } catch (err) {
    next(err);
  }
});

campusRouter.post('/ask', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = GroundedCampusQARequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid campus question' });
      return;
    }
    const response = await groundedCampusQa.answerCampusQuery(parsed.data.query);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// Additional compatibility routes:
campusRouter.get('/courses', requireAuth, async (req, res, next) => {
  try {
    const courses = await moodleConnector.getCourses(req.authUser!.id);
    res.status(200).json({ courses });
  } catch (err) {
    next(err);
  }
});

campusRouter.post('/courses/sync-moodle', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const syncRes = await moodleConnector.sync(req.authUser!.id);
    res.status(200).json(syncRes);
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/bus', requireAuth, async (_req, res, next) => {
  try {
    const schedule = await busService.getBusSchedule();
    res.status(200).json({ schedule });
  } catch (err) {
    next(err);
  }
});

campusRouter.post('/bus', requireAuth, requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const parsed = CreateBusTripInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bus trip payload' });
      return;
    }
    const trip = await busService.createBusTrip(parsed.data);
    res.status(201).json({ trip });
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/mess', requireAuth, async (req, res, next) => {
  try {
    const hostel = req.query.hostel ? String(req.query.hostel) : undefined;
    const menu = await messService.getWeeklyMenu(hostel);
    res.status(200).json({ menu });
  } catch (err) {
    next(err);
  }
});

campusRouter.put('/mess', requireAuth, requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const parsed = UpdateMessMealInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid mess meal payload' });
      return;
    }
    const meal = await messService.updateMessMeal(parsed.data);
    res.status(200).json({ meal });
  } catch (err) {
    next(err);
  }
});
