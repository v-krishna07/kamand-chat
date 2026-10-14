import { prisma } from '../db.js';
import type { FreeSlotDTO, FreeSlotQuery, TimetableSlotDTO } from '@kamand/shared';

export function timeToMinutes(timeStr: string): number {
  const [hh, mm] = timeStr.split(':').map((v) => parseInt(v, 10));
  return (hh ?? 0) * 60 + (mm ?? 0);
}

export function minutesToTime(mins: number): string {
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export class TimetableService {
  /**
   * Retrieves timetable slots for a user's enrolled courses and personal schedule.
   */
  public async getTimetableForUser(userId: string): Promise<TimetableSlotDTO[]> {
    const userEnrollments = await prisma.courseEnrollment.findMany({
      where: { userId },
      select: { courseId: true },
    });
    const courseIds = userEnrollments.map((e) => e.courseId);

    const slots = await prisma.timetableSlot.findMany({
      where: {
        OR: [
          { userId },
          { courseId: { in: courseIds } },
        ],
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return slots.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      dayOfWeek: s.dayOfWeek as TimetableSlotDTO['dayOfWeek'],
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location,
      title: s.title,
      slotCode: s.slotCode,
    }));
  }

  /**
   * Calculates intersection of unallocated (free) time slots across multiple students.
   * Enables groups, clubs, and hackathon teams to find mutual meeting times.
   */
  public async findCommonFreeSlots(query: FreeSlotQuery): Promise<FreeSlotDTO[]> {
    const windowStartMin = timeToMinutes(query.windowStart);
    const windowEndMin = timeToMinutes(query.windowEnd);

    if (windowStartMin >= windowEndMin) {
      return [];
    }

    // 1. Gather all busy intervals across all specified users
    const allBusyIntervals: Array<{ start: number; end: number }> = [];

    for (const userId of query.userIds) {
      const enrollments = await prisma.courseEnrollment.findMany({
        where: { userId },
        select: { courseId: true },
      });
      const courseIds = enrollments.map((e) => e.courseId);

      const slots = await prisma.timetableSlot.findMany({
        where: {
          dayOfWeek: query.dayOfWeek,
          OR: [
            { userId },
            { courseId: { in: courseIds } },
          ],
        },
      });

      for (const slot of slots) {
        const slotStart = Math.max(windowStartMin, timeToMinutes(slot.startTime));
        const slotEnd = Math.min(windowEndMin, timeToMinutes(slot.endTime));
        if (slotStart < slotEnd) {
          allBusyIntervals.push({ start: slotStart, end: slotEnd });
        }
      }
    }

    // 2. Sort busy intervals by start time
    allBusyIntervals.sort((a, b) => a.start - b.start || a.end - b.end);

    // 3. Merge overlapping or contiguous busy intervals
    const mergedBusy: Array<{ start: number; end: number }> = [];
    for (const interval of allBusyIntervals) {
      if (mergedBusy.length === 0) {
        mergedBusy.push({ ...interval });
      } else {
        const last = mergedBusy[mergedBusy.length - 1]!;
        if (interval.start <= last.end) {
          last.end = Math.max(last.end, interval.end);
        } else {
          mergedBusy.push({ ...interval });
        }
      }
    }

    // 4. Invert merged busy intervals within [windowStartMin, windowEndMin] to find mutual free slots
    const freeSlots: FreeSlotDTO[] = [];
    let currentMarker = windowStartMin;

    for (const busy of mergedBusy) {
      if (busy.start > currentMarker) {
        const duration = busy.start - currentMarker;
        if (duration >= query.minDurationMins) {
          freeSlots.push({
            dayOfWeek: query.dayOfWeek,
            startTime: minutesToTime(currentMarker),
            endTime: minutesToTime(busy.start),
            durationMins: duration,
            participantsCount: query.userIds.length,
          });
        }
      }
      currentMarker = Math.max(currentMarker, busy.end);
    }

    // Check tail gap after last busy interval
    if (currentMarker < windowEndMin) {
      const duration = windowEndMin - currentMarker;
      if (duration >= query.minDurationMins) {
        freeSlots.push({
          dayOfWeek: query.dayOfWeek,
          startTime: minutesToTime(currentMarker),
          endTime: minutesToTime(windowEndMin),
          durationMins: duration,
          participantsCount: query.userIds.length,
        });
      }
    }

    return freeSlots;
  }
}

export const timetableService = new TimetableService();
