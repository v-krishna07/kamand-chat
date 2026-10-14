import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  CreateCourseInputSchema,
  CreateBusTripInputSchema,
  UpdateMessMealInputSchema,
  CreateCampusServiceInputSchema,
  FreeSlotQuerySchema,
  GroundedCampusQARequestSchema,
  type CampusTodaySummaryDTO,
} from '@kamand/shared';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import { campusRegistry } from '../campus/connector.js';
import { moodleConnector } from '../campus/moodle.js';
import { timetableService } from '../campus/timetable.js';
import { busService } from '../campus/bus.js';
import { messService, getCurrentDayName } from '../campus/mess.js';
import { campusDirectoryService } from '../campus/services.js';
import { groundedCampusQa } from '../campus/groundedQa.js';
import { prisma } from '../db.js';

export const campusRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.authUser?.role;
  if (role !== 'admin' && role !== 'super_admin') {
    res.status(403).json({ error: 'Admin or Super Admin role is required for this operation.' });
    return;
  }
  next();
}

// 1. Connector Health & Degradation Status (Section 13)
campusRouter.get('/health', requireAuth, async (_req, res, next) => {
  try {
    const summary = await campusRegistry.getHealthSummary();
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

// 2. Aggregated "Today at Kamand" Student Dashboard
campusRouter.get('/today', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const now = new Date();
    const dayOfWeek = getCurrentDayName(now);

    const userTimetable = await timetableService.getTimetableForUser(userId);
    const todaySlots = userTimetable.filter((s) => s.dayOfWeek === dayOfWeek);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const upcomingClass = todaySlots.find((s) => {
      const [hh, mm] = s.startTime.split(':').map((v) => parseInt(v, 10));
      return (hh ?? 0) * 60 + (mm ?? 0) >= currentMinutes;
    }) ?? todaySlots[0] ?? null;

    const nextBus = await busService.getNextUpcomingBus(now);
    const currentMeal = await messService.getCurrentMeal('Oak Mess');
    const upcomingAssignments = await moodleConnector.getUpcomingAssignments(userId);
    const quickContacts = await campusDirectoryService.getQuickEmergencyContacts();
    const healthSummary = await campusRegistry.getHealthSummary();

    const todaySummary: CampusTodaySummaryDTO = {
      dateStr: now.toISOString().split('T')[0]!,
      dayOfWeek,
      nextClass: upcomingClass,
      nextBus,
      currentMeal,
      upcomingAssignments: upcomingAssignments.slice(0, 5),
      quickContacts,
      connectorsStatus: healthSummary.overallStatus,
    };

    res.status(200).json(todaySummary);
  } catch (err) {
    next(err);
  }
});

// 3. Courses & Moodle Sync
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

campusRouter.post('/courses/enroll', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const { courseId } = req.body;
    if (!courseId) {
      res.status(400).json({ error: 'courseId is required' });
      return;
    }
    const userId = req.authUser!.id;

    await prisma.courseEnrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {},
      create: { userId, courseId },
    });

    res.status(200).json({ ok: true, message: 'Enrolled in course successfully' });
  } catch (err) {
    next(err);
  }
});

campusRouter.post('/courses', requireAuth, requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const parsed = CreateCourseInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid course payload' });
      return;
    }

    const created = await prisma.course.create({
      data: parsed.data,
    });

    res.status(201).json({ course: created });
  } catch (err) {
    next(err);
  }
});

// 4. Timetable & Multi-User Free-Slot Finder
campusRouter.get('/timetable', requireAuth, async (req, res, next) => {
  try {
    const slots = await timetableService.getTimetableForUser(req.authUser!.id);
    res.status(200).json({ slots });
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

// 5. Bus Schedule & Admin Management
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

campusRouter.delete('/bus/:id', requireAuth, requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    await busService.deleteBusTrip(req.params.id!);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 6. Mess Menu & Admin Management
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

// 7. Campus Services Directory & Admin Management
campusRouter.get('/services', requireAuth, async (req, res, next) => {
  try {
    const category = req.query.category ? String(req.query.category) : undefined;
    const services = await campusDirectoryService.getServices(category);
    res.status(200).json({ services });
  } catch (err) {
    next(err);
  }
});

campusRouter.post('/services', requireAuth, requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const parsed = CreateCampusServiceInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid service payload' });
      return;
    }

    const service = await campusDirectoryService.createService(parsed.data);
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
});

campusRouter.delete('/services/:id', requireAuth, requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    await campusDirectoryService.deleteService(req.params.id!);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 8. Grounded Campus AI QA with Citations
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
