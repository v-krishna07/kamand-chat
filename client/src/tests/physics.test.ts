import { describe, expect, it } from 'vitest';
import {
  projectMomentum,
  rubberband,
  computeRelativeVelocity,
  PointerVelocityTracker,
} from '../lib/physics.js';
import { mergeConversationMessages } from '../store/useChatStore.js';
import type { MessageDTO } from '@kamand/shared';

describe('Apple Fluid Interface Physics & Client Message Ordering Suite', () => {
  it('projects momentum using exponential deceleration rate', () => {
    const posOffset = projectMomentum(1000, 0.998);
    expect(posOffset).toBeCloseTo(499, 0);
    expect(projectMomentum(0)).toBe(0);
  });

  it('applies progressive rubber-band resistance at boundaries', () => {
    const slight = rubberband(20, 200, 0.55);
    const far = rubberband(200, 200, 0.55);
    expect(slight).toBeGreaterThan(0);
    expect(slight).toBeLessThan(20);
    expect(far).toBeLessThan(200);
    expect(rubberband(-50, 200)).toBeLessThan(0);
  });

  it('normalizes relative spring velocity accurately', () => {
    // 50px/s over 100px remaining distance => 0.5 relative velocity
    expect(computeRelativeVelocity(50, 50, 150)).toBeCloseTo(0.5, 4);
  });

  it('tracks pointer velocity across timestamped samples', () => {
    const tracker = new PointerVelocityTracker();
    tracker.addSample(0, 100, 1000);
    tracker.addSample(50, 200, 1050);
    const { vx, vy } = tracker.getVelocity();
    expect(vx).toBeCloseTo(1000, 0);
    expect(vy).toBeCloseTo(2000, 0);
  });

  it('deduplicates messages by client UUID and sorts strictly by server seq', () => {
    const baseSender = {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'aravind',
      displayName: 'Aravind',
      avatarUrl: null,
    };
    const m1: MessageDTO = {
      id: 'aaaa1111-1111-4111-8111-111111111111',
      conversationId: 'cccc1111-1111-4111-8111-111111111111',
      senderId: baseSender.id,
      sender: baseSender,
      body: 'First',
      ciphertext: null,
      nonce: null,
      type: 'text',
      replyToId: null,
      threadRootId: null,
      threadReplyCount: 0,
      seq: 1,
      status: 'sending',
      editedAt: null,
      deletedAt: null,
      createdAt: '2026-10-14T10:00:00.000Z',
    };
    const m1Acked: MessageDTO = { ...m1, status: 'sent', seq: 1 };
    const m2: MessageDTO = {
      ...m1,
      id: 'bbbb2222-2222-4222-8222-222222222222',
      body: 'Second',
      seq: 2,
      status: 'sent',
    };

    const merged = mergeConversationMessages([m2, m1], [m1Acked]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.id).toBe(m1.id);
    expect(merged[0]!.status).toBe('sent');
    expect(merged[1]!.id).toBe(m2.id);
  });
});
