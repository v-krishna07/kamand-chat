import { Router } from 'express';
import {
  UploadAttachmentInputSchema,
  FetchLinkPreviewInputSchema,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import {
  validateAndSanitizeUpload,
  fileStorage,
} from '../security/fileSafety.js';
import {
  validateUrlAgainstSsrf,
  fetchSafeLinkPreview,
} from '../security/ssrf.js';

export const mediaRouter = Router();

// 1. Upload Media / Voice Note / File Attachment with Magic-Byte Validation & EXIF Stripping (§5)
mediaRouter.post('/upload', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = UploadAttachmentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid attachment payload',
      });
      return;
    }

    const userId = req.authUser!.id;
    const {
      fileName,
      mimeType,
      base64Data,
      isEncrypted,
      encryptionIv,
      durationSec,
      waveform,
    } = parsed.data;

    const cleanBase64 = base64Data.includes(',')
      ? base64Data.split(',')[1]!
      : base64Data;
    const rawBuffer = Buffer.from(cleanBase64, 'base64');

    const check = await validateAndSanitizeUpload({
      fileName,
      claimedMimeType: mimeType,
      rawBuffer,
      isEncrypted: Boolean(isEncrypted),
    });

    if (!check.ok) {
      res.status(400).json({ error: check.error || 'File rejected by safety validator' });
      return;
    }

    await fileStorage.save(check.storageKey, check.sanitizedBuffer);

    const created = await prisma.attachment.create({
      data: {
        uploaderId: userId,
        fileName,
        storageKey: check.storageKey,
        mimeType: check.verifiedMimeType,
        sizeBytes: check.sanitizedBuffer.length,
        isEncrypted: Boolean(isEncrypted),
        encryptionIv: encryptionIv ?? null,
        durationSec: durationSec ?? null,
        waveformJson: JSON.stringify(waveform ?? []),
      },
    });

    res.status(201).json({
      attachment: {
        id: created.id,
        fileName: created.fileName,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        url: `/api/media/${created.id}`,
        isEncrypted: created.isEncrypted,
        encryptionIv: created.encryptionIv,
        durationSec: created.durationSec,
        waveform: waveform ?? [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. Download Attachment (Enforces conversation membership authorization check - §14 & §16.4)
mediaRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const attachmentId = req.params.id;
    const userId = req.authUser!.id;

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        messages: {
          select: { conversationId: true },
        },
      },
    });

    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }

    if (attachment.uploaderId !== userId) {
      const convIds = attachment.messages.map((m) => m.conversationId);
      const membership = await prisma.membership.findFirst({
        where: {
          userId,
          conversationId: { in: convIds },
        },
      });
      if (!membership) {
        res.status(403).json({
          error: 'You are not authorized to access this conversation attachment.',
        });
        return;
      }
    }

    const data = await fileStorage.read(attachment.storageKey);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.fileName)}"`
    );
    res.status(200).send(data);
  } catch (err) {
    next(err);
  }
});

// 3. SSRF-Safe Link Preview Endpoint (§5 & §14)
mediaRouter.post('/link-preview', requireAuth, csrfProtection, async (req, res) => {
  const parsed = FetchLinkPreviewInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  const ssrfCheck = await validateUrlAgainstSsrf(parsed.data.url);
  if (!ssrfCheck.safe) {
    res.status(403).json({ error: ssrfCheck.reason || 'Blocked by SSRF filter' });
    return;
  }

  try {
    const preview = await fetchSafeLinkPreview(parsed.data.url);
    res.status(200).json({ preview });
  } catch (err) {
    res.status(422).json({
      error: err instanceof Error ? err.message : 'Unable to fetch link preview',
    });
  }
});
