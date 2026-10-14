export interface BusTripDTO {
  id: string;
  route: string;
  departureTime: string; // HH:MM
  origin: string;
  destination: string;
  isNext: boolean;
}

const RAW_TRIPS: Array<Omit<BusTripDTO, 'isNext'>> = [
  { id: 'bus-1', route: 'North → South → Mandi', departureTime: '07:30', origin: 'B-19 Gate', destination: 'Mandi Bus Stand' },
  { id: 'bus-2', route: 'North ↔ South Shuttle', departureTime: '08:45', origin: 'North Campus', destination: 'A-13 Academic Block' },
  { id: 'bus-3', route: 'North ↔ South Shuttle', departureTime: '10:00', origin: 'South Gate 1', destination: 'North Campus B-19' },
  { id: 'bus-4', route: 'Lunch Express Shuttle', departureTime: '12:30', origin: 'A-13 Academic Block', destination: 'North Campus Messes' },
  { id: 'bus-5', route: 'Afternoon Lab Link', departureTime: '14:00', origin: 'North Campus', destination: 'A-17 SCEE Labs' },
  { id: 'bus-6', route: 'Evening Mandi Town Link', departureTime: '17:30', origin: 'Gate 1', destination: 'Mandi Town' },
  { id: 'bus-7', route: 'Night Hostel Shuttle', departureTime: '21:00', origin: 'Central Library', destination: 'North Campus B-19 / C-10' },
];

export function getCampusBusSchedule(now = new Date()): BusTripDTO[] {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let nextTripFound = false;

  const trips = RAW_TRIPS.map((trip) => {
    const [hh, mm] = trip.departureTime.split(':').map((n) => parseInt(n, 10));
    const tripMinutes = (hh || 0) * 60 + (mm || 0);
    const isNext = !nextTripFound && tripMinutes >= currentMinutes;
    if (isNext) {
      nextTripFound = true;
    }
    return {
      ...trip,
      isNext,
    };
  });

  if (!nextTripFound && trips.length > 0) {
    trips[0]!.isNext = true;
  }

  return trips;
}

export const busService = {
  getBusSchedule: async () => {
    return getCampusBusSchedule();
  },
  getNextUpcomingBus: async () => {
    const trips = getCampusBusSchedule();
    return trips.find((t) => t.isNext) || trips[0] || null;
  },
  createBusTrip: async (trip: any) => {
    return { id: `bus-${Date.now()}`, ...trip, isNext: false };
  },
};
