import { create } from 'zustand';
import type {
  AiAction,
  AiAssistResponse,
  AiContextMessage,
  AiExtractedTask,
  AiUserPreferences,
} from '@kamand/shared';
import { apiFetch, getApiBaseUrl, getCsrfToken } from '../lib/api.js';

const AI_PREFS_STORAGE_KEY = 'kamand_ai_user_prefs_v1';

export interface PrivateAiTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

interface AiState {
  preferences: AiUserPreferences;
  provider: string;
  remainingBudget: number;
  isRunning: boolean;
  isStreaming: boolean;
  streamedText: string;
  lastResponse: AiAssistResponse | null;
  smartReplies: string[];
  extractedTasks: AiExtractedTask[];
  privateHistory: PrivateAiTurn[];
  aiError: string | null;

  loadBudget: () => Promise<void>;
  updatePreferences: (patch: Partial<AiUserPreferences>) => void;
  runAssistWithConsent: (params: {
    action: AiAction;
    selectedMessages: AiContextMessage[];
    prompt?: string;
    targetLanguage?: string;
    rewriteTone?: 'concise' | 'friendly' | 'academic' | 'formal' | 'hinglish';
  }) => Promise<AiAssistResponse>;
  streamAssistWithConsent: (params: {
    action: AiAction;
    selectedMessages: AiContextMessage[];
    prompt?: string;
  }) => Promise<string>;
  cancelActiveStream: () => void;
  sendPrivateAskAi: (question: string) => Promise<void>;
  clearAiOutput: () => void;
}

let activeStreamAbortController: AbortController | null = null;

function loadStoredPreferences(): AiUserPreferences {
  try {
    const raw = localStorage.getItem(AI_PREFS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as AiUserPreferences;
    }
  } catch {
    // Ignore storage parse error
  }
  return {
    preferredLanguage: 'English',
    defaultTone: 'concise',
    customContextNote: 'B.Tech student at IIT Mandi',
  };
}

export const useAiStore = create<AiState>((set, get) => ({
  preferences: loadStoredPreferences(),
  provider: 'kamand-campus-llm',
  remainingBudget: 25_000,
  isRunning: false,
  isStreaming: false,
  streamedText: '',
  lastResponse: null,
  smartReplies: [],
  extractedTasks: [],
  privateHistory: [
    {
      id: 'welcome-ai',
      role: 'assistant',
      text: 'Namaste! I am your private, opt-in Kamand AI assistant. Because your chats are end-to-end encrypted, I never see any conversation unless you explicitly preview and share selected messages with me.',
      createdAt: new Date().toISOString(),
    },
  ],
  aiError: null,

  clearAiOutput: () =>
    set({
      streamedText: '',
      lastResponse: null,
      smartReplies: [],
      extractedTasks: [],
      aiError: null,
    }),

  loadBudget: async () => {
    try {
      const res = await apiFetch<{
        provider: string;
        remainingBudget: number;
      }>('/api/ai/budget');
      set({
        provider: res.provider,
        remainingBudget: res.remainingBudget,
      });
    } catch {
      // Ignore offline error
    }
  },

  updatePreferences: (patch) => {
    const next: AiUserPreferences = { ...get().preferences, ...patch };
    try {
      localStorage.setItem(AI_PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
    set({ preferences: next });
  },

  runAssistWithConsent: async ({
    action,
    selectedMessages,
    prompt = '',
    targetLanguage = 'Hindi',
    rewriteTone = 'concise',
  }) => {
    set({ isRunning: true, aiError: null });
    try {
      const res = await apiFetch<AiAssistResponse>('/api/ai/assist', {
        method: 'POST',
        body: JSON.stringify({
          action,
          explicitConsent: true,
          prompt,
          targetLanguage,
          rewriteTone,
          selectedMessages,
          preferences: get().preferences,
        }),
      });

      set({
        isRunning: false,
        lastResponse: res,
        streamedText: res.outputText,
        smartReplies: res.smartReplies ?? [],
        extractedTasks: res.extractedTasks ?? [],
        remainingBudget: res.remainingBudget,
        provider: res.provider,
      });
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI request failed';
      set({ isRunning: false, aiError: msg });
      throw err;
    }
  },

  streamAssistWithConsent: async ({ action, selectedMessages, prompt = '' }) => {
    if (activeStreamAbortController) {
      activeStreamAbortController.abort();
    }
    const controller = new AbortController();
    activeStreamAbortController = controller;

    set({
      isStreaming: true,
      streamedText: '',
      aiError: null,
    });

    try {
      const csrf = getCsrfToken();
      const response = await fetch(`${getApiBaseUrl()}/api/ai/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({
          action,
          explicitConsent: true,
          prompt,
          selectedMessages,
          preferences: get().preferences,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Stream failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const rawChunk = decoder.decode(value, { stream: true });
        const events = rawChunk.split('\n\n').filter(Boolean);

        for (const evLine of events) {
          if (!evLine.startsWith('data: ')) continue;
          const payload = JSON.parse(evLine.slice(6)) as {
            type: 'chunk' | 'done' | 'error';
            chunk?: string;
            fullText?: string;
            remainingBudget?: number;
            error?: string;
          };

          if (payload.type === 'chunk' && payload.chunk) {
            fullText += payload.chunk;
            set({ streamedText: fullText });
          } else if (payload.type === 'done') {
            if (typeof payload.remainingBudget === 'number') {
              set({ remainingBudget: payload.remainingBudget });
            }
          } else if (payload.type === 'error') {
            throw new Error(payload.error || 'Stream interrupted');
          }
        }
      }

      set({ isStreaming: false });
      activeStreamAbortController = null;
      return fullText;
    } catch (err) {
      activeStreamAbortController = null;
      if ((err as Error)?.name === 'AbortError') {
        set({ isStreaming: false, aiError: 'Stream cancelled by you.' });
        return get().streamedText;
      }
      const msg = err instanceof Error ? err.message : 'Streaming failed';
      set({ isStreaming: false, aiError: msg });
      throw err;
    }
  },

  cancelActiveStream: () => {
    if (activeStreamAbortController) {
      activeStreamAbortController.abort();
      activeStreamAbortController = null;
    }
    set({ isStreaming: false });
  },

  sendPrivateAskAi: async (question) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    const userTurn: PrivateAiTurn = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    set((prev) => ({
      privateHistory: [...prev.privateHistory, userTurn],
    }));

    const replyText = await get().streamAssistWithConsent({
      action: 'ask',
      prompt: trimmed,
      selectedMessages: [],
    });

    if (replyText) {
      set((prev) => ({
        privateHistory: [
          ...prev.privateHistory,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: replyText,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    }
  },
}));
