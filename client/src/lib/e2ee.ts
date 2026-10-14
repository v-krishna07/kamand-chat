/**
 * End-to-End Encryption (E2EE) Engine using Web Crypto API (Section 8)
 *
 * Architecture & Threat Model:
 * - Per-device Identity Key Pair (ECDH P-256) + Signing Key Pair (ECDSA P-256).
 * - Private keys are stored in IndexedDB (`kamand_e2ee_store`), with optional
 *   PBKDF2-SHA256 (100,000 iterations) + AES-256-GCM key wrapping for PIN backup.
 * - 1:1 Conversations: ECDH shared secret derived from local Identity Private Key
 *   and peer's Identity Public Key, passed through HKDF-SHA256 with the `conversationId`
 *   as context info to produce a 256-bit AES-GCM key. Every message uses a fresh
 *   cryptographically random 96-bit (12-byte) IV/nonce.
 * - Group Conversations: 256-bit AES-GCM Sender Key generated per sender, wrapped
 *   individually for each group member via their ECDH public key, and rotated
 *   (generation++) whenever a member is removed.
 */

const subtle = globalThis.crypto.subtle;

export interface SerializedDeviceBundle {
  deviceId: string;
  identityPublicKeyJwk: string;
  identityPrivateKeyJwk: string;
  signingPublicKeyJwk: string;
  signingPrivateKeyJwk: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Generates a fresh per-device ECDH + ECDSA key bundle.
 */
export async function generateDeviceKeyBundle(
  existingDeviceId?: string
): Promise<SerializedDeviceBundle> {
  const identityPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  const signingPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const [idPub, idPriv, sigPub, sigPriv] = await Promise.all([
    subtle.exportKey('jwk', identityPair.publicKey),
    subtle.exportKey('jwk', identityPair.privateKey),
    subtle.exportKey('jwk', signingPair.publicKey),
    subtle.exportKey('jwk', signingPair.privateKey),
  ]);

  return {
    deviceId: existingDeviceId || globalThis.crypto.randomUUID(),
    identityPublicKeyJwk: JSON.stringify(idPub),
    identityPrivateKeyJwk: JSON.stringify(idPriv),
    signingPublicKeyJwk: JSON.stringify(sigPub),
    signingPrivateKeyJwk: JSON.stringify(sigPriv),
  };
}

/**
 * Derives a 256-bit AES-GCM conversation key from our ECDH private key and peer's ECDH public key,
 * domain-separated by `conversationId` via HKDF-SHA256.
 */
export async function deriveDirectConversationKey(
  myIdentityPrivateKeyJwk: string,
  peerIdentityPublicKeyJwk: string,
  conversationId: string
): Promise<CryptoKey> {
  const privKey = await subtle.importKey(
    'jwk',
    JSON.parse(myIdentityPrivateKeyJwk) as JsonWebKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );

  const pubKey = await subtle.importKey(
    'jwk',
    JSON.parse(peerIdentityPublicKeyJwk) as JsonWebKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const rawSharedSecret = await subtle.deriveBits(
    { name: 'ECDH', public: pubKey },
    privKey,
    256
  );

  const hkdfBaseKey = await subtle.importKey('raw', rawSharedSecret, 'HKDF', false, [
    'deriveKey',
  ]);

  const encoder = new TextEncoder();
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('kamand-e2ee-v1-salt'),
      info: encoder.encode(`direct:${conversationId}`),
    },
    hkdfBaseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a UTF-8 message string with AES-256-GCM and a fresh 96-bit random nonce.
 */
export async function encryptMessageContent(
  aesKey: CryptoKey,
  plaintext: string,
  associatedData = ''
): Promise<{ ciphertext: string; nonce: string }> {
  const nonceBytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encryptedBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonceBytes,
      additionalData: encoder.encode(associatedData),
    },
    aesKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    nonce: bytesToBase64(nonceBytes),
  };
}

/**
 * Decrypts an AES-256-GCM ciphertext. Throws if tampered, wrong key, or wrong AAD.
 */
export async function decryptMessageContent(
  aesKey: CryptoKey,
  ciphertextBase64: string,
  nonceBase64: string,
  associatedData = ''
): Promise<string> {
  const cipherBytes = base64ToBytes(ciphertextBase64);
  const nonceBytes = base64ToBytes(nonceBase64);
  const encoder = new TextEncoder();

  const decryptedBuffer = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonceBytes as unknown as BufferSource,
      additionalData: encoder.encode(associatedData),
    },
    aesKey,
    cipherBytes as unknown as BufferSource
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Generates a fresh 256-bit Group Sender Key (exportable raw base64 so it can be wrapped for group members).
 */
export async function generateGroupSenderKey(): Promise<{
  key: CryptoKey;
  rawBase64: string;
}> {
  const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const raw = await subtle.exportKey('raw', key);
  return {
    key,
    rawBase64: bytesToBase64(new Uint8Array(raw)),
  };
}

export async function importGroupSenderKey(rawBase64: string): Promise<CryptoKey> {
  return subtle.importKey(
    'raw',
    base64ToBytes(rawBase64) as unknown as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wraps a private key bundle with a user-chosen PIN/passphrase via PBKDF2-SHA256 + AES-256-GCM.
 */
export async function wrapBundleWithPassphrase(
  bundle: SerializedDeviceBundle,
  passphrase: string
): Promise<{ wrappedPrivateKeyBackup: string; backupSalt: string; backupIv: string }> {
  const encoder = new TextEncoder();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const baseKey = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const wrappingKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    encoder.encode(JSON.stringify(bundle))
  );

  return {
    wrappedPrivateKeyBackup: bytesToBase64(new Uint8Array(ciphertext)),
    backupSalt: bytesToBase64(salt),
    backupIv: bytesToBase64(iv),
  };
}

export async function unwrapBundleWithPassphrase(
  wrappedBase64: string,
  saltBase64: string,
  ivBase64: string,
  passphrase: string
): Promise<SerializedDeviceBundle> {
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const unwrappingKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltBase64) as unknown as BufferSource,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivBase64) as unknown as BufferSource },
    unwrappingKey,
    base64ToBytes(wrappedBase64) as unknown as BufferSource
  );

  return JSON.parse(new TextDecoder().decode(decrypted)) as SerializedDeviceBundle;
}

/**
 * Computes a deterministic 60-digit Safety Number for a 1:1 conversation from both users'
 * identity public keys (sorted lexicographically so both peers see the exact same code).
 */
export async function computeSafetyNumber(
  identityPubKeyA: string,
  identityPubKeyB: string
): Promise<string> {
  const [first, second] = [identityPubKeyA.trim(), identityPubKeyB.trim()].sort();
  const data = new TextEncoder().encode(`${first}||${second}`);
  const digest = await subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  const digits = Array.from(bytes)
    .map((b) => String(b % 100).padStart(2, '0'))
    .join('')
    .slice(0, 60);
  return digits.match(/.{1,5}/g)!.join(' ');
}
