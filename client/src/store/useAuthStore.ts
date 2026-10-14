import { create } from 'zustand';
import type { UserSummary, RegisterInput, LoginInput } from '@kamand/shared';
import { apiFetch, setCsrfToken } from '../lib/api.js';
import { socketManager } from '../lib/socket.js';

interface AuthState {
  user: UserSummary | null;
  isLoading: boolean;
  error: string | null;
  hydrateSession: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  clearError: () => set({ error: null }),

  hydrateSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiFetch<{ user: UserSummary; csrfToken: string }>('/api/auth/me');
      setCsrfToken(res.csrfToken);
      set({ user: res.user, isLoading: false });
    } catch {
      setCsrfToken(null);
      set({ user: null, isLoading: false });
    }
  },

  login: async (input) => {
    set({ error: null });
    try {
      const res = await apiFetch<{ user: UserSummary; csrfToken: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setCsrfToken(res.csrfToken);
      set({ user: res.user, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in';
      set({ error: message });
      throw err;
    }
  },

  register: async (input) => {
    set({ error: null });
    try {
      const res = await apiFetch<{ user: UserSummary; csrfToken: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setCsrfToken(res.csrfToken);
      set({ user: res.user, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create account';
      set({ error: message });
      throw err;
    }
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      socketManager.disconnect();
      setCsrfToken(null);
      set({ user: null, error: null });
    }
  },
}));
