import { create } from 'zustand';
import type { ConversationSummary, MessageDTO, UserSummary } from '@kamand/shared';
import { apiFetch } from '../lib/api.js';
import { socketManager } from '../lib/socket.js';
import { useSocialStore } from './useSocialStore.js';
import { useCallStore } from './useCallStore.js';

interface PaginationMeta {
  nextCursor: number | null;
  hasMore: boolean;
  isLoadingOlder: boolean;
}

interface ChatState {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  messagesByConv: Record<string, MessageDTO[]>;
  paginationByConv: Record<string, PaginationMeta>;
  draftsByConv: Record<string, string>;
  replyTargetByConv: Record<string, MessageDTO | null>;
  typingUsersByConv: Record<string, Record<string, string>>; // convId -> { userId: displayName }
  connectionState: 'connected' | 'connecting' | 'offline';
  isLoadingConversations: boolean;

  initRealtime: (currentUser: UserSummary) => () => void;
  loadConversations: () => Promise<void>;
  selectConversation: (conversationId: string | null, currentUserId: string) => Promise<void>;
  startDirectConversation: (targetUserId: string, currentUserId: string) => Promise<string>;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, body: string, currentUser: UserSummary) => Promise<void>;
  retryMessage: (conversationId: string, messageId: string, currentUser: UserSummary) => Promise<void>;
  setDraft: (conversationId: string, text: string) => void;
  setReplyTarget: (conversationId: string, target: MessageDTO | null) => void;
  notifyTyping: (conversationId: string, isTyping: boolean) => void;
  reset: () => void;
}

export function mergeConversationMessages(
  existing: MessageDTO[],
  incoming: MessageDTO[]
): MessageDTO[] {
  const byId = new Map<string, MessageDTO>();
  for (const m of existing) {
    byId.set(m.id, m);
  }
  for (const m of incoming) {
    byId.set(m.id, m);
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messagesByConv: {},
  paginationByConv: {},
  draftsByConv: {},
  replyTargetByConv: {},
  typingUsersByConv: {},
  connectionState: 'offline',
  isLoadingConversations: false,

  reset: () => {
    useCallStore.getState().cleanupAllMediaAndConnections();
    set({
      conversations: [],
      activeConversationId: null,
      messagesByConv: {},
      paginationByConv: {},
      draftsByConv: {},
      replyTargetByConv: {},
      typingUsersByConv: {},
      connectionState: 'offline',
    });
  },

  setDraft: (conversationId, text) =>
    set((s) => ({
      draftsByConv: { ...s.draftsByConv, [conversationId]: text },
    })),

  setReplyTarget: (conversationId, target) =>
    set((s) => ({
      replyTargetByConv: { ...s.replyTargetByConv, [conversationId]: target },
    })),

  notifyTyping: (conversationId, isTyping) => {
    socketManager.emitTyping(conversationId, isTyping);
  },

  initRealtime: (currentUser) => {
    const unsubState = socketManager.onStateChange((connectionState) => {
      set({ connectionState });
    });

    socketManager.connect({
      getCursors: () => {
        const state = get();
        const cursors: Record<string, number> = {};
        for (const conv of state.conversations) {
          const list = state.messagesByConv[conv.id] ?? [];
          const highestServerSeq = list.reduce(
            (max, m) => (m.status !== 'sending' && m.status !== 'failed' && m.seq > max ? m.seq : max),
            conv.lastSeq
          );
          cursors[conv.id] = highestServerSeq;
        }
        return cursors;
      },

      onNewMessage: (msg) => {
        const state = get();
        const isCurrentActive = state.activeConversationId === msg.conversationId;
        const isFromOther = msg.senderId !== currentUser.id;

        if (isFromOther) {
          socketManager.emitDelivered(msg.conversationId, msg.id, msg.seq);
          if (isCurrentActive) {
            socketManager.emitRead(msg.conversationId, msg.seq);
          }
        }

        set((prev) => {
          const existingMsgs = prev.messagesByConv[msg.conversationId] ?? [];
          const updatedMsgs = mergeConversationMessages(existingMsgs, [
            {
              ...msg,
              status: isFromOther && isCurrentActive ? 'read' : msg.status,
            },
          ]);

          const updatedConvs = prev.conversations
            .map((c) => {
              if (c.id !== msg.conversationId) return c;
              const unreadCount =
                isFromOther && !isCurrentActive ? c.unreadCount + 1 : 0;
              return {
                ...c,
                lastSeq: Math.max(c.lastSeq, msg.seq),
                lastMessage: msg,
                unreadCount,
                updatedAt: msg.createdAt,
              };
            })
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

          return {
            messagesByConv: {
              ...prev.messagesByConv,
              [msg.conversationId]: updatedMsgs,
            },
            conversations: updatedConvs,
          };
        });
      },

      onMessageStatus: ({ conversationId, messageId, status }) => {
        set((prev) => {
          const list = prev.messagesByConv[conversationId];
          if (!list) return prev;
          return {
            messagesByConv: {
              ...prev.messagesByConv,
              [conversationId]: list.map((m) => (m.id === messageId ? { ...m, status } : m)),
            },
          };
        });
      },

      onConversationRead: ({ conversationId, readerId, upToSeq }) => {
        if (readerId === currentUser.id) return;
        set((prev) => {
          const list = prev.messagesByConv[conversationId];
          if (!list) return prev;
          return {
            messagesByConv: {
              ...prev.messagesByConv,
              [conversationId]: list.map((m) =>
                m.senderId === currentUser.id && m.seq <= upToSeq ? { ...m, status: 'read' } : m
              ),
            },
          };
        });
      },

      onConversationUpsert: (conv) => {
        set((prev) => {
          const exists = prev.conversations.some((c) => c.id === conv.id);
          const nextList = exists
            ? prev.conversations.map((c) => (c.id === conv.id ? conv : c))
            : [conv, ...prev.conversations];
          return {
            conversations: nextList.sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            ),
          };
        });
      },

      onPresenceUpdate: ({ userId, isOnline, lastSeenAt }) => {
        set((prev) => ({
          conversations: prev.conversations.map((c) => ({
            ...c,
            participants: c.participants.map((p) =>
              p.id === userId ? { ...p, isOnline, lastSeenAt } : p
            ),
          })),
        }));
      },

      onTypingUpdate: ({ conversationId, userId, displayName, isTyping }) => {
        if (userId === currentUser.id) return;
        set((prev) => {
          const currentMap = { ...(prev.typingUsersByConv[conversationId] ?? {}) };
          if (isTyping) {
            currentMap[userId] = displayName;
          } else {
            delete currentMap[userId];
          }
          return {
            typingUsersByConv: {
              ...prev.typingUsersByConv,
              [conversationId]: currentMap,
            },
          };
        });
      },

      onContactEvent: () => {
        void useSocialStore.getState().loadContacts();
        void get().loadConversations();
      },

      onStatusNew: (status) => {
        useSocialStore.getState().handleRealtimeStatusNew(status);
      },

      onStatusViewed: (ev) => {
        useSocialStore.getState().handleRealtimeStatusViewed(ev);
      },

      onCallIncoming: (ev) => {
        useCallStore.getState().handleIncomingCall(ev);
      },

      onCallParticipantJoined: (ev) => {
        void useCallStore.getState().handleParticipantJoined(ev);
      },

      onCallParticipantLeft: (ev) => {
        useCallStore.getState().handleParticipantLeft(ev);
      },

      onCallEnded: (ev) => {
        useCallStore.getState().handleCallEnded(ev);
      },

      onCallBusy: (ev) => {
        useCallStore.getState().handleCallBusy(ev);
      },

      onCallSignal: (ev) => {
        void useCallStore.getState().handleCallSignal(ev);
      },

      onSyncResume: (missedByConv) => {
        set((prev) => {
          const nextMessagesByConv = { ...prev.messagesByConv };
          for (const [convId, missed] of Object.entries(missedByConv)) {
            const existing = nextMessagesByConv[convId] ?? [];
            nextMessagesByConv[convId] = mergeConversationMessages(existing, missed);
          }
          return { messagesByConv: nextMessagesByConv };
        });
        void get().loadConversations();
      },

      onFlushPending: () => {
        const state = get();
        for (const [convId, msgs] of Object.entries(state.messagesByConv)) {
          for (const m of msgs) {
            if (m.status === 'sending' && m.senderId === currentUser.id) {
              void get().retryMessage(convId, m.id, currentUser);
            }
          }
        }
      },
    });

    return () => {
      unsubState();
      useCallStore.getState().cleanupAllMediaAndConnections();
      socketManager.disconnect();
    };
  },

  loadConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const res = await apiFetch<{ conversations: ConversationSummary[] }>('/api/conversations');
      set({ conversations: res.conversations, isLoadingConversations: false });
    } catch {
      set({ isLoadingConversations: false });
    }
  },

  selectConversation: async (conversationId, currentUserId) => {
    set({ activeConversationId: conversationId });
    if (!conversationId) return;

    const existing = get().messagesByConv[conversationId];
    if (!existing) {
      const res = await apiFetch<{
        messages: MessageDTO[];
        nextCursor: number | null;
        hasMore: boolean;
      }>(`/api/conversations/${conversationId}/messages?limit=40`);

      set((prev) => ({
        messagesByConv: {
          ...prev.messagesByConv,
          [conversationId]: mergeConversationMessages(prev.messagesByConv[conversationId] ?? [], res.messages),
        },
        paginationByConv: {
          ...prev.paginationByConv,
          [conversationId]: {
            nextCursor: res.nextCursor,
            hasMore: res.hasMore,
            isLoadingOlder: false,
          },
        },
      }));
    }

    const latestMessages = get().messagesByConv[conversationId] ?? [];
    const lastMsg = latestMessages[latestMessages.length - 1];
    if (lastMsg && lastMsg.seq > 0) {
      socketManager.emitRead(conversationId, lastMsg.seq);
      set((prev) => ({
        conversations: prev.conversations.map((c) =>
          c.id === conversationId ? { ...c, unreadCount: 0, lastReadSeq: lastMsg.seq } : c
        ),
        messagesByConv: {
          ...prev.messagesByConv,
          [conversationId]: (prev.messagesByConv[conversationId] ?? []).map((m) =>
            m.senderId !== currentUserId ? { ...m, status: 'read' } : m
          ),
        },
      }));
    }
  },

  startDirectConversation: async (targetUserId, currentUserId) => {
    const res = await apiFetch<{ conversation: ConversationSummary }>('/api/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
    const conv = res.conversation;
    set((prev) => {
      const exists = prev.conversations.some((c) => c.id === conv.id);
      const next = exists
        ? prev.conversations.map((c) => (c.id === conv.id ? conv : c))
        : [conv, ...prev.conversations];
      return { conversations: next };
    });
    await get().selectConversation(conv.id, currentUserId);
    return conv.id;
  },

  loadOlderMessages: async (conversationId) => {
    const meta = get().paginationByConv[conversationId];
    if (!meta || !meta.hasMore || meta.isLoadingOlder || !meta.nextCursor) return;

    set((prev) => ({
      paginationByConv: {
        ...prev.paginationByConv,
        [conversationId]: { ...meta, isLoadingOlder: true },
      },
    }));

    try {
      const res = await apiFetch<{
        messages: MessageDTO[];
        nextCursor: number | null;
        hasMore: boolean;
      }>(`/api/conversations/${conversationId}/messages?limit=40&beforeSeq=${meta.nextCursor}`);

      set((prev) => ({
        messagesByConv: {
          ...prev.messagesByConv,
          [conversationId]: mergeConversationMessages(
            res.messages,
            prev.messagesByConv[conversationId] ?? []
          ),
        },
        paginationByConv: {
          ...prev.paginationByConv,
          [conversationId]: {
            nextCursor: res.nextCursor,
            hasMore: res.hasMore,
            isLoadingOlder: false,
          },
        },
      }));
    } catch {
      set((prev) => ({
        paginationByConv: {
          ...prev.paginationByConv,
          [conversationId]: { ...meta, isLoadingOlder: false },
        },
      }));
    }
  },

  sendMessage: async (conversationId, rawBody, currentUser) => {
    const body = rawBody.trim();
    if (!body) return;

    const clientId = crypto.randomUUID();
    const replyTarget = get().replyTargetByConv[conversationId] ?? null;
    const currentMsgs = get().messagesByConv[conversationId] ?? [];
    const maxSeq = currentMsgs.reduce((acc, m) => Math.max(acc, m.seq), 0);

    const optimisticMsg: MessageDTO = {
      id: clientId,
      conversationId,
      senderId: currentUser.id,
      sender: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
      },
      body,
      ciphertext: null,
      nonce: null,
      type: 'text',
      replyToId: replyTarget?.id ?? null,
      replyToPreview: replyTarget
        ? {
            id: replyTarget.id,
            senderName: replyTarget.sender.displayName,
            body: replyTarget.body.slice(0, 120),
          }
        : null,
      seq: maxSeq + 100_000,
      threadRootId: null,
      threadReplyCount: 0,
      status: 'sending',
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    set((prev) => ({
      messagesByConv: {
        ...prev.messagesByConv,
        [conversationId]: [...(prev.messagesByConv[conversationId] ?? []), optimisticMsg],
      },
      draftsByConv: { ...prev.draftsByConv, [conversationId]: '' },
      replyTargetByConv: { ...prev.replyTargetByConv, [conversationId]: null },
    }));

    const ack = await socketManager.sendMessage({
      id: clientId,
      conversationId,
      body,
      type: 'text',
      replyToId: replyTarget?.id ?? null,
    });

    if (ack.ok) {
      set((prev) => ({
        messagesByConv: {
          ...prev.messagesByConv,
          [conversationId]: mergeConversationMessages(
            (prev.messagesByConv[conversationId] ?? []).filter((m) => m.id !== clientId),
            [ack.message]
          ),
        },
        conversations: prev.conversations
          .map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  lastSeq: Math.max(c.lastSeq, ack.message.seq),
                  lastMessage: ack.message,
                  updatedAt: ack.message.createdAt,
                }
              : c
          )
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      }));
    } else {
      set((prev) => ({
        messagesByConv: {
          ...prev.messagesByConv,
          [conversationId]: (prev.messagesByConv[conversationId] ?? []).map((m) =>
            m.id === clientId ? { ...m, status: 'failed' } : m
          ),
        },
      }));
    }
  },

  retryMessage: async (conversationId, messageId, _currentUser) => {
    const target = (get().messagesByConv[conversationId] ?? []).find((m) => m.id === messageId);
    if (!target) return;

    set((prev) => ({
      messagesByConv: {
        ...prev.messagesByConv,
        [conversationId]: (prev.messagesByConv[conversationId] ?? []).map((m) =>
          m.id === messageId ? { ...m, status: 'sending' } : m
        ),
      },
    }));

    const ack = await socketManager.sendMessage({
      id: target.id,
      conversationId,
      body: target.body,
      type: target.type,
      replyToId: target.replyToId,
    });

    if (ack.ok) {
      set((prev) => ({
        messagesByConv: {
          ...prev.messagesByConv,
          [conversationId]: mergeConversationMessages(
            (prev.messagesByConv[conversationId] ?? []).filter((m) => m.id !== messageId),
            [ack.message]
          ),
        },
      }));
    } else {
      set((prev) => ({
        messagesByConv: {
          ...prev.messagesByConv,
          [conversationId]: (prev.messagesByConv[conversationId] ?? []).map((m) =>
            m.id === messageId ? { ...m, status: 'failed' } : m
          ),
        },
      }));
    }
  },
}));
