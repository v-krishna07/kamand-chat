import { create } from 'zustand';
import type {
  ConnectorHealthDTO,
  ConnectMoodleInput,
  CreateCampusDatumInput,
  TimetableSlotInput,
} from '@kamand/shared';
import { apiFetch } from '../lib/api.js';

export interface CampusTodayPayload {
  studentProfile: {
    rollNumber: string | null;
    batchYear: number | null;
    academicYearLabel: string | null;
    suggestedChannels: string[];
  };
  moodle: {
    uiVisible: boolean;
    lastSyncAt: string | null;
    courses: Array<{
      id: number;
      shortname: string;
      fullname: string;
      instructor: string;
      roomCode: string;
      gradePercent: number;
      modules: Array<{ id: number; name: string; type: string }>;
    }>;
    deadlines: Array<{
      id: string;
      courseCode: string;
      title: string;
      type: string;
      dueAt: string;
    }>;
  };
  timetable: Array<{
    id: string;
    courseCode: string;
    courseTitle: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    roomCode: string;
  }>;
  weather: {
    location: string;
    temperatureC: number;
    condition: string;
    humidityPercent: number;
    windKmh: number;
  } | null;
  publicData: {
    uiVisible: boolean;
    messMenu: Array<{ id: string; title: string; subtitle: string; body: string; locationCode: string }>;
    buses: Array<{ id: string; title: string; subtitle: string; body: string; locationCode: string }>;
    notices: Array<{ id: string; title: string; subtitle: string; body: string; locationCode: string }>;
    helplines: Array<{ id: string; title: string; subtitle: string; body: string; locationCode: string }>;
    services: Array<{
      id: string;
      category: string;
      title: string;
      subtitle: string;
      body: string;
      locationCode: string;
      eventTime: string;
      upvotes: number;
    }>;
  };
}

interface CampusState {
  connectors: ConnectorHealthDTO[];
  today: CampusTodayPayload | null;
  freeSlots: string[];
  groundedAnswer: {
    found: boolean;
    answer: string;
    citations: Array<{ source: string; title: string }>;
  } | null;
  isLoadingCampus: boolean;

  loadCampusDashboard: () => Promise<void>;
  connectMoodle: (input: ConnectMoodleInput) => Promise<{ ok: boolean; degraded: boolean }>;
  disconnectConnector: (connectorId: string) => Promise<void>;
  retryConnectorProbe: (connectorId: string) => Promise<void>;
  addTimetableSlot: (input: TimetableSlotInput) => Promise<void>;
  loadFreeSlots: (day: string) => Promise<void>;
  createServiceItem: (input: CreateCampusDatumInput) => Promise<void>;
  upvoteServiceItem: (id: string) => Promise<void>;
  askGroundedCampusAi: (question: string) => Promise<void>;
}

export const useCampusStore = create<CampusState>((set, get) => ({
  connectors: [],
  today: null,
  freeSlots: [],
  groundedAnswer: null,
  isLoadingCampus: false,

  loadCampusDashboard: async () => {
    set({ isLoadingCampus: true });
    try {
      const [connRes, todayRes] = await Promise.all([
        apiFetch<{ connectors: ConnectorHealthDTO[] }>('/api/campus/connectors'),
        apiFetch<CampusTodayPayload>('/api/campus/today'),
      ]);
      set({
        connectors: connRes.connectors,
        today: todayRes,
        isLoadingCampus: false,
      });
    } catch {
      set({ isLoadingCampus: false });
    }
  },

  connectMoodle: async (input) => {
    const res = await apiFetch<{ ok: boolean; degraded: boolean }>(
      '/api/campus/connectors/moodle/connect',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    await get().loadCampusDashboard();
    return res;
  },

  disconnectConnector: async (connectorId) => {
    await apiFetch(`/api/campus/connectors/${connectorId}`, {
      method: 'DELETE',
    });
    await get().loadCampusDashboard();
  },

  retryConnectorProbe: async (connectorId) => {
    await apiFetch(`/api/campus/connectors/${connectorId}/probe`, {
      method: 'POST',
      body: JSON.stringify({ forceRetry: true }),
    });
    await get().loadCampusDashboard();
  },

  addTimetableSlot: async (input) => {
    await apiFetch('/api/campus/timetable', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await get().loadCampusDashboard();
  },

  loadFreeSlots: async (day) => {
    const res = await apiFetch<{ freeSlots: string[] }>(
      `/api/campus/timetable/free-slots?day=${encodeURIComponent(day)}`
    );
    set({ freeSlots: res.freeSlots });
  },

  createServiceItem: async (input) => {
    await apiFetch('/api/campus/services', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await get().loadCampusDashboard();
  },

  upvoteServiceItem: async (id) => {
    await apiFetch(`/api/campus/services/${id}/upvote`, { method: 'POST' });
    await get().loadCampusDashboard();
  },

  askGroundedCampusAi: async (question) => {
    const res = await apiFetch<{
      found: boolean;
      answer: string;
      citations: Array<{ source: string; title: string }>;
    }>('/api/campus/ask-grounded', {
      method: 'POST',
      body: JSON.stringify({ question, includePersonalConsentedData: true }),
    });
    set({ groundedAnswer: res });
  },
}));
