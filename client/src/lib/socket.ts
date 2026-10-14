import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from './api.js';
import type {
  MessageDTO,
  ConversationSummary,
  WsSendMessagePayload,
  WsSendMessageAck,
  WsSyncResumeAck,
} from '@kamand/shared';

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
      reconnection: false, // Managed manually for explicit exponential backoff + full jitter
    });

    this.socket = socket;

    socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.setState('connected');

      // Immediately resume from last-seen sequence number per conversation
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
    // Exponential backoff with full jitter: random between 300ms and min(15000ms, 500 * 2^attempt)
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
