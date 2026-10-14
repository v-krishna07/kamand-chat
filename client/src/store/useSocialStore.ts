import { create } from 'zustand';
import type { ContactDTO, CreateStatusInput, StatusDTO, StatusViewDTO } from '@kamand/shared';
import { apiFetch } from '../lib/api.js';

interface SocialState {
  contacts: ContactDTO[];
  statuses: StatusDTO[];
  isLoadingContacts: boolean;
  isLoadingStatuses: boolean;
  socialError: string | null;

  loadContacts: () => Promise<void>;
  sendContactRequest: (identifier: string) => Promise<void>;
  respondToRequest: (contactId: string, action: 'accept' | 'decline') => Promise<void>;
  blockUser: (targetUserId: string) => Promise<void>;
  unblockUser: (targetUserId: string) => Promise<void>;

  loadStatuses: () => Promise<void>;
  createStatus: (input: CreateStatusInput) => Promise<void>;
  markStatusViewed: (statusId: string) => Promise<void>;
  deleteStatus: (statusId: string) => Promise<void>;
  handleRealtimeStatusNew: (status: StatusDTO) => void;
  handleRealtimeStatusViewed: (ev: { statusId: string; view: StatusViewDTO }) => void;
  clearSocialError: () => void;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  contacts: [],
  statuses: [],
  isLoadingContacts: false,
  isLoadingStatuses: false,
  socialError: null,

  clearSocialError: () => set({ socialError: null }),

  loadContacts: async () => {
    set({ isLoadingContacts: true });
    try {
      const res = await apiFetch<{ contacts: ContactDTO[] }>('/api/contacts');
      set({ contacts: res.contacts, isLoadingContacts: false });
    } catch {
      set({ isLoadingContacts: false });
    }
  },

  sendContactRequest: async (identifier) => {
    set({ socialError: null });
    try {
      await apiFetch('/api/contacts/request', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      await get().loadContacts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send contact request';
      set({ socialError: msg });
      throw err;
    }
  },

  respondToRequest: async (contactId, action) => {
    await apiFetch(`/api/contacts/${contactId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    await get().loadContacts();
  },

  blockUser: async (targetUserId) => {
    await apiFetch('/api/contacts/block', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
    await get().loadContacts();
  },

  unblockUser: async (targetUserId) => {
    await apiFetch(`/api/contacts/block/${targetUserId}`, {
      method: 'DELETE',
    });
    await get().loadContacts();
  },

  loadStatuses: async () => {
    set({ isLoadingStatuses: true });
    try {
      const res = await apiFetch<{ statuses: StatusDTO[] }>('/api/statuses');
      set({ statuses: res.statuses, isLoadingStatuses: false });
    } catch {
      set({ isLoadingStatuses: false });
    }
  },

  createStatus: async (input) => {
    const res = await apiFetch<{ status: StatusDTO }>('/api/statuses', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    set((prev) => ({
      statuses: [res.status, ...prev.statuses],
    }));
  },

  markStatusViewed: async (statusId) => {
    set((prev) => ({
      statuses: prev.statuses.map((s) => (s.id === statusId ? { ...s, hasViewed: true } : s)),
    }));
    await apiFetch(`/api/statuses/${statusId}/view`, { method: 'POST' }).catch(() => undefined);
  },

  deleteStatus: async (statusId) => {
    await apiFetch(`/api/statuses/${statusId}`, { method: 'DELETE' });
    set((prev) => ({
      statuses: prev.statuses.filter((s) => s.id !== statusId),
    }));
  },

  handleRealtimeStatusNew: (status) => {
    set((prev) => {
      if (prev.statuses.some((s) => s.id === status.id)) return prev;
      return { statuses: [status, ...prev.statuses] };
    });
  },

  handleRealtimeStatusViewed: ({ statusId, view }) => {
    set((prev) => ({
      statuses: prev.statuses.map((s) => {
        if (s.id !== statusId) return s;
        const existingViews = s.views ?? [];
        if (existingViews.some((v) => v.viewer.id === view.viewer.id)) return s;
        const updatedViews = [view, ...existingViews];
        return {
          ...s,
          viewCount: updatedViews.length,
          views: updatedViews,
        };
      }),
    }));
  },
}));
