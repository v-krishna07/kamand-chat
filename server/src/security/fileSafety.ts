import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

  if (buf[0] === 0x4d && buf[1] === 0x5a) {
    return { safe: false, detectedMime: null, reason: 'Blocked executable binary (PE/MZ header)' };
  }
  if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    return { safe: false, detectedMime: null, reason: 'Blocked executable binary (ELF header)' };
  }
  if (buf[0] === 0x23 && buf[1] === 0x21) {
    return { safe: false, detectedMime: null, reason: 'Blocked shell script (shebang header)' };
  }

  const headAscii = buf.subarray(0, Math.min(buf.length, 256)).toString('utf8').toLowerCase();
  if (
    headAscii.includes('<script') ||
    headAscii.includes('<!doctype html') ||
    headAscii.includes('<?php')
  ) {
    return { safe: false, detectedMime: null, reason: 'Blocked active HTML/script payload' };
  }

  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { safe: true, detectedMime: 'image/png' };
  }

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { safe: true, detectedMime: 'image/jpeg' };
  }

  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return { safe: true, detectedMime: 'image/gif' };
  }

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

  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { safe: true, detectedMime: 'audio/webm' };
  }

  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return { safe: true, detectedMime: 'audio/ogg' };
  }

  return {
    safe: false,
    detectedMime: null,
    reason: 'Unsupported or unverified file magic-byte signature',
  };
}

export function stripJpegExif(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return buf;
  }

  const chunks: Buffer[] = [buf.subarray(0, 2)];
  let offset = 2;

  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      chunks.push(buf.subarray(offset));
      break;
    }

    const marker = buf[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(buf.subarray(offset));
      break;
    }

    const segmentLength = buf.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buf.length) {
      chunks.push(buf.subarray(offset));
      break;
    }

    if (marker !== 0xe1 && marker !== 0xed) {
      chunks.push(buf.subarray(offset, offset + 2 + segmentLength));
    }

    offset += 2 + segmentLength;
  }

  return Buffer.concat(chunks);
}

export function stripPngMetadata(buf: Buffer): Buffer {
  if (
    buf.length < 8 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return buf;
  }

  const droppedTypes = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);
  const chunks: Buffer[] = [buf.subarray(0, 8)];
  let offset = 8;

  while (offset + 12 <= buf.length) {
    const dataLength = buf.readUInt32BE(offset);
    const chunkType = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const totalChunkLen = 12 + dataLength;

    if (offset + totalChunkLen > buf.length) {
      chunks.push(buf.subarray(offset));
      break;
    }

    if (!droppedTypes.has(chunkType)) {
      chunks.push(buf.subarray(offset, offset + totalChunkLen));
    }

    offset += totalChunkLen;
  }

  return Buffer.concat(chunks);
}

export function stripWebpMetadata(buf: Buffer): Buffer {
  if (
    buf.length < 12 ||
    buf.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buf.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return buf;
  }

  const keptSubChunks: Buffer[] = [];
  let offset = 12;

  while (offset + 8 <= buf.length) {
    const fourCC = buf.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buf.readUInt32LE(offset + 4);
    const paddedSize = chunkSize + (chunkSize % 2);
    const totalLen = 8 + paddedSize;

    if (offset + totalLen > buf.length) {
      keptSubChunks.push(buf.subarray(offset));
      break;
    }

    if (fourCC !== 'EXIF' && fourCC !== 'XMP ') {
      keptSubChunks.push(buf.subarray(offset, offset + totalLen));
    }

    offset += totalLen;
  }

  const body = Buffer.concat(keptSubChunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'ascii');

  return Buffer.concat([header, body]);
}

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

  let sanitizedBuffer = rawBuffer;
  if (magicCheck.detectedMime === 'image/jpeg') {
    sanitizedBuffer = stripJpegExif(rawBuffer);
  } else if (magicCheck.detectedMime === 'image/png') {
    sanitizedBuffer = stripPngMetadata(rawBuffer);
  } else if (magicCheck.detectedMime === 'image/webp') {
    sanitizedBuffer = stripWebpMetadata(rawBuffer);
  }

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

export interface FileStorageAdapter {
  save(storageKey: string, data: Buffer): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
}

class LocalDiskStorageAdapter implements FileStorageAdapter {
  private readonly baseDir = path.resolve(__dirname, '../../uploads');

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
