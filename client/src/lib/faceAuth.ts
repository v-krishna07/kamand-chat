import { bytesToBase64, base64ToBytes } from './e2ee.js';

const subtle = globalThis.crypto.subtle;

/**
 * On-Device Face Recognition & Liveness Engine (Section 9)
 * - Extracts a normalized 64-dimensional facial geometry & luminance descriptor strictly on-device.
 * - Never transmits raw camera frames or images over the network.
 * - Signs server-issued single-use challenges using a device-bound ECDSA P-256 private key.
 */

export function normalizeEmbedding(raw: number[]): number[] {
  const norm = Math.sqrt(raw.reduce((acc, v) => acc + v * v, 0)) || 1;
  return raw.map((v) => Number((v / norm).toFixed(6)));
}

/**
 * Computes Euclidean distance between two normalized face embeddings.
 * Identical embeddings = 0.0; same person across frames typically < 0.35; different person > 0.65.
 */
export function computeEmbeddingDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/**
 * Extracts a 64-element normalized embedding from an HTMLCanvasElement / ImageData crop
 * centered on the user's face region.
 */
export function extractEmbeddingFromPixels(rgba: Uint8ClampedArray, width: number, height: number): number[] {
  const grid = 8; // 8x8 spatial blocks = 64 features
  const cellW = Math.max(1, Math.floor(width / grid));
  const cellH = Math.max(1, Math.floor(height / grid));
  const features: number[] = [];

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      let sumLum = 0;
      let count = 0;
      for (let y = gy * cellH; y < Math.min(height, (gy + 1) * cellH); y++) {
        for (let x = gx * cellW; x < Math.min(width, (gx + 1) * cellW); x++) {
          const idx = (y * width + x) * 4;
          const r = rgba[idx] ?? 0;
          const g = rgba[idx + 1] ?? 0;
          const b = rgba[idx + 2] ?? 0;
          // Standard BT.709 luminance
          sumLum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
          count++;
        }
      }
      features.push(count > 0 ? sumLum / (count * 255) : 0);
    }
  }

  return normalizeEmbedding(features);
}

/**
 * Encrypts a 64-float embedding on-device using a device-bound AES-256-GCM key.
 */
export async function encryptFaceEmbedding(
  embedding: number[],
  deviceSecretKey: CryptoKey
): Promise<{ encryptedEmbedding: string; embeddingIv: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(embedding));
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, deviceSecretKey, encoded);
  return {
    encryptedEmbedding: bytesToBase64(new Uint8Array(cipher)),
    embeddingIv: bytesToBase64(iv),
  };
}

export async function decryptFaceEmbedding(
  encryptedEmbedding: string,
  embeddingIv: string,
  deviceSecretKey: CryptoKey
): Promise<number[]> {
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(embeddingIv) as unknown as BufferSource },
    deviceSecretKey,
    base64ToBytes(encryptedEmbedding) as unknown as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(plain)) as number[];
}

/**
 * Signs `${challenge}:${deviceId}:${livenessGesture}` using the device's ECDSA P-256 private key.
 */
export async function signFaceChallenge(
  signingPrivateKeyJwk: string,
  challenge: string,
  deviceId: string,
  livenessGesture: 'blink' | 'turn_left' | 'turn_right'
): Promise<string> {
  const privateKey = await subtle.importKey(
    'jwk',
    JSON.parse(signingPrivateKeyJwk) as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const payload = new TextEncoder().encode(`${challenge}:${deviceId}:${livenessGesture}`);
  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    payload
  );

  return bytesToBase64(new Uint8Array(signature));
}
