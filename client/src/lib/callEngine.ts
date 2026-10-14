import { projectMomentum } from './physics.js';
import { base64ToBytes, bytesToBase64 } from './e2ee.js';

/**
 * WebRTC Media Encryption (Insertable Streams / Encoded Frame Transform),
 * Track Hygiene, and PiP Momentum Corner-Snap Calculations (Section 10 & Section 15).
 */

export function generateCallE2eeKeyMaterial(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes);
}

/**
 * Transforms an encoded WebRTC media frame buffer in-place (leaving the first `unencryptedHeaderBytes`
 * intact so RTP packetizers/depacketizers can parse frame headers, while encrypting the payload
 * with the current `keyGeneration` key stream).
 */
export function transformEncodedMediaFrame(
  frameData: Uint8Array,
  keyMaterialBase64: string,
  keyGeneration: number,
  unencryptedHeaderBytes = 10
): Uint8Array {
  const keyBytes = base64ToBytes(keyMaterialBase64);
  if (keyBytes.length === 0) return frameData;

  const out = new Uint8Array(frameData.length);
  const headerLen = Math.min(unencryptedHeaderBytes, frameData.length);

  for (let i = 0; i < headerLen; i++) {
    out[i] = frameData[i]!;
  }

  const genSalt = keyGeneration & 0xff;
  for (let i = headerLen; i < frameData.length; i++) {
    const mask = (keyBytes[i % keyBytes.length]! ^ ((i * 31 + genSalt) & 0xff)) & 0xff;
    out[i] = frameData[i]! ^ mask;
  }

  return out;
}

/**
 * Attaches WebRTC Insertable Streams E2EE transform to an RTCRtpSender or RTCRtpReceiver
 * when supported by the browser (`createEncodedStreams` or `RTCRtpScriptTransform`).
 */
export function attachInsertableStreamsE2ee(
  transceiverTarget: unknown,
  getKeyState: () => { keyMaterial: string; keyGeneration: number }
): boolean {
  const target = transceiverTarget as {
    createEncodedStreams?: () => {
      readable: ReadableStream<{ data: ArrayBuffer }>;
      writable: WritableStream<{ data: ArrayBuffer }>;
    };
  };

  if (typeof target?.createEncodedStreams !== 'function') {
    return false;
  }

  try {
    const { readable, writable } = target.createEncodedStreams();
    const transform = new TransformStream<{ data: ArrayBuffer }, { data: ArrayBuffer }>({
      transform(chunk, controller) {
        const { keyMaterial, keyGeneration } = getKeyState();
        const transformed = transformEncodedMediaFrame(
          new Uint8Array(chunk.data),
          keyMaterial,
          keyGeneration
        );
        chunk.data = transformed.buffer as ArrayBuffer;
        controller.enqueue(chunk);
      },
    });
    void readable.pipeThrough(transform).pipeTo(writable);
    return true;
  } catch {
    return false;
  }
}

export type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface PipBounds {
  viewportWidth: number;
  viewportHeight: number;
  pipWidth: number;
  pipHeight: number;
  padding?: number;
}

/**
 * Projects a dragged Picture-in-Picture window's final resting coordinate from release velocity
 * (`vx`, `vy` in px/s) using Apple's `projectMomentum` formula (§6) and snaps to the nearest screen corner.
 */
export function computeNearestPipCorner(
  currentX: number,
  currentY: number,
  velocityX: number,
  velocityY: number,
  bounds: PipBounds
): { corner: PipCorner; x: number; y: number } {
  const pad = bounds.padding ?? 20;
  const projectedX = currentX + projectMomentum(velocityX, 0.996);
  const projectedY = currentY + projectMomentum(velocityY, 0.996);

  const leftX = pad;
  const rightX = Math.max(pad, bounds.viewportWidth - bounds.pipWidth - pad);
  const topY = pad + 56; // Below top floating chrome
  const bottomY = Math.max(topY, bounds.viewportHeight - bounds.pipHeight - pad - 68);

  const candidates: Array<{ corner: PipCorner; x: number; y: number }> = [
    { corner: 'top-left', x: leftX, y: topY },
    { corner: 'top-right', x: rightX, y: topY },
    { corner: 'bottom-left', x: leftX, y: bottomY },
    { corner: 'bottom-right', x: rightX, y: bottomY },
  ];

  let best = candidates[3]!;
  let minDistanceSq = Infinity;

  for (const c of candidates) {
    const dx = projectedX - c.x;
    const dy = projectedY - c.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      best = c;
    }
  }

  return best;
}

/**
 * Stops every track on a MediaStream and clears references (Strict Resource Hygiene §10 & §14).
 */
export function stopMediaStreamTracks(stream: { getTracks: () => Array<{ stop: () => void }> } | null | undefined): number {
  if (!stream) return 0;
  const tracks = stream.getTracks();
  let stoppedCount = 0;
  for (const t of tracks) {
    try {
      t.stop();
      stoppedCount++;
    } catch {
      // Ignore already stopped track
    }
  }
  return stoppedCount;
}
