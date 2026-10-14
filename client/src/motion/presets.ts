/**
 * Central Apple WWDC Fluid Interface Spring Presets & Virtualizer Scroll Guard
 */

export const SPRING_CRITICALLY_DAMPED = {
  type: 'spring' as const,
  bounce: 0, // Damping ratio 1.0 (critically damped, zero overshoot)
  duration: 0.38,
};

export const SPRING_MOMENTUM = {
  type: 'spring' as const,
  bounce: 0.2, // Damping ratio ~0.8 (used only when gesture carried momentum)
  duration: 0.4,
};

export const SPRING_SHEET = {
  type: 'spring' as const,
  bounce: 0.18, // Damping ratio ~0.8, response 0.3s
  duration: 0.3,
};

export const SPRING_SNAPPY = {
  type: 'spring' as const,
  bounce: 0,
  duration: 0.24,
};

export const REDUCED_MOTION_CROSSFADE = {
  type: 'tween' as const,
  duration: 0.15,
  ease: 'easeOut' as const,
};

/**
 * Tracks message IDs that have already animated in during the current session so
 * virtualized rows in a 10,000-message list NEVER re-animate when scrolling up/down (Deliverable 4).
 */
const animatedMessageIds = new Set<string>();

export function shouldAnimateMessageEntrance(messageId: string): boolean {
  if (animatedMessageIds.has(messageId)) {
    return false;
  }
  animatedMessageIds.add(messageId);
  if (animatedMessageIds.size > 15_000) {
    const first = animatedMessageIds.values().next().value;
    if (first) animatedMessageIds.delete(first);
  }
  return true;
}

export function markConversationMessagesAsSeen(messageIds: string[]): void {
  for (const id of messageIds) {
    animatedMessageIds.add(id);
  }
}

export function resetSeenMessagesForTesting(): void {
  animatedMessageIds.clear();
}
