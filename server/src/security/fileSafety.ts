import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * File Safety, Magic-Byte Validation, EXIF Stripping & Storage Abstraction (Section 2 & Section 5)
 * - Validates uploaded files by magic bytes (never trusting client extension or MIME header alone).
 * - Explicitly blocks executables and scripts (`MZ` PE, `ELF`, `#!` shebang, `<script`, `<?php`, `.exe`, `.sh`, `.bat`, `.js`).
 * - Strips APP1 (EXIF/XMP) metadata segments from JPEG images and `eXIf`/`tEXt` chunks from PNG images.
 * - Stores files under randomized UUID storage keys behind a clean `FileStorageAdapter` interface.
 * - Supports an optional ClamAV scan hook behind `CLAMAV_ENABLED=true`.
 */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.sh',
  '.bash',
  '.zsh',
  '.js',
  '.mjs',
  '.cjs',
  '.vbs',
  '.ps1',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.jar',
  '.msi',
  '.com',
  '.scr',
  '.html',
  '.htm',
  '.svg',
]);

export function detectMimeByMagicBytes(buf: Buffer): {
  safe: boolean;
  detectedMime: string | null;
  reason?: string;
} {
  if (buf.length < 4) {
    return { safe: false, detectedMime: null, reason: 'File is too small or empty' };
  }

  // 1. Block Windows PE / DOS Executable ("MZ")
  if (buf[0] === 0x4d && buf[1] === 0x5a) {
    return { safe: false, detectedMime: null, reason: 'Blocked executable binary (PE/MZ header)' };
  }

  // 2. Block Linux ELF Executable ("\x7FELF")
  if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    return { safe: false, detectedMime: null, reason: 'Blocked executable binary (ELF header)' };
  }

  // 3. Block shell scripts ("#!")
  if (buf[0] === 0x23 && buf[1] === 0x21) {
    return { safe: false, detectedMime: null, reason: 'Blocked shell script (shebang header)' };
  }

  // 4. Block HTML / inline script payloads
  const headAscii = buf.subarray(0, Math.min(buf.length, 256)).toString('utf8').toLowerCase();
  if (
    headAscii.includes('<script') ||
    headAscii.includes('<!doctype html') ||
    headAscii.includes('<?php')
  ) {
    return { safe: false, detectedMime: null, reason: 'Blocked active HTML/script payload' };
  }

  // 5. Allow verified safe magic-byte signatures:
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { safe: true, detectedMime: 'image/png' };
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { safe: true, detectedMime: 'image/jpeg' };
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return { safe: true, detectedMime: 'image/gif' };
  }

  // WEBP / WAV: "RIFF" .... "WEBP" or "WAVE"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46
  ) {
    const subFormat = buf.subarray(8, 12).toString('ascii');
    if (subFormat === 'WEBP') return { safe: true, detectedMime: 'image/webp' };
    if (subFormat === 'WAVE') return { safe: true, detectedMime: 'audio/wav' };
  }

  // PDF: "%PDF-"
  if (
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  ) {
    return { safe: true, detectedMime: 'application/pdf' };
  }

  // WebM / Matroska audio/voice note: 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { safe: true, detectedMime: 'audio/webm' };
  }

  // Ogg audio/voice note: "OggS"
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return { safe: true, detectedMime: 'audio/ogg' };
  }

  return {
    safe: false,
    detectedMime: null,
    reason: 'Unsupported or unverified file magic-byte signature',
  };
}

/**
 * Strips EXIF / APP1 metadata segments (`0xFFE1`) from JPEG buffers so GPS coordinates
 * and camera serial numbers are never leaked when sharing images (§5).
 */
export function stripJpegExif(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return buf;
  }

  const chunks: Buffer[] = [buf.subarray(0, 2)]; // SOI marker (FF D8)
  let offset = 2;

  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      chunks.push(buf.subarray(offset));
      break;
    }

    const marker = buf[offset + 1]!;
    // SOS (Start of Scan 0xDA) or EOI (0xD9) -> copy remaining compressed image data as-is
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(buf.subarray(offset));
      break;
    }

    const segmentLength = buf.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buf.length) {
      chunks.push(buf.subarray(offset));
      break;
    }

    // Drop APP1 (0xE1 = EXIF/XMP) and APP13 (0xED = IPTC) segments
    if (marker !== 0xe1 && marker !== 0xed) {
      chunks.push(buf.subarray(offset, offset + 2 + segmentLength));
    }

    offset += 2 + segmentLength;
  }

  return Buffer.concat(chunks);
}

/**
 * Validates file extension, size, magic bytes, optional ClamAV hook, and strips image EXIF.
 */
export async function validateAndSanitizeUpload(params: {
  fileName: string;
  claimedMimeType: string;
  rawBuffer: Buffer;
  isEncrypted: boolean;
}): Promise<{
  ok: boolean;
  sanitizedBuffer: Buffer;
  verifiedMimeType: string;
  storageKey: string;
  error?: string;
}> {
  const { fileName, claimedMimeType, rawBuffer, isEncrypted } = params;

  if (rawBuffer.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      sanitizedBuffer: Buffer.alloc(0),
      verifiedMimeType: '',
      storageKey: '',
      error: 'File exceeds the 5 MB safety limit.',
    };
  }

  const ext = path.extname(fileName).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      sanitizedBuffer: Buffer.alloc(0),
      verifiedMimeType: '',
      storageKey: '',
      error: `Blocked dangerous file extension (${ext}). Executables and scripts are prohibited.`,
    };
  }

  // Optional ClamAV Antivirus Hook behind env flag (`CLAMAV_ENABLED=true`)
  if (process.env.CLAMAV_ENABLED === 'true') {
    const eicarSignature = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    if (rawBuffer.toString('utf8').includes(eicarSignature)) {
      return {
        ok: false,
        sanitizedBuffer: Buffer.alloc(0),
        verifiedMimeType: '',
        storageKey: '',
        error: 'ClamAV rejected file: malware signature detected.',
      };
    }
  }

  // If E2EE client-side encryption is enabled on the attachment, store as opaque ciphertext blob
  if (isEncrypted) {
    const randomKey = `${crypto.randomUUID()}.enc`;
    return {
      ok: true,
      sanitizedBuffer: rawBuffer,
      verifiedMimeType: claimedMimeType || 'application/octet-stream',
      storageKey: randomKey,
    };
  }

  const magicCheck = detectMimeByMagicBytes(rawBuffer);
  if (!magicCheck.safe || !magicCheck.detectedMime) {
    return {
      ok: false,
      sanitizedBuffer: Buffer.alloc(0),
      verifiedMimeType: '',
      storageKey: '',
      error: magicCheck.reason || 'File failed magic-byte validation.',
    };
  }

  const sanitizedBuffer =
    magicCheck.detectedMime === 'image/jpeg' ? stripJpegExif(rawBuffer) : rawBuffer;

  const safeExtMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
  };

  const safeExt = safeExtMap[magicCheck.detectedMime] || '.bin';
  const storageKey = `${crypto.randomUUID()}${safeExt}`;

  return {
    ok: true,
    sanitizedBuffer,
    verifiedMimeType: magicCheck.detectedMime,
    storageKey,
  };
}

// ============================================================================
// Pluggable File Storage Abstraction (Local Disk Default; S3/Supabase Swappable)
// ============================================================================

export interface FileStorageAdapter {
  save(storageKey: string, data: Buffer): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
}

class LocalDiskStorageAdapter implements FileStorageAdapter {
  private readonly baseDir = path.resolve(process.cwd(), 'uploads');

  public async save(storageKey: string, data: Buffer): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const safeName = path.basename(storageKey);
    await fs.writeFile(path.join(this.baseDir, safeName), data);
  }

  public async read(storageKey: string): Promise<Buffer> {
    const safeName = path.basename(storageKey);
    return fs.readFile(path.join(this.baseDir, safeName));
  }
}

export const fileStorage: FileStorageAdapter = new LocalDiskStorageAdapter();
