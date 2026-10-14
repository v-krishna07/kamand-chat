import { prisma } from '../db.js';
import type { BusTripDTO, CreateBusTripInput } from '@kamand/shared';

export class BusService {
  /**
   * Retrieves bus schedules and computes real-time minutes until next departure.
   */
  public async getBusSchedule(currentTime = new Date()): Promise<BusTripDTO[]> {
    const trips = await prisma.busTrip.findMany({
      orderBy: { departureTime: 'asc' },
    });

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    let nextTripFound = false;

    return trips.map((t) => {
      const [hh, mm] = t.departureTime.split(':').map((v) => parseInt(v, 10));
      const tripMinutes = (hh ?? 0) * 60 + (mm ?? 0);
      let minutesUntil = tripMinutes - currentMinutes;

      // If already departed today, compute as departure for tomorrow (+24h)
      if (minutesUntil < 0) {
        minutesUntil += 24 * 60;
      }

      let isNext = false;
      if (!nextTripFound && tripMinutes >= currentMinutes) {
        isNext = true;
        nextTripFound = true;
      }

      return {
        id: t.id,
        routeName: t.routeName,
        fromLocation: t.fromLocation,
        toLocation: t.toLocation,
        departureTime: t.departureTime,
        daysOfWeek: t.daysOfWeek,
        busType: t.busType,
        isWeekendOnly: t.isWeekendOnly,
        minutesUntilDeparture: minutesUntil,
        isNext,
      };
    });
  }

  public async getNextUpcomingBus(currentTime = new Date()): Promise<BusTripDTO | null> {
    const schedules = await this.getBusSchedule(currentTime);
    const sorted = [...schedules].sort(
      (a, b) => (a.minutesUntilDeparture ?? 9999) - (b.minutesUntilDeparture ?? 9999)
    );
    return sorted[0] ?? null;
  }

  public async createBusTrip(input: CreateBusTripInput): Promise<BusTripDTO> {
    const created = await prisma.busTrip.create({
      data: {
        routeName: input.routeName,
        fromLocation: input.fromLocation,
        toLocation: input.toLocation,
        departureTime: input.departureTime,
        daysOfWeek: input.daysOfWeek,
        busType: input.busType,
        isWeekendOnly: input.isWeekendOnly,
      },
    });

    return {
      id: created.id,
      routeName: created.routeName,
      fromLocation: created.fromLocation,
      toLocation: created.toLocation,
      departureTime: created.departureTime,
      daysOfWeek: created.daysOfWeek,
      busType: created.busType,
      isWeekendOnly: created.isWeekendOnly,
    };
  }

  public async deleteBusTrip(tripId: string): Promise<boolean> {
    await prisma.busTrip.delete({ where: { id: tripId } });
    return true;
  }
}

export const busService = new BusService();
