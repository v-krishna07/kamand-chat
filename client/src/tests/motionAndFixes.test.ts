import { describe, expect, it, beforeEach } from 'vitest';
import { CanonicalDayOfWeekSchema } from '@kamand/shared';
import {
  shouldAnimateMessageEntrance,
  resetSeenMessagesForTesting,
} from '../motion/presets.js';
import { computeVirtualMessageWindow } from '../lib/virtualizer.js';

describe('Merged Audit Fixes & Motion Architecture Verification Suite', () => {
  beforeEach(() => {
    resetSeenMessagesForTesting();
  });

  it('1. Normalizes both abbreviated ("Wed") and full ("Wednesday") day names in CanonicalDayOfWeekSchema (Bug 1 Fix)', () => {
    expect(CanonicalDayOfWeekSchema.parse('Wed')).toBe('Wed');
    expect(CanonicalDayOfWeekSchema.parse('Wednesday')).toBe('Wed');
    expect(CanonicalDayOfWeekSchema.parse('monday')).toBe('Mon');
    expect(CanonicalDayOfWeekSchema.parse('Thursday')).toBe('Thu');
  });

  it('2. Prevents virtualized message rows from re-animating on scroll via shouldAnimateMessageEntrance (Deliverable 4)', () => {
    const msgId = 'msg-uuid-1001';
    // First time message mounts -> animates in
    expect(shouldAnimateMessageEntrance(msgId)).toBe(true);
    // When virtualizer unmounts and re-mounts the same message on scroll -> does NOT re-animate
    expect(shouldAnimateMessageEntrance(msgId)).toBe(false);
  });

  it('3. Computes accurate prefix-sum spacer heights for variable-height messages in a 10,000-message stream (Bug 15 Fix)', () => {
    const items = Array.from({ length: 10_000 }, (_, i) => ({
      id: `m-${i}`,
      body: `Row ${i}`,
    }));
    const measuredHeights = {
      'm-0': 240, // Rich image card
      'm-1': 180, // Link preview card
    };

    const win = computeVirtualMessageWindow({
      items,
      scrollTopPx: 340_000,
      viewportHeightPx: 680,
      estimatedRowHeightPx: 68,
      measuredHeights,
    });

    expect(win.visibleItems.length).toBeLessThanOrEqual(30);
    expect(win.totalHeightPx).toBe(10_000 * 68 + (240 - 68) + (180 - 68));
  });
});
