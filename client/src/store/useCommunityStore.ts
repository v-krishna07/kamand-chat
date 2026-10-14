import { create } from 'zustand';
import type {
  CommunityDTO,
  CommunityMemberDTO,
  CommunityRole,
  CreateCommunityInput,
  CreateChannelInput,
  InviteDTO,
  JoinRequestDTO,
  MessageDTO,
} from '@kamand/shared';
import { apiFetch } from '../lib/api.js';

interface ThreadViewData {
  rootMessage: MessageDTO;
  replies: MessageDTO[];
  isLoading: boolean;
}

interface CommunityState {
  communities: CommunityDTO[];
  activeCommunityId: string | null;
  activeChannelId: string | null;
  membersByComm: Record<string, CommunityMemberDTO[]>;
  joinRequestsByComm: Record<string, JoinRequestDTO[]>;
  activeThread: ThreadViewData | null;
  lastCreatedInvite: InviteDTO | null;
  isLoadingCommunities: boolean;

  loadCommunities: () => Promise<void>;
  selectCommunity: (communityId: string) => void;
  selectChannel: (channelId: string | null) => void;
  createCommunity: (input: CreateCommunityInput) => Promise<void>;
  createCategory: (communityId: string, name: string) => Promise<void>;
  reorderCategories: (communityId: string, orderedCategoryIds: string[]) => Promise<void>;
  createChannel: (communityId: string, input: CreateChannelInput) => Promise<void>;
  reorderChannels: (
    communityId: string,
    categoryId: string,
    orderedChannelIds: string[]
  ) => Promise<void>;
  updateChannel: (
    channelId: string,
    patch: { topic?: string; isPinned?: boolean; isArchived?: boolean }
  ) => Promise<void>;
  setChannelOverride: (
    channelId: string,
    role: CommunityRole,
    canView: boolean,
    canSend: boolean
  ) => Promise<void>;
  loadMembers: (communityId: string) => Promise<void>;
  updateMemberRole: (
    communityId: string,
    targetUserId: string,
    role: CommunityRole
  ) => Promise<void>;
  updateMyPreferences: (
    communityId: string,
    prefs: { isMuted?: boolean; isPinned?: boolean; isArchived?: boolean }
  ) => Promise<void>;
  createInvite: (communityId: string, maxUses?: number | null) => Promise<InviteDTO>;
  joinByInviteCode: (code: string) => Promise<void>;
  submitJoinRequest: (communityId: string, note: string) => Promise<void>;
  loadJoinRequests: (communityId: string) => Promise<void>;
  respondJoinRequest: (
    communityId: string,
    requestId: string,
    action: 'approve' | 'reject'
  ) => Promise<void>;
  openThread: (rootMessageId: string) => Promise<void>;
  closeThread: () => void;
}

export const useCommunityStore = create<CommunityState>((set, get) => ({
  communities: [],
  activeCommunityId: null,
  activeChannelId: null,
  membersByComm: {},
  joinRequestsByComm: {},
  activeThread: null,
  lastCreatedInvite: null,
  isLoadingCommunities: false,

  loadCommunities: async () => {
    set({ isLoadingCommunities: true });
    try {
      const res = await apiFetch<{ communities: CommunityDTO[] }>('/api/communities');
      const currentActiveComm = get().activeCommunityId ?? res.communities[0]?.id ?? null;
      const commObj = res.communities.find((c) => c.id === currentActiveComm) ?? null;
      const firstChannelId =
        get().activeChannelId ?? commObj?.categories[0]?.channels[0]?.id ?? null;

      set({
        communities: res.communities,
        activeCommunityId: currentActiveComm,
        activeChannelId: firstChannelId,
        isLoadingCommunities: false,
      });
    } catch {
      set({ isLoadingCommunities: false });
    }
  },

  selectCommunity: (communityId) => {
    const comm = get().communities.find((c) => c.id === communityId);
    const firstChannelId = comm?.categories[0]?.channels[0]?.id ?? null;
    set({
      activeCommunityId: communityId,
      activeChannelId: firstChannelId,
      activeThread: null,
    });
  },

  selectChannel: (channelId) => {
    set({ activeChannelId: channelId, activeThread: null });
  },

  createCommunity: async (input) => {
    const res = await apiFetch<{ community: CommunityDTO }>('/api/communities', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const comm = res.community;
    set((prev) => ({
      communities: [...prev.communities, comm],
      activeCommunityId: comm.id,
      activeChannelId: comm.categories[0]?.channels[0]?.id ?? null,
    }));
  },

  createCategory: async (communityId, name) => {
    const res = await apiFetch<{ community: CommunityDTO }>(
      `/api/communities/${communityId}/categories`,
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      }
    );
    set((prev) => ({
      communities: prev.communities.map((c) => (c.id === communityId ? res.community : c)),
    }));
  },

  reorderCategories: async (communityId, orderedCategoryIds) => {
    // Optimistic spring reorder
    set((prev) => ({
      communities: prev.communities.map((c) => {
        if (c.id !== communityId) return c;
        const map = new Map(c.categories.map((cat) => [cat.id, cat]));
        const reordered = orderedCategoryIds
          .map((id, idx) => {
            const item = map.get(id);
            return item ? { ...item, position: idx } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        return { ...c, categories: reordered };
      }),
    }));

    const res = await apiFetch<{ community: CommunityDTO }>(
      `/api/communities/${communityId}/categories/reorder`,
      {
        method: 'PUT',
        body: JSON.stringify({ orderedCategoryIds }),
      }
    );
    set((prev) => ({
      communities: prev.communities.map((c) => (c.id === communityId ? res.community : c)),
    }));
  },

  createChannel: async (communityId, input) => {
    const res = await apiFetch<{ community: CommunityDTO; channelId: string }>(
      `/api/communities/${communityId}/channels`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    set((prev) => ({
      communities: prev.communities.map((c) => (c.id === communityId ? res.community : c)),
      activeChannelId: res.channelId,
    }));
  },

  reorderChannels: async (communityId, categoryId, orderedChannelIds) => {
    // Optimistic spring reorder
    set((prev) => ({
      communities: prev.communities.map((c) => {
        if (c.id !== communityId) return c;
        return {
          ...c,
          categories: c.categories.map((cat) => {
            if (cat.id !== categoryId) return cat;
            const map = new Map(cat.channels.map((ch) => [ch.id, ch]));
            const reordered = orderedChannelIds
              .map((id, idx) => {
                const ch = map.get(id);
                return ch ? { ...ch, position: idx } : null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);
            return { ...cat, channels: reordered };
          }),
        };
      }),
    }));

    const res = await apiFetch<{ community: CommunityDTO }>(
      `/api/communities/${communityId}/channels/reorder`,
      {
        method: 'PUT',
        body: JSON.stringify({ categoryId, orderedChannelIds }),
      }
    );
    set((prev) => ({
      communities: prev.communities.map((c) => (c.id === communityId ? res.community : c)),
    }));
  },

  updateChannel: async (channelId, patch) => {
    const res = await apiFetch<{ community: CommunityDTO }>(
      `/api/communities/channels/${channelId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
    set((prev) => ({
      communities: prev.communities.map((c) =>
        c.id === res.community.id ? res.community : c
      ),
    }));
  },

  setChannelOverride: async (channelId, role, canView, canSend) => {
    const res = await apiFetch<{ community: CommunityDTO }>(
      `/api/communities/channels/${channelId}/overrides`,
      {
        method: 'PUT',
        body: JSON.stringify({ role, canView, canSend }),
      }
    );
    set((prev) => ({
      communities: prev.communities.map((c) =>
        c.id === res.community.id ? res.community : c
      ),
    }));
  },

  loadMembers: async (communityId) => {
    const res = await apiFetch<{ members: CommunityMemberDTO[] }>(
      `/api/communities/${communityId}/members`
    );
    set((prev) => ({
      membersByComm: { ...prev.membersByComm, [communityId]: res.members },
    }));
  },

  updateMemberRole: async (communityId, targetUserId, role) => {
    await apiFetch(`/api/communities/${communityId}/members/${targetUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    await get().loadMembers(communityId);
  },

  updateMyPreferences: async (communityId, prefs) => {
    const res = await apiFetch<{ community: CommunityDTO }>(
      `/api/communities/${communityId}/preferences`,
      {
        method: 'PATCH',
        body: JSON.stringify(prefs),
      }
    );
    set((prev) => ({
      communities: prev.communities.map((c) => (c.id === communityId ? res.community : c)),
    }));
  },

  createInvite: async (communityId, maxUses = null) => {
    const res = await apiFetch<{ invite: InviteDTO }>(
      `/api/communities/${communityId}/invites`,
      {
        method: 'POST',
        body: JSON.stringify({ expiresInHours: 168, maxUses }),
      }
    );
    set({ lastCreatedInvite: res.invite });
    return res.invite;
  },

  joinByInviteCode: async (code) => {
    const res = await apiFetch<{ community: CommunityDTO }>(
      `/api/communities/join/${encodeURIComponent(code.trim())}`,
      {
        method: 'POST',
      }
    );
    await get().loadCommunities();
    set({
      activeCommunityId: res.community.id,
      activeChannelId: res.community.categories[0]?.channels[0]?.id ?? null,
    });
  },

  submitJoinRequest: async (communityId, note) => {
    await apiFetch(`/api/communities/${communityId}/join-requests`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },

  loadJoinRequests: async (communityId) => {
    const res = await apiFetch<{ joinRequests: JoinRequestDTO[] }>(
      `/api/communities/${communityId}/join-requests`
    );
    set((prev) => ({
      joinRequestsByComm: { ...prev.joinRequestsByComm, [communityId]: res.joinRequests },
    }));
  },

  respondJoinRequest: async (communityId, requestId, action) => {
    await apiFetch(`/api/communities/join-requests/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    await get().loadJoinRequests(communityId);
    await get().loadMembers(communityId);
  },

  openThread: async (rootMessageId) => {
    set({
      activeThread: {
        rootMessage: {
          id: rootMessageId,
          conversationId: '',
          senderId: '',
          sender: { id: '', username: '', displayName: 'Loading…', avatarUrl: null },
          body: 'Loading thread…',
          ciphertext: null,
          nonce: null,
          type: 'text',
          replyToId: null,
          threadRootId: null,
          threadReplyCount: 0,
          seq: 1,
          status: 'sent',
          editedAt: null,
          deletedAt: null,
          createdAt: new Date().toISOString(),
        },
        replies: [],
        isLoading: true,
      },
    });

    const res = await apiFetch<{ rootMessage: MessageDTO; replies: MessageDTO[] }>(
      `/api/communities/threads/${rootMessageId}`
    );
    set({
      activeThread: {
        rootMessage: res.rootMessage,
        replies: res.replies,
        isLoading: false,
      },
    });
  },

  closeThread: () => set({ activeThread: null }),
}));
