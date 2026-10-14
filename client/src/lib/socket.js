import { io } from 'socket.io-client';
import { getApiBaseUrl } from './api.js';
class SocketManager {
    socket = null;
    reconnectAttempts = 0;
    reconnectTimer = null;
    connectionListeners = new Set();
    state = 'offline';
    onStateChange(cb) {
        this.connectionListeners.add(cb);
        cb(this.state);
        return () => {
            this.connectionListeners.delete(cb);
        };
    }
    setState(next) {
        this.state = next;
        for (const cb of this.connectionListeners) {
            cb(next);
        }
    }
    connect(handlers) {
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
            socket.emit('sync:resume', { cursors }, (ack) => {
                if (ack?.ok && ack.missedMessages) {
                    handlers.onSyncResume(ack.missedMessages);
                }
                handlers.onFlushPending();
            });
        });
        socket.on('message:new', (msg) => {
            handlers.onNewMessage(msg);
        });
        socket.on('message:status', (ev) => {
            handlers.onMessageStatus(ev);
        });
        socket.on('conversation:read', (ev) => {
            handlers.onConversationRead(ev);
        });
        socket.on('conversation:upsert', (conv) => {
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
    scheduleReconnect() {
        if (this.reconnectTimer !== null || !this.socket)
            return;
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
    sendMessage(payload) {
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
            this.socket.emit('message:send', payload, (ack) => {
                window.clearTimeout(timeout);
                resolve(ack);
            });
        });
    }
    emitDelivered(conversationId, messageId, seq) {
        this.socket?.emit('message:delivered', { conversationId, messageId, seq });
    }
    emitRead(conversationId, seq) {
        this.socket?.emit('message:read', { conversationId, seq });
    }
    disconnect() {
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
