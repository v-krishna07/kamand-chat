import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from './api.js';
import type {
  MessageDTO,
  ConversationSummary,
  WsSendMessagePayload,
  WsSendMessageAck,
  WsSyncResumeAck,
  WsTypingUpdateEvent,
  ContactDTO,
  StatusDTO,
  StatusViewDTO,
  WsCallInitiatePayload,
  WsCallResponsePayload,
  WsCallSignalPayload,
  CallStatus,
  ReactionDTO,
} from '@kamand/shared';

export interface IncomingCallEvent {
  callId: string;
  conversationId: string;
  initiatorId: string;
  initiatorName: string;
  mediaType: 'audio' | 'video';
  isGroup: boolean;
  e2eeKeyMaterial: string;
  keyGeneration: number;
}

export interface CallSignalEvent {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromDisplayName: string;
  signalType: 'offer' | 'answer' | 'ice-candidate' | 'media-state' | 'e2ee-key';
  sdp?: string;
  candidate?: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  };
  mediaState?: {
    isMuted: boolean;
    isCameraOff: boolean;
    isScreenSharing: boolean;
  };
  e2eeKeyMaterial?: string;
  keyGeneration?: number;
}

class SocketManager {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private connectionListeners = new Set<(state: 'connected' | 'connecting' | 'offline') => void>();
  public state: 'connected' | 'connecting' | 'offline' = 'offline';

  public onStateChange(cb: (state: 'connected' | 'connecting' | 'offline') => void): () => void {
    this.connectionListeners.add(cb);
    cb(this.state);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }

  private setState(next: 'connected' | 'connecting' | 'offline'): void {
    this.state = next;
    for (const cb of this.connectionListeners) {
      cb(next);
    }
  }

  public connect(handlers: {
    onNewMessage: (msg: MessageDTO) => void;
    onMessageStatus: (ev: {
      conversationId: string;
      messageId: string;
      seq: number;
      status: 'delivered' | 'read';
    }) => void;
    onConversationRead: (ev: { conversationId: string; readerId: string; upToSeq: number }) => void;
    onConversationUpsert: (conv: ConversationSummary) => void;
    onPresenceUpdate: (ev: { userId: string; isOnline: boolean; lastSeenAt: string }) => void;
    onTypingUpdate: (ev: WsTypingUpdateEvent) => void;
    onContactEvent?: () => void;
    onStatusNew?: (status: StatusDTO) => void;
    onStatusViewed?: (ev: { statusId: string; view: StatusViewDTO }) => void;
    onCallIncoming?: (ev: IncomingCallEvent) => void;
    onCallParticipantJoined?: (ev: {
      callId: string;
      conversationId: string;
      userId: string;
      displayName: string;
      participants: string[];
    }) => void;
    onCallParticipantLeft?: (ev: {
      callId: string;
      conversationId: string;
      leftUserId: string;
      participants: string[];
      rotatedKeyGeneration: number;
      rotatedKeyMaterial: string;
    }) => void;
    onCallEnded?: (ev: {
      callId: string;
      conversationId: string;
      reason: string;
      byUserId: string;
    }) => void;
    onCallBusy?: (ev: { callId: string; conversationId: string; busyUserId: string }) => void;
    onCallSignal?: (ev: CallSignalEvent) => void;
    onMessageUpdated?: (ev: {
      conversationId: string;
      messageId: string;
      body?: string;
      reactions?: ReactionDTO[];
      isPinned?: boolean;
      editedAt?: string | null;
      deletedAt?: string | null;
    }) => void;
    onSessionForceLogout?: (ev: { reason: string }) => void;
    getCursors: () => Record<string, number>;
    onSyncResume: (missed: Record<string, MessageDTO[]>) => void;
    onFlushPending: () => void;
  }): void {
    if (this.socket) {
      this.disconnect();
    }

    this.setState('connecting');

    const socket = io(getApiBaseUrl(), {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: false,
    });

    this.socket = socket;

    socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.setState('connected');

      const cursors = handlers.getCursors();
      socket.emit('sync:resume', { cursors }, (ack: WsSyncResumeAck) => {
        if (ack?.ok && ack.missedMessages) {
          handlers.onSyncResume(ack.missedMessages);
        }
        handlers.onFlushPending();
      });
    });

    socket.on('message:new', (msg: MessageDTO) => {
      handlers.onNewMessage(msg);
    });

    socket.on('message:status', (ev) => {
      handlers.onMessageStatus(ev);
    });

    socket.on('conversation:read', (ev) => {
      handlers.onConversationRead(ev);
    });

    socket.on('conversation:upsert', (conv: ConversationSummary) => {
      handlers.onConversationUpsert(conv);
    });

    socket.on('presence:update', (ev) => {
      handlers.onPresenceUpdate(ev);
    });

    socket.on('typing:update', (ev: WsTypingUpdateEvent) => {
      handlers.onTypingUpdate(ev);
    });

    socket.on('contact:request', (_dto: ContactDTO) => {
      handlers.onContactEvent?.();
    });

    socket.on('contact:accepted', () => {
      handlers.onContactEvent?.();
    });

    socket.on('contact:declined', () => {
      handlers.onContactEvent?.();
    });

    socket.on('contact:updated', () => {
      handlers.onContactEvent?.();
    });

    socket.on('status:new', (status: StatusDTO) => {
      handlers.onStatusNew?.(status);
    });

    socket.on('status:viewed', (ev: { statusId: string; view: StatusViewDTO }) => {
      handlers.onStatusViewed?.(ev);
    });

    socket.on('call:incoming', (ev: IncomingCallEvent) => {
      handlers.onCallIncoming?.(ev);
    });

    socket.on('call:participant-joined', (ev) => {
      handlers.onCallParticipantJoined?.(ev);
    });

    socket.on('call:participant-left', (ev) => {
      handlers.onCallParticipantLeft?.(ev);
    });

    socket.on('call:ended', (ev) => {
      handlers.onCallEnded?.(ev);
    });

    socket.on('call:busy', (ev) => {
      handlers.onCallBusy?.(ev);
    });

    socket.on('call:signal', (ev: CallSignalEvent) => {
      handlers.onCallSignal?.(ev);
    });

    socket.on('message:updated', (ev) => {
      handlers.onMessageUpdated?.(ev);
    });

    socket.on('session:force-logout', (ev: { reason: string }) => {
      handlers.onSessionForceLogout?.(ev);
      window.location.reload();
    });

    socket.on('disconnect', () => {
      this.setState('offline');
      this.scheduleReconnect();
    });

    socket.on('connect_error', () => {
      this.setState('offline');
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || !this.socket) return;
    this.reconnectAttempts += 1;
    const maxDelay = Math.min(15_000, 500 * Math.pow(2, Math.min(this.reconnectAttempts, 6)));
    const delayWithJitter = Math.floor(250 + Math.random() * maxDelay);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.socket && !this.socket.connected) {
        this.setState('connecting');
        this.socket.connect();
      }
    }, delayWithJitter);
  }

  public sendMessage(payload: WsSendMessagePayload): Promise<WsSendMessageAck> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        resolve({
          ok: false,
          code: 'INTERNAL_ERROR',
          error: 'Socket is offline',
        });
        return;
      }

      const timeout = window.setTimeout(() => {
        resolve({
          ok: false,
          code: 'INTERNAL_ERROR',
          error: 'Server acknowledgement timed out',
        });
      }, 6_000);

      this.socket.emit('message:send', payload, (ack: WsSendMessageAck) => {
        window.clearTimeout(timeout);
        resolve(ack);
      });
    });
  }

  public emitDelivered(conversationId: string, messageId: string, seq: number): void {
    this.socket?.emit('message:delivered', { conversationId, messageId, seq });
  }

  public emitRead(conversationId: string, seq: number): void {
    this.socket?.emit('message:read', { conversationId, seq });
  }

  public emitTyping(conversationId: string, isTyping: boolean): void {
    this.socket?.emit('typing:set', { conversationId, isTyping });
  }

  public initiateCall(
    payload: WsCallInitiatePayload
  ): Promise<{ ok: boolean; status?: CallStatus; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false, error: 'Offline' });
        return;
      }
      this.socket.emit('call:initiate', payload, (res: { ok: boolean; status?: CallStatus; error?: string }) =>
        resolve(res)
      );
    });
  }

  public acceptCall(
    payload: WsCallResponsePayload
  ): Promise<{ ok: boolean; participants?: string[]; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false, error: 'Offline' });
        return;
      }
      this.socket.emit(
        'call:accept',
        payload,
        (res: { ok: boolean; participants?: string[]; error?: string }) => resolve(res)
      );
    });
  }

  public declineCall(payload: WsCallResponsePayload): void {
    this.socket?.emit('call:decline', payload);
  }

  public hangupCall(payload: WsCallResponsePayload): void {
    this.socket?.emit('call:hangup', payload);
  }

  public timeoutCall(payload: WsCallResponsePayload): void {
    this.socket?.emit('call:timeout', payload);
  }

  public sendCallSignal(payload: WsCallSignalPayload): void {
    this.socket?.emit('call:signal', payload);
  }

  public reactToMessage(
    conversationId: string,
    messageId: string,
    emoji: string
  ): Promise<{ ok: boolean; reactions?: ReactionDTO[] }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false });
        return;
      }
      this.socket.emit('message:react', { conversationId, messageId, emoji }, (res: { ok: boolean; reactions?: ReactionDTO[] }) =>
        resolve(res ?? { ok: false })
      );
    });
  }

  public editMessage(
    conversationId: string,
    messageId: string,
    newBody: string
  ): Promise<{ ok: boolean; error?: string; message?: MessageDTO }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false, error: 'Socket is offline' });
        return;
      }
      this.socket.emit('message:edit', { conversationId, messageId, newBody }, (res: { ok: boolean; error?: string; message?: MessageDTO }) =>
        resolve(res ?? { ok: false, error: 'No response' })
      );
    });
  }

  public deleteMessage(
    conversationId: string,
    messageId: string,
    mode: 'for_me' | 'for_everyone'
  ): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false, error: 'Socket is offline' });
        return;
      }
      this.socket.emit('message:delete', { conversationId, messageId, mode }, (res: { ok: boolean; error?: string }) =>
        resolve(res ?? { ok: false, error: 'No response' })
      );
    });
  }

  public pinStarMessage(
    conversationId: string,
    messageId: string,
    action: 'pin' | 'unpin' | 'star' | 'unstar'
  ): Promise<{ ok: boolean; isPinned?: boolean; isStarred?: boolean }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false });
        return;
      }
      this.socket.emit('message:pin-star', { conversationId, messageId, action }, (res: { ok: boolean; isPinned?: boolean; isStarred?: boolean }) =>
        resolve(res ?? { ok: false })
      );
    });
  }

  public disconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.setState('offline');
  }
}

export const socketManager = new SocketManager();
