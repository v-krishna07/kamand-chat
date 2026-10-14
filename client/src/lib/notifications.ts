/**
 * Web Notifications, Tab-Title Unread Badge & Local Search Helpers (Section 5)
 */

export function updateDocumentUnreadBadge(totalUnreadCount: number): void {
  if (typeof document === 'undefined') return;
  const baseTitle = 'Kamand Chat · IIT Mandi';
  document.title = totalUnreadCount > 0 ? `(${totalUnreadCount}) ${baseTitle}` : baseTitle;
}

export async function requestWebNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

export function triggerIncomingMessageNotification(params: {
  senderName: string;
  body: string;
  isConversationMuted?: boolean;
}): void {
  if (params.isConversationMuted) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (document.visibilityState === 'visible') return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(params.senderName, {
        body: params.body.slice(0, 120),
        tag: 'kamand-chat-msg',
      });
    } catch {
      // Ignore in environments that block Notification constructor
    }
  }
}

/**
 * Client-side search over decrypted local messages in a conversation (§5).
 */
export function searchDecryptedMessages<
  T extends { id: string; body: string; sender: { displayName: string } }
>(messages: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return messages.filter(
    (m) =>
      m.body.toLowerCase().includes(q) ||
      m.sender.displayName.toLowerCase().includes(q)
  );
}
