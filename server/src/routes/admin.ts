import { Router } from 'express';
import {
  CreateReportInputSchema,
  ResolveReportInputSchema,
  type ReportDTO,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import { getAllConnectorsHealth } from '../campus/connectorRegistry.js';
import { isUserOnline, emitToUser } from '../ws/socketServer.js';

export const adminRouter = Router();

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const MOD_OR_ADMIN_ROLES = new Set(['moderator', 'admin', 'super_admin']);

function formatReportDTO(row: {
  id: string;
  reporterId: string;
  targetUserId: string | null;
  conversationId: string | null;
  messageId: string | null;
  reason: string;
  attachedJson: string;
  status: string;
  resolutionNote: string;
  createdAt: Date;
  reporter: { username: string };
  targetUser: { username: string } | null;
}): ReportDTO {
  let attached: ReportDTO['voluntarilyAttachedMessages'] = [];
  try {
    const parsed = JSON.parse(row.attachedJson);
    if (Array.isArray(parsed)) attached = parsed;
  } catch {
    attached = [];
  }

  return {
    id: row.id,
    reporterId: row.reporterId,
    reporterUsername: row.reporter.username,
    targetUserId: row.targetUserId,
    targetUsername: row.targetUser?.username ?? null,
    conversationId: row.conversationId,
    messageId: row.messageId,
    reason: row.reason,
    status: (row.status as ReportDTO['status']) || 'open',
    resolutionNote: row.resolutionNote,
    voluntarilyAttachedMessages: attached,
    createdAt: row.createdAt.toISOString(),
  };
}

// 1. Any authenticated user can submit a Moderation Report (voluntarily attaching selected messages since E2EE chats cannot be read by admins - §5)
adminRouter.post('/reports', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = CreateReportInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid report payload',
      });
      return;
    }

    const reporterId = req.authUser!.id;
    const {
      targetUserId,
      conversationId,
      messageId,
      reason,
      voluntarilyAttachedMessages,
    } = parsed.data;

    const created = await prisma.report.create({
      data: {
        reporterId,
        targetUserId: targetUserId ?? null,
        conversationId: conversationId ?? null,
        messageId: messageId ?? null,
        reason,
        attachedJson: JSON.stringify(voluntarilyAttachedMessages),
      },
      include: {
        reporter: { select: { username: true } },
        targetUser: { select: { username: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: reporterId,
        action: 'MODERATION_REPORT_SUBMITTED',
        targetId: created.id,
        ipAddress: req.ip ?? null,
      },
    });

    res.status(201).json({ report: formatReportDTO(created) });
  } catch (err) {
    next(err);
  }
});

// 2. Get System Stats, Connector Health & Audit Log (Moderators/Admins only; NEVER exposes E2EE message content)
adminRouter.get('/overview', requireAuth, async (req, res, next) => {
  try {
    if (!MOD_OR_ADMIN_ROLES.has(req.authUser!.role)) {
      res.status(403).json({ error: 'Admin or moderator access required.' });
      return;
    }

    const [
      totalUsers,
      suspendedUsers,
      totalConversations,
      totalMessagesMetadataCount,
      openReportsCount,
      totalCommunities,
      connectors,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.report.count({ where: { status: 'open' } }),
      prisma.community.count(),
      getAllConnectorsHealth(),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          actor: { select: { username: true, displayName: true } },
        },
      }),
    ]);

    res.status(200).json({
      stats: {
        totalUsers,
        suspendedUsers,
        totalConversations,
        totalMessagesMetadataCount,
        openReportsCount,
        totalCommunities,
        e2eeContentReadableByAdmin: false, // Hard architectural guarantee (§5)
      },
      connectors,
      auditLogs: recentAuditLogs.map((l) => ({
        id: l.id,
        action: l.action,
        actorUsername: l.actor?.username ?? 'system',
        targetId: l.targetId,
        metadata: l.metadata,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// 3. List & Search Users Table (Admins/Moderators only)
adminRouter.get('/users', requireAuth, async (req, res, next) => {
  try {
    if (!MOD_OR_ADMIN_ROLES.has(req.authUser!.role)) {
      res.status(403).json({ error: 'Admin or moderator access required.' });
      return;
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { username: { contains: q } },
              { email: { contains: q } },
              { displayName: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    res.status(200).json({
      users: users.map((u) => ({
        ...toUserSummary(u, {
          isSelf: false,
          canSeePrivateRoom: false,
          isOnline: isUserOnline(u.id),
        }),
        isSuspended: u.isSuspended,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// 4. Suspend / Unsuspend User & Revoke All Sessions
adminRouter.post('/users/:id/suspend', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    if (!MOD_OR_ADMIN_ROLES.has(req.authUser!.role)) {
      res.status(403).json({ error: 'Admin or moderator access required.' });
      return;
    }

    const targetId = req.params.id;
    if (targetId === req.authUser!.id) {
      res.status(400).json({ error: 'You cannot suspend yourself.' });
      return;
    }

    const suspend = Boolean(req.body?.suspend ?? true);

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: targetId },
        data: { isSuspended: suspend },
      });
      if (suspend) {
        await tx.session.deleteMany({ where: { userId: targetId } });
      }
      await tx.auditLog.create({
        data: {
          actorId: req.authUser!.id,
          action: suspend ? 'ADMIN_USER_SUSPENDED' : 'ADMIN_USER_UNSUSPENDED',
          targetId,
          ipAddress: req.ip ?? null,
        },
      });
      return u;
    });

    if (suspend) {
      emitToUser(targetId, 'session:force-logout', { reason: 'Account suspended by moderator' });
    }

    res.status(200).json({ ok: true, isSuspended: updated.isSuspended });
  } catch (err) {
    next(err);
  }
});

// 5. Force Logout All Devices of a User
adminRouter.post('/users/:id/force-logout', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    if (!ADMIN_ROLES.has(req.authUser!.role)) {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }

    const targetId = req.params.id;
    const deleted = await prisma.session.deleteMany({ where: { userId: targetId } });

    await prisma.auditLog.create({
      data: {
        actorId: req.authUser!.id,
        action: 'ADMIN_USER_FORCE_LOGOUT',
        targetId,
        metadata: JSON.stringify({ sessionsRevoked: deleted.count }),
        ipAddress: req.ip ?? null,
      },
    });

    emitToUser(targetId, 'session:force-logout', { reason: 'Force logout by administrator' });

    res.status(200).json({ ok: true, sessionsRevoked: deleted.count });
  } catch (err) {
    next(err);
  }
});

// 6. Delete User Account (Super Admin / Admin only)
adminRouter.delete('/users/:id', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    if (!ADMIN_ROLES.has(req.authUser!.role)) {
      res.status(403).json({ error: 'Admin access required to delete users.' });
      return;
    }

    const targetId = req.params.id;
    if (targetId === req.authUser!.id) {
      res.status(400).json({ error: 'Cannot delete your own admin account.' });
      return;
    }

    await prisma.user.delete({ where: { id: targetId } });
    await prisma.auditLog.create({
      data: {
        actorId: req.authUser!.id,
        action: 'ADMIN_USER_DELETED',
        targetId,
        ipAddress: req.ip ?? null,
      },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 7. List Moderation Reports Queue & Resolve Report
adminRouter.get('/reports', requireAuth, async (req, res, next) => {
  try {
    if (!MOD_OR_ADMIN_ROLES.has(req.authUser!.role)) {
      res.status(403).json({ error: 'Admin or moderator access required.' });
      return;
    }

    const reports = await prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        reporter: { select: { username: true } },
        targetUser: { select: { username: true } },
      },
    });

    res.status(200).json({
      reports: reports.map(formatReportDTO),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/reports/:id/resolve', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    if (!MOD_OR_ADMIN_ROLES.has(req.authUser!.role)) {
      res.status(403).json({ error: 'Admin or moderator access required.' });
      return;
    }

    const parsed = ResolveReportInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid report resolution payload' });
      return;
    }

    const reportId = req.params.id;
    const { status, resolutionNote, suspendTargetUser } = parsed.data;

    const updated = await prisma.report.update({
      where: { id: reportId },
      data: { status, resolutionNote },
      include: {
        reporter: { select: { username: true } },
        targetUser: { select: { username: true } },
      },
    });

    if (suspendTargetUser && updated.targetUserId) {
      await prisma.user.update({
        where: { id: updated.targetUserId },
        data: { isSuspended: true },
      });
      await prisma.session.deleteMany({ where: { userId: updated.targetUserId } });
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.authUser!.id,
        action: `MODERATION_REPORT_${status.toUpperCase()}`,
        targetId: reportId,
        metadata: JSON.stringify({ resolutionNote, suspendTargetUser }),
        ipAddress: req.ip ?? null,
      },
    });

    res.status(200).json({ report: formatReportDTO(updated) });
  } catch (err) {
    next(err);
  }
});
