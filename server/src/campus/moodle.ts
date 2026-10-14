import { config } from '../config.js';
import { prisma } from '../db.js';
import { tryThenDegrade, campusRegistry, type CampusConnector } from './connector.js';
import type {
  CampusConnectorHealth,
  CourseDTO,
  AssignmentDTO,
  MoodleSyncResponse,
} from '@kamand/shared';

export interface RawMoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  summary?: string;
}

export interface RawMoodleAssignment {
  id: number;
  course: number;
  name: string;
  intro?: string;
  duedate: number; // Unix timestamp
  grade?: number;
}

export interface ParsedIcsEvent {
  title: string;
  courseCode: string;
  description: string;
  dueDate: Date;
}


/**
 * Parses standard iCalendar (.ics) export feeds commonly used by Moodle
 * when external Web Services tokens are restricted.
 */
export function parseIcsEvents(icsContent: string): ParsedIcsEvent[] {
  const events: ParsedIcsEvent[] = [];
  const lines = icsContent.split(/\r?\n/);
  let inEvent = false;
  let summary = '';
  let description = '';
  let dtEnd = '';
  let dtStart = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();

    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      summary = '';
      description = '';
      dtEnd = '';
      dtStart = '';
    } else if (line === 'END:VEVENT') {
      inEvent = false;
      const rawDateStr = dtEnd || dtStart;
      let dueDate = new Date();
      if (rawDateStr) {
        // e.g., 20261025T180000Z or 20261025
        const match = rawDateStr.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/);
        if (match) {
          const [, y, m, d, hh = '23', mm = '59', ss = '00'] = match;
          dueDate = new Date(Date.UTC(+y!, +m! - 1, +d!, +hh, +mm, +ss));
        }
      }

      // Try extracting course code from summary, e.g., "[CS302] Assignment 3" or "CS302: Lab 4"
      const courseMatch = summary.match(/\[?([A-Z]{2,4}\s?\d{3})\]?:?\s*(.*)/i);
      const courseCode = courseMatch ? courseMatch[1]!.replace(/\s+/, '').toUpperCase() : 'CAMPUS';
      const title = courseMatch && courseMatch[2]?.trim() ? courseMatch[2].trim() : summary;

      if (summary) {
        events.push({
          title: title || 'Campus Assignment',
          courseCode,
          description: description || 'Imported via Moodle ICS Calendar',
          dueDate,
        });
      }
    } else if (inEvent) {
      if (line.startsWith('SUMMARY:')) {
        summary = line.substring(8);
      } else if (line.startsWith('DESCRIPTION:')) {
        description = line.substring(12);
      } else if (line.startsWith('DTEND:') || line.startsWith('DTEND;')) {
        dtEnd = line.split(':')[1] || '';
      } else if (line.startsWith('DTSTART:') || line.startsWith('DTSTART;')) {
        dtStart = line.split(':')[1] || '';
      }
    }
  }

  return events;
}

export class MoodleConnector implements CampusConnector {
  public readonly id = 'iitmandi-moodle';
  public readonly name = 'IIT Mandi Moodle LMS';

  private lastSyncAt: string | null = null;

  public async probe(): Promise<CampusConnectorHealth> {

    const startTime = Date.now();
    try {
      if (!config.moodleToken && !config.moodleIcsUrl) {
        return {
          id: this.id,
          name: this.name,
          isHealthy: true,
          latencyMs: 1,
          lastChecked: new Date().toISOString(),
          fallbackActive: true,
          message: 'Running in local verified campus fallback mode (No external Moodle token configured)',
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.campusProbeTimeoutMs);

      const probeUrl = config.moodleToken
        ? `${config.moodleUrl}/webservice/rest/server.php?wstoken=${config.moodleToken}&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json`
        : config.moodleUrl;

      const res = await fetch(probeUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        return {
          id: this.id,
          name: this.name,
          isHealthy: true,
          latencyMs,
          lastChecked: new Date().toISOString(),
          fallbackActive: false,
          message: 'Official IIT Mandi Moodle API online and responding',
        };
      } else {
        return {
          id: this.id,
          name: this.name,
          isHealthy: false,
          latencyMs,
          lastChecked: new Date().toISOString(),
          fallbackActive: true,
          message: `Moodle returned HTTP ${res.status} · Falling back to local cache`,
        };
      }
    } catch (err) {
      return {
        id: this.id,
        name: this.name,
        isHealthy: false,
        latencyMs: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
        fallbackActive: true,
        message: err instanceof Error ? err.message : 'Connection to Moodle timed out or failed',
      };
    }
  }

  /**
   * Syncs courses and assignments with "Try, Then Degrade" protection.
   * 1. Try official Moodle Web Services API
   * 2. If fails, try Moodle ICS Calendar feed
   * 3. If fails, fall back to SQLite database seeded/cached courses
   */
  public async sync(userId?: string): Promise<MoodleSyncResponse> {
    const syncResult = await tryThenDegrade(
      async () => {
        if (!config.moodleToken) {
          throw new Error('No MOODLE_TOKEN configured');
        }
        return await this.fetchFromMoodleApi(userId);
      },
      async () => {
        if (config.moodleIcsUrl) {
          return await this.fetchFromIcsFeed();
        }
        return await this.fetchFromDatabase(userId);
      }
    );

    this.lastSyncAt = new Date().toISOString();

    return {
      syncedCourses: syncResult.data.courses.length,
      syncedAssignments: syncResult.data.assignments.length,
      source: syncResult.fallbackActive ? (config.moodleIcsUrl ? 'ics_feed' : 'local_cache') : 'moodle_api',
      fallbackActive: syncResult.fallbackActive,
      syncedAt: this.lastSyncAt,
    };
  }

  private async fetchFromMoodleApi(userId?: string): Promise<{ courses: CourseDTO[]; assignments: AssignmentDTO[] }> {
    const token = config.moodleToken;
    const url = config.moodleUrl;

    const coursesRes = await fetch(
      `${url}/webservice/rest/server.php?wstoken=${token}&wsfunction=core_course_get_courses&moodlewsrestformat=json`
    );
    if (!coursesRes.ok) throw new Error(`Moodle API error: ${coursesRes.status}`);
    const rawCourses = (await coursesRes.json()) as RawMoodleCourse[];

    const assignRes = await fetch(
      `${url}/webservice/rest/server.php?wstoken=${token}&wsfunction=mod_assign_get_assignments&moodlewsrestformat=json`
    );
    if (!assignRes.ok) throw new Error(`Moodle assignments error: ${assignRes.status}`);
    const rawAssignData = (await assignRes.json()) as { courses?: Array<{ id: number; assignments: RawMoodleAssignment[] }> };

    // Persist or upsert into SQLite
    for (const c of rawCourses) {
      if (c.id === 1) continue; // Site course
      await prisma.course.upsert({
        where: { code: c.shortname.toUpperCase() },
        update: { title: c.fullname },
        create: {
          code: c.shortname.toUpperCase(),
          title: c.fullname,
          instructor: 'Faculty of IIT Mandi',
          credits: 3,
          slot: 'A',
          room: 'A1-NKN',
          description: c.summary || '',
        },
      });
    }

    const assignmentsToReturn: AssignmentDTO[] = [];
    if (rawAssignData.courses) {
      for (const courseGroup of rawAssignData.courses) {
        for (const a of courseGroup.assignments) {
          const dbCourse = await prisma.course.findFirst({
            where: { code: { contains: String(courseGroup.id) } },
          });
          if (dbCourse) {
            const dueDate = new Date(a.duedate * 1000);
            const saved = await prisma.assignment.create({
              data: {
                courseId: dbCourse.id,
                moodleAssignId: a.id,
                title: a.name,
                description: a.intro || '',
                dueDate,
                maxPoints: a.grade ?? 100,
              },
            });

            const now = Date.now();
            const daysRemaining = Math.ceil((dueDate.getTime() - now) / (1000 * 60 * 60 * 24));
            assignmentsToReturn.push({
              id: saved.id,
              courseId: dbCourse.id,
              courseCode: dbCourse.code,
              courseTitle: dbCourse.title,
              moodleAssignId: a.id,
              title: a.name,
              description: a.intro || '',
              dueDate: dueDate.toISOString(),
              maxPoints: a.grade ?? 100,
              isOverdue: dueDate.getTime() < now,
              daysRemaining,
            });
          }
        }
      }
    }

    const finalCourses = await this.getCourses(userId);
    return { courses: finalCourses, assignments: assignmentsToReturn };
  }

  private async fetchFromIcsFeed(): Promise<{ courses: CourseDTO[]; assignments: AssignmentDTO[] }> {
    const res = await fetch(config.moodleIcsUrl);
    if (!res.ok) throw new Error(`ICS fetch failed (${res.status})`);
    const icsText = await res.text();
    const parsed = parseIcsEvents(icsText);

    for (const ev of parsed) {
      let course = await prisma.course.findUnique({ where: { code: ev.courseCode } });
      if (!course) {
        course = await prisma.course.create({
          data: {
            code: ev.courseCode,
            title: `${ev.courseCode} Course`,
            instructor: 'Faculty of IIT Mandi',
            credits: 3,
            slot: 'B',
            room: 'A1-NKN',
          },
        });
      }

      await prisma.assignment.create({
        data: {
          courseId: course.id,
          title: ev.title,
          description: ev.description,
          dueDate: ev.dueDate,
        },
      });
    }

    return {
      courses: await this.getCourses(),
      assignments: await this.getUpcomingAssignments(),
    };
  }

  private async fetchFromDatabase(userId?: string): Promise<{ courses: CourseDTO[]; assignments: AssignmentDTO[] }> {
    const courses = await this.getCourses(userId);
    const assignments = await this.getUpcomingAssignments(userId);
    return { courses, assignments };
  }

  public async getCourses(userId?: string): Promise<CourseDTO[]> {
    const dbCourses = await prisma.course.findMany({
      include: {
        enrollments: userId ? { where: { userId } } : false,
      },
      orderBy: { code: 'asc' },
    });

    return dbCourses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      instructor: c.instructor,
      credits: c.credits,
      slot: c.slot,
      room: c.room,
      description: c.description,
      isEnrolled: userId ? (c.enrollments && c.enrollments.length > 0) : undefined,
    }));
  }

  public async getUpcomingAssignments(userId?: string): Promise<AssignmentDTO[]> {
    const whereClause: { course?: { enrollments?: { some: { userId: string } } } } = {};
    if (userId) {
      whereClause.course = { enrollments: { some: { userId } } };
    }

    const assignments = await prisma.assignment.findMany({
      where: whereClause,
      include: { course: true },
      orderBy: { dueDate: 'asc' },
      take: 20,
    });

    const now = Date.now();
    return assignments.map((a) => {
      const dueTime = new Date(a.dueDate).getTime();
      const daysRemaining = Math.ceil((dueTime - now) / (1000 * 60 * 60 * 24));
      return {
        id: a.id,
        courseId: a.courseId,
        courseCode: a.course.code,
        courseTitle: a.course.title,
        moodleAssignId: a.moodleAssignId,
        title: a.title,
        description: a.description,
        dueDate: a.dueDate.toISOString(),
        maxPoints: a.maxPoints,
        submissionUrl: a.submissionUrl,
        isOverdue: dueTime < now,
        daysRemaining,
      };
    });
  }
}

export const moodleConnector = new MoodleConnector();
campusRegistry.register(moodleConnector);

