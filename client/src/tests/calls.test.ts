import { describe, expect, it, vi } from 'vitest';
import {
  generateCallE2eeKeyMaterial,
  transformEncodedMediaFrame,
  computeNearestPipCorner,
  stopMediaStreamTracks,
} from '../lib/callEngine.js';

describe('Phase 5 Client Call Engine Suite: Insertable Streams E2EE, PiP Momentum Corner-Snap & Track Cleanup', () => {
  it('1. Encrypts and decrypts encoded WebRTC media frames symmetrically while preserving RTP header bytes', () => {
    const keyMaterial = generateCallE2eeKeyMaterial();
    const originalFrame = new Uint8Array([
      // 10-byte RTP / codec header
      0x80, 0x60, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      // Media payload
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x11, 0x22, 0x33, 0x44,
    ]);

    const encrypted = transformEncodedMediaFrame(originalFrame, keyMaterial, 1, 10);
    // Header must remain identical for WebRTC packetizer
    expect(Array.from(encrypted.slice(0, 10))).toEqual(Array.from(originalFrame.slice(0, 10)));
    // Payload must be encrypted
    expect(Array.from(encrypted.slice(10))).not.toEqual(Array.from(originalFrame.slice(10)));

    // Decrypting with the same key & generation restores exact original media frame
    const decrypted = transformEncodedMediaFrame(encrypted, keyMaterial, 1, 10);
    expect(Array.from(decrypted)).toEqual(Array.from(originalFrame));

    // Decrypting with rotated key generation (gen 2) does not match gen 1 payload
    const wrongGen = transformEncodedMediaFrame(encrypted, keyMaterial, 2, 10);
    expect(Array.from(wrongGen.slice(10))).not.toEqual(Array.from(originalFrame.slice(10)));
  });

  it('2. Projects PiP drag velocity and snaps to the nearest screen corner', () => {
    const bounds = {
      viewportWidth: 1280,
      viewportHeight: 800,
      pipWidth: 256,
      pipHeight: 168,
      padding: 20,
    };

    // Flicking fast toward top-right from center
    const topRight = computeNearestPipCorner(500, 400, 1800, -1600, bounds);
    expect(topRight.corner).toBe('top-right');
    expect(topRight.x).toBe(1280 - 256 - 20);

    // Flicking fast toward bottom-left
    const bottomLeft = computeNearestPipCorner(500, 400, -1800, 1600, bounds);
    expect(bottomLeft.corner).toBe('bottom-left');
    expect(bottomLeft.x).toBe(20);
  });

  it('3. Releases all camera and microphone MediaStreamTracks on exit', () => {
    const stopAudio = vi.fn();
    const stopVideo = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: stopAudio }, { stop: stopVideo }],
    };

    const count = stopMediaStreamTracks(mockStream);
    expect(count).toBe(2);
    expect(stopAudio).toHaveBeenCalledTimes(1);
    expect(stopVideo).toHaveBeenCalledTimes(1);
  });
});
