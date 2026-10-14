import { create } from 'zustand';
import type { UserSummary, RegisterInput, LoginInput, UpdateProfileInput } from '@kamand/shared';
import { apiFetch, setCsrfToken } from '../lib/api.js';
import { socketManager } from '../lib/socket.js';

interface AuthState {
  user: UserSummary | null;
  qrPayload: string | null;
  isLoading: boolean;
  error: string | null;
  hydrateSession: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  qrPayload: null,
  isLoading: true,
  error: null,

  clearError: () => set({ error: null }),

  hydrateSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiFetch<{ user: UserSummary; csrfToken: string }>('/api/auth/me');
      setCsrfToken(res.csrfToken);
      set({
        user: res.user,
        qrPayload: `kamand://contact/${res.user.id}:${res.user.username}`,
        isLoading: false,
      });
    } catch {
      setCsrfToken(null);
      set({ user: null, qrPayload: null, isLoading: false });
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
      set({
        user: res.user,
        qrPayload: `kamand://contact/${res.user.id}:${res.user.username}`,
        error: null,
      });
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
      set({
        user: res.user,
        qrPayload: `kamand://contact/${res.user.id}:${res.user.username}`,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create account';
      set({ error: message });
      throw err;
    }
  },

  updateProfile: async (input) => {
    const res = await apiFetch<{ user: UserSummary }>('/api/profile/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    set({
      user: res.user,
      qrPayload: `kamand://contact/${res.user.id}:${res.user.username}`,
    });
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      socketManager.disconnect();
      setCsrfToken(null);
      set({ user: null, qrPayload: null, error: null });
    }
  },
}));
