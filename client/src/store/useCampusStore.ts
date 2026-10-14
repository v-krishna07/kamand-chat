import { create } from 'zustand';
import type {
  CampusTodaySummaryDTO,
  CourseDTO,
  TimetableSlotDTO,
  BusTripDTO,
  MessMealDTO,
  CampusServiceDTO,
  FreeSlotDTO,
  FreeSlotQuery,
  CampusHealthSummary,
  MoodleSyncResponse,
  GroundedCampusQAResponse,
  Citation,
  CreateBusTripInput,
  UpdateMessMealInput,
  CreateCampusServiceInput,
} from '@kamand/shared';
import { apiFetch } from '../lib/api.js';

export interface CampusQaTurn {
  id: string;
  query: string;
  answer: string;
  citations: Citation[];
  confidence: 'high' | 'medium' | 'low';
  timestamp: string;
}

interface CampusState {
  todaySummary: CampusTodaySummaryDTO | null;
  courses: CourseDTO[];
  timetableSlots: TimetableSlotDTO[];
  busSchedule: BusTripDTO[];
  messMenu: MessMealDTO[];
  services: CampusServiceDTO[];
  freeSlots: FreeSlotDTO[];
  campusHealth: CampusHealthSummary | null;
  moodleSyncStatus: MoodleSyncResponse | null;
  qaHistory: CampusQaTurn[];

  isLoadingToday: boolean;
  isSyncingMoodle: boolean;
  isQueryingFreeSlots: boolean;
  isAskingQa: boolean;
  campusError: string | null;

  loadTodaySummary: () => Promise<void>;
  loadCourses: () => Promise<void>;
  syncMoodle: () => Promise<MoodleSyncResponse>;
  enrollInCourse: (courseId: string) => Promise<void>;
  loadTimetable: () => Promise<void>;
  queryFreeSlots: (query: FreeSlotQuery) => Promise<FreeSlotDTO[]>;
  loadBusSchedule: () => Promise<void>;
  loadMessMenu: (hostelName?: string) => Promise<void>;
  loadServices: (category?: string) => Promise<void>;
  loadHealth: () => Promise<void>;
  askCampusAi: (query: string) => Promise<GroundedCampusQAResponse>;
  adminCreateBusTrip: (input: CreateBusTripInput) => Promise<void>;
  adminDeleteBusTrip: (id: string) => Promise<void>;
  adminUpdateMessMeal: (input: UpdateMessMealInput) => Promise<void>;
  adminCreateService: (input: CreateCampusServiceInput) => Promise<void>;
  adminDeleteService: (id: string) => Promise<void>;
}

export const useCampusStore = create<CampusState>((set, get) => ({
  todaySummary: null,
  courses: [],
  timetableSlots: [],
  busSchedule: [],
  messMenu: [],
  services: [],
  freeSlots: [],
  campusHealth: null,
  moodleSyncStatus: null,
  qaHistory: [
    {
      id: 'welcome-campus-ai',
      query: 'What are the Kamand bus timings?',
      answer:
        'Electric buses run regularly between North Campus (Mind Tree, Pine, Cedar) and South Campus (A1, A2, Main Gate) starting from 07:30 until 22:30. Travel time through Kamand valley is approximately 18–22 minutes.',
      citations: [
        {
          title: 'IIT Mandi Transit & Electric Bus Schedule',
          sourceType: 'bus_schedule',
          reference: 'IIT Mandi Transport Desk Notification 2026/TR-04',
          snippet:
            'Regular electric buses run between North Campus (Mind Tree/Pine) and South Campus (A1/Main Gate) every 30 minutes from 07:30 to 22:30 on weekdays.',
        },
      ],
      confidence: 'high',
      timestamp: new Date().toISOString(),
    },
  ],

  isLoadingToday: false,
  isSyncingMoodle: false,
  isQueryingFreeSlots: false,
  isAskingQa: false,
  campusError: null,

  loadTodaySummary: async () => {
    set({ isLoadingToday: true, campusError: null });
    try {
      const summary = await apiFetch<CampusTodaySummaryDTO>('/api/campus/today');
      set({ todaySummary: summary, isLoadingToday: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load today dashboard';
      set({ isLoadingToday: false, campusError: msg });
    }
  },

  loadCourses: async () => {
    try {
      const res = await apiFetch<{ courses: CourseDTO[] }>('/api/campus/courses');
      set({ courses: res.courses });
    } catch {
      // Ignore offline error
    }
  },

  syncMoodle: async () => {
    set({ isSyncingMoodle: true });
    try {
      const res = await apiFetch<MoodleSyncResponse>('/api/campus/courses/sync-moodle', {
        method: 'POST',
      });
      set({ moodleSyncStatus: res, isSyncingMoodle: false });
      void get().loadCourses();
      void get().loadTodaySummary();
      return res;
    } catch (err) {
      set({ isSyncingMoodle: false });
      throw err;
    }
  },

  enrollInCourse: async (courseId: string) => {
    await apiFetch('/api/campus/courses/enroll', {
      method: 'POST',
      body: JSON.stringify({ courseId }),
    });
    void get().loadCourses();
    void get().loadTimetable();
    void get().loadTodaySummary();
  },

  loadTimetable: async () => {
    try {
      const res = await apiFetch<{ slots: TimetableSlotDTO[] }>('/api/campus/timetable');
      set({ timetableSlots: res.slots });
    } catch {
      // Ignore offline error
    }
  },

  queryFreeSlots: async (query: FreeSlotQuery) => {
    set({ isQueryingFreeSlots: true });
    try {
      const res = await apiFetch<{ freeSlots: FreeSlotDTO[] }>('/api/campus/timetable/free-slots', {
        method: 'POST',
        body: JSON.stringify(query),
      });
      set({ freeSlots: res.freeSlots, isQueryingFreeSlots: false });
      return res.freeSlots;
    } catch (err) {
      set({ isQueryingFreeSlots: false });
      throw err;
    }
  },

  loadBusSchedule: async () => {
    try {
      const res = await apiFetch<{ schedule: BusTripDTO[] }>('/api/campus/bus');
      set({ busSchedule: res.schedule });
    } catch {
      // Ignore offline error
    }
  },

  loadMessMenu: async (hostelName?: string) => {
    try {
      const qs = hostelName ? `?hostel=${encodeURIComponent(hostelName)}` : '';
      const res = await apiFetch<{ menu: MessMealDTO[] }>(`/api/campus/mess${qs}`);
      set({ messMenu: res.menu });
    } catch {
      // Ignore offline error
    }
  },

  loadServices: async (category?: string) => {
    try {
      const qs = category ? `?category=${encodeURIComponent(category)}` : '';
      const res = await apiFetch<{ services: CampusServiceDTO[] }>(`/api/campus/services${qs}`);
      set({ services: res.services });
    } catch {
      // Ignore offline error
    }
  },

  loadHealth: async () => {
    try {
      const res = await apiFetch<CampusHealthSummary>('/api/campus/health');
      set({ campusHealth: res });
    } catch {
      // Ignore offline error
    }
  },

  askCampusAi: async (query: string) => {
    set({ isAskingQa: true });
    try {
      const res = await apiFetch<GroundedCampusQAResponse>('/api/campus/ask', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
      const turn: CampusQaTurn = {
        id: crypto.randomUUID(),
        query: res.query,
        answer: res.answer,
        citations: res.citations,
        confidence: res.confidence,
        timestamp: res.timestamp,
      };
      set((prev) => ({
        qaHistory: [...prev.qaHistory, turn],
        isAskingQa: false,
      }));
      return res;
    } catch (err) {
      set({ isAskingQa: false });
      throw err;
    }
  },

  adminCreateBusTrip: async (input: CreateBusTripInput) => {
    await apiFetch('/api/campus/bus', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    void get().loadBusSchedule();
    void get().loadTodaySummary();
  },

  adminDeleteBusTrip: async (id: string) => {
    await apiFetch(`/api/campus/bus/${id}`, {
      method: 'DELETE',
    });
    void get().loadBusSchedule();
    void get().loadTodaySummary();
  },

  adminUpdateMessMeal: async (input: UpdateMessMealInput) => {
    await apiFetch('/api/campus/mess', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    void get().loadMessMenu(input.hostelName);
    void get().loadTodaySummary();
  },

  adminCreateService: async (input: CreateCampusServiceInput) => {
    await apiFetch('/api/campus/services', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    void get().loadServices();
    void get().loadTodaySummary();
  },

  adminDeleteService: async (id: string) => {
    await apiFetch(`/api/campus/services/${id}`, {
      method: 'DELETE',
    });
    void get().loadServices();
    void get().loadTodaySummary();
  },
}));
