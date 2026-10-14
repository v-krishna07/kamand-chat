import { describe, expect, it } from 'vitest';
import { computeVirtualMessageWindow } from '../lib/virtualizer.js';
import { searchDecryptedMessages } from '../lib/notifications.js';

describe('Phase 10 Performance & Virtualization Suite: 10,000 Messages Windowing & Local Decrypted Search', () => {
  it('1. Virtualizes a 10,000-message list so fewer than 40 DOM items are rendered at any scroll position', () => {
    const tenThousandMessages = Array.from({ length: 10_000 }, (_, i) => ({
      id: `msg-${i + 1}`,
      seq: i + 1,
      body: `Message #${i + 1}`,
    }));

    const windowAtMidScroll = computeVirtualMessageWindow({
      items: tenThousandMessages,
      scrollTopPx: 340_000, // Middle of the 10,000-message stream
      viewportHeightPx: 680,
      estimatedRowHeightPx: 68,
      overscanCount: 8,
    });

    expect(windowAtMidScroll.visibleItems.length).toBeLessThanOrEqual(30);
    expect(windowAtMidScroll.topSpacerPx).toBeGreaterThan(300_000);
    expect(windowAtMidScroll.bottomSpacerPx).toBeGreaterThan(300_000);
    expect(windowAtMidScroll.totalHeightPx).toBe(680_000);
  });

  it('2. Performs instant client-side search over decrypted local messages', () => {
    const messages = [
      { id: '1', body: 'Meeting at B-19 common room', sender: { displayName: 'Aravind' } },
      { id: '2', body: 'Pine Mess dinner at 8 PM', sender: { displayName: 'Priya' } },
      { id: '3', body: 'Bring the ESP32 drone frame', sender: { displayName: 'Kabir' } },
    ];

    const matches = searchDecryptedMessages(messages, 'esp32');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe('3');
  });
});
