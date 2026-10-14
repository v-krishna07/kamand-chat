import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  searchDecryptedMessages,
  updateDocumentUnreadBadge,
  triggerIncomingMessageNotification,
} from '../lib/notifications.js';

describe('Phase 9 Client Suite: Local Search, Title Unread Badge & Notifications', () => {
  beforeEach(() => {
    // Provide a lightweight document mock in node environment
    if (typeof globalThis.document === 'undefined') {
      (globalThis as unknown as { document: { title: string } }).document = {
        title: 'Kamand Chat · IIT Mandi',
      };
    } else {
      globalThis.document.title = 'Kamand Chat · IIT Mandi';
    }
  });

  it('1. Searches decrypted messages by body and sender display name (case-insensitive)', () => {
    const messages = [
      {
        id: '1',
        body: 'Meet me at North Campus Oak Mess near B-19',
        sender: { displayName: 'Aravind' },
      },
      {
        id: '2',
        body: 'Submitting assignment on Moodle',
        sender: { displayName: 'Rohit' },
      },
      {
        id: '3',
        body: 'Are the electric buses running to South Campus?',
        sender: { displayName: 'Priya Sharma' },
      },
    ];

    expect(searchDecryptedMessages(messages, 'oak')).toHaveLength(1);
    expect(searchDecryptedMessages(messages, 'oak')[0]!.id).toBe('1');

    expect(searchDecryptedMessages(messages, 'priya')).toHaveLength(1);
    expect(searchDecryptedMessages(messages, 'priya')[0]!.id).toBe('3');

    expect(searchDecryptedMessages(messages, 'campus')).toHaveLength(2);
    expect(searchDecryptedMessages(messages, '')).toHaveLength(0);
  });

  it('2. Dynamically updates document title with unread badge', () => {
    updateDocumentUnreadBadge(5);
    expect(globalThis.document.title).toBe('(5) Kamand Chat · IIT Mandi');

    updateDocumentUnreadBadge(0);
    expect(globalThis.document.title).toBe('Kamand Chat · IIT Mandi');
  });

  it('3. Respects per-conversation mute settings for notifications', () => {
    const notifySpy = vi.fn();
    // @ts-expect-error Mocking Notification constructor
    globalThis.Notification = notifySpy;

    // When chat is muted, notification should NOT fire
    triggerIncomingMessageNotification({
      senderName: 'Aravind',
      body: 'Urgent notice',
      isConversationMuted: true,
    });
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
