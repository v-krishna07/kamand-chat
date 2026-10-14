import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Encrypts and decrypts user-consented connector tokens at rest using a per-user
 * AES-256-GCM key derived via HKDF-SHA256 from `SESSION_SECRET` and `userId` (§12 Hard Rules).
 */

function derivePerUserKey(userId: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(config.sessionSecret, 'utf8'),
      Buffer.from(userId, 'utf8'),
      Buffer.from('kamand-campus-connector-token-v1', 'utf8'),
      32
    )
  );
}

export function encryptConnectorToken(
  userId: string,
  plainToken: string
): { encryptedToken: string; tokenIv: string } {
  const key = derivePerUserKey(userId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainToken, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([encrypted, authTag]);

  return {
    encryptedToken: payload.toString('base64'),
    tokenIv: iv.toString('base64'),
  };
}

export function decryptConnectorToken(
  userId: string,
  encryptedTokenBase64: string,
  tokenIvBase64: string
): string {
  const key = derivePerUserKey(userId);
  const iv = Buffer.from(tokenIvBase64, 'base64');
  const raw = Buffer.from(encryptedTokenBase64, 'base64');
  if (raw.length < 17) {
    throw new Error('Invalid encrypted connector token');
  }
  const ciphertext = raw.subarray(0, raw.length - 16);
  const authTag = raw.subarray(raw.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
