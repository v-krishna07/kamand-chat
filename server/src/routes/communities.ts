import crypto from 'node:crypto';
import { Router } from 'express';
import {
  CreateCommunityInputSchema,
  CreateCategoryInputSchema,
  CreateChannelInputSchema,
  UpdateChannelInputSchema,
  ChannelPermissionOverrideInputSchema,
  ReorderCategoriesInputSchema,
  ReorderChannelsInputSchema,
  CreateInviteInputSchema,
  CreateJoinRequestInputSchema,
  RespondJoinRequestInputSchema,
  UpdateMemberRoleInputSchema,
  UpdateMemberPreferencesInputSchema,
  type CommunityDTO,
  type CommunityRole,
  type ChannelDTO,
  type CategoryDTO,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import { formatMessageDTO } from './conversations.js';
import { isUserOnline, joinUserSocketsToConversation } from '../ws/socketServer.js';
import { getAcceptedContactIds } from './contacts.js';

export const communitiesRouter = Router();

const MANAGER_ROLES = new Set<string>(['owner', 'admin']);
const MODERATOR_ROLES = new Set<string>(['owner', 'admin', 'moderator']);

/**
 * Evaluates effective `canView` and `canSend` permissions for a given member role on a channel,
 * taking into account channel type (`announcement`), role (`readonly`), archived state,
 * and explicit `ChannelPermissionOverride` rows.
 */
export function evaluateChannelPermissions(
  role: CommunityRole,
  channel: {
    type: string;
    isArchived: boolean;
    overrides: Array<{ role: string; canView: boolean; canSend: boolean }>;
  }
): { canView: boolean; canSend: boolean } {
  if (role === 'owner' || role === 'admin') {
    return { canView: true, canSend: !channel.isArchived };
  }

  const override = channel.overrides.find((o) => o.role === role);

  const canView = override ? override.canView : true;
  if (!canView) {
    return { canView: false, canSend: false };
  }

  if (channel.isArchived) {
    return { canView: true, canSend: false };
  }

  if (override) {
    return { canView: true, canSend: override.canSend };
  }

  if (role === 'readonly') {
    return { canView: true, canSend: false };
  }

  if (channel.type === 'announcement') {
    return {
      canView: true,
      canSend: MODERATOR_ROLES.has(role),
    };
  }

  return { canView: true, canSend: true };
}

export async function checkConversationChannelAccess(
  conversationId: string,
  userId: string
): Promise<{
  isChannelConversation: boolean;
  canView: boolean;
  canSend: boolean;
  reason?: string;
}> {
  const channel = await prisma.channel.findUnique({
    where: { conversationId },
    include: { overrides: true },
  });

  if (!channel) {
    return { isChannelConversation: false, canView: true, canSend: true };
  }

  const member = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: { communityId: channel.communityId, userId },
    },
  });

  if (!member) {
    return {
      isChannelConversation: true,
      canView: false,
      canSend: false,
      reason: 'You are not a member of this community.',
    };
  }

  const perms = evaluateChannelPermissions(member.role as CommunityRole, channel);
  return {
    isChannelConversation: true,
    canView: perms.canView,
    canSend: perms.canSend,
    reason: !perms.canSend
      ? channel.isArchived
        ? 'This channel is archived.'
        : 'You do not have permission to post in this channel.'
      : undefined,
  };
}

async function ensureUserInCommunityChannelConversations(
  communityId: string,
  userId: string,
  role: string
): Promise<void> {
  const channels = await prisma.channel.findMany({
    where: { communityId },
    select: { conversationId: true },
  });

  for (const ch of channels) {
    await prisma.membership.upsert({
      where: {
        conversationId_userId: { conversationId: ch.conversationId, userId },
      },
      update: { role },
      create: {
        conversationId: ch.conversationId,
        userId,
        role,
      },
    });
    joinUserSocketsToConversation(userId, ch.conversationId);
  }
}

async function buildCommunityDTO(communityId: string, viewerId: string): Promise<CommunityDTO | null> {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    include: {
      members: { select: { userId: true, role: true, isMuted: true, isPinned: true, isArchived: true } },
      categories: {
        orderBy: { position: 'asc' },
        include: {
          channels: {
            orderBy: { position: 'asc' },
            include: { overrides: true },
          },
        },
      },
    },
  });

  if (!community) return null;

  const myMembership = community.members.find((m) => m.userId === viewerId) ?? null;
  const myRole = (myMembership?.role as CommunityRole | undefined) ?? null;

  const categories: CategoryDTO[] = community.categories.map((cat) => {
    const visibleChannels: ChannelDTO[] = [];
    for (const ch of cat.channels) {
      const perms = myRole
        ? evaluateChannelPermissions(myRole, ch)
        : { canView: !community.isPrivate, canSend: false };
      if (!perms.canView) continue;

      visibleChannels.push({
        id: ch.id,
        communityId: ch.communityId,
        categoryId: ch.categoryId,
        conversationId: ch.conversationId,
        name: ch.name,
        topic: ch.topic,
        type: (ch.type as ChannelDTO['type']) || 'text',
        position: ch.position,
        isPinned: ch.isPinned,
        isArchived: ch.isArchived,
        canView: perms.canView,
        canSend: perms.canSend,
        overrides: ch.overrides.map((o) => ({
          id: o.id,
          role: o.role as CommunityRole,
          canView: o.canView,
          canSend: o.canSend,
        })),
      });
    }

    return {
      id: cat.id,
      communityId: cat.communityId,
      name: cat.name,
      position: cat.position,
      channels: visibleChannels,
    };
  });

  return {
    id: community.id,
    name: community.name,
    slug: community.slug,
    description: community.description,
    isPrivate: community.isPrivate,
    myRole,
    isMuted: myMembership?.isMuted ?? false,
    isPinned: myMembership?.isPinned ?? false,
    isArchived: myMembership?.isArchived ?? false,
    memberCount: community.members.length,
    categories,
  };
}

// 1. List communities (joined + public discoverable communities)
communitiesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const all = await prisma.community.findMany({
      where: {
        OR: [{ isPrivate: false }, { members: { some: { userId } } }],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    const dtos = await Promise.all(all.map((c) => buildCommunityDTO(c.id, userId)));
    res.status(200).json({
      communities: dtos.filter((d): d is CommunityDTO => d !== null),
    });
  } catch (err) {
    next(err);
  }
});

// 2. Create a new structured Community with default Category & #general Channel
communitiesRouter.post('/', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = CreateCommunityInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid community input',
      });
      return;
    }

    const userId = req.authUser!.id;
    const { name, slug, description, isPrivate } = parsed.data;

    const existing = await prisma.community.findUnique({ where: { slug } });
    if (existing) {
      res.status(409).json({ error: 'A community with this slug already exists.' });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const comm = await tx.community.create({
        data: {
          name,
          slug,
          description,
          isPrivate,
          members: {
            create: { userId, role: 'owner' },
          },
        },
      });

      const cat = await tx.category.create({
        data: {
          communityId: comm.id,
          name: 'General',
          position: 0,
        },
      });

      const conv = await tx.conversation.create({
        data: {
          type: 'group',
          title: `#general (${name})`,
          memberships: {
            create: { userId, role: 'owner' },
          },
        },
      });

      await tx.channel.create({
        data: {
          communityId: comm.id,
          categoryId: cat.id,
          conversationId: conv.id,
          name: 'general',
          topic: `Welcome to ${name}`,
          type: 'text',
          position: 0,
        },
      });

      return comm;
    });

    await ensureUserInCommunityChannelConversations(created.id, userId, 'owner');
    const dto = await buildCommunityDTO(created.id, userId);
    res.status(201).json({ community: dto });
  } catch (err) {
    next(err);
  }
});

// 3. Create a Category inside a Community
communitiesRouter.post('/:id/categories', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.authUser!.id;

    const member = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!member || !MANAGER_ROLES.has(member.role)) {
      res.status(403).json({ error: 'Only community owners and admins can create categories.' });
      return;
    }

    const parsed = CreateCategoryInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid category name' });
      return;
    }

    const count = await prisma.category.count({ where: { communityId } });
    await prisma.category.create({
      data: {
        communityId,
        name: parsed.data.name,
        position: count,
      },
    });

    const dto = await buildCommunityDTO(communityId, userId);
    res.status(201).json({ community: dto });
  } catch (err) {
    next(err);
  }
});

// 4. Drag-to-Reorder Categories
communitiesRouter.put(
  '/:id/categories/reorder',
  requireAuth,
  csrfProtection,
  async (req, res, next) => {
    try {
      const communityId = req.params.id;
      const userId = req.authUser!.id;

      const member = await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId } },
      });
      if (!member || !MANAGER_ROLES.has(member.role)) {
        res.status(403).json({ error: 'Only owners and admins can reorder categories.' });
        return;
      }

      const parsed = ReorderCategoriesInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid category order list' });
        return;
      }

      await prisma.$transaction(
        parsed.data.orderedCategoryIds.map((catId, index) =>
          prisma.category.updateMany({
            where: { id: catId, communityId },
            data: { position: index },
          })
        )
      );

      const dto = await buildCommunityDTO(communityId, userId);
      res.status(200).json({ community: dto });
    } catch (err) {
      next(err);
    }
  }
);

// 5. Create a Channel inside a Category
communitiesRouter.post('/:id/channels', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.authUser!.id;

    const member = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!member || !MANAGER_ROLES.has(member.role)) {
      res.status(403).json({ error: 'Only owners and admins can create channels.' });
      return;
    }

    const parsed = CreateChannelInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid channel input',
      });
      return;
    }

    const { categoryId, name, topic, type } = parsed.data;
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.communityId !== communityId) {
      res.status(404).json({ error: 'Category not found in this community.' });
      return;
    }

    const existingCount = await prisma.channel.count({ where: { categoryId } });
    const communityMembers = await prisma.communityMember.findMany({
      where: { communityId },
      select: { userId: true, role: true },
    });

    const createdChannel = await prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.create({
        data: {
          type: 'group',
          title: `#${name}`,
          memberships: {
            create: communityMembers.map((cm) => ({
              userId: cm.userId,
              role: cm.role,
            })),
          },
        },
      });

      return tx.channel.create({
        data: {
          communityId,
          categoryId,
          conversationId: conv.id,
          name,
          topic,
          type,
          position: existingCount,
        },
      });
    });

    for (const cm of communityMembers) {
      joinUserSocketsToConversation(cm.userId, createdChannel.conversationId);
    }

    const dto = await buildCommunityDTO(communityId, userId);
    res.status(201).json({ community: dto, channelId: createdChannel.id });
  } catch (err) {
    next(err);
  }
});

// 6. Drag-to-Reorder Channels within a Category
communitiesRouter.put(
  '/:id/channels/reorder',
  requireAuth,
  csrfProtection,
  async (req, res, next) => {
    try {
      const communityId = req.params.id;
      const userId = req.authUser!.id;

      const member = await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId } },
      });
      if (!member || !MANAGER_ROLES.has(member.role)) {
        res.status(403).json({ error: 'Only owners and admins can reorder channels.' });
        return;
      }

      const parsed = ReorderChannelsInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid channel order payload' });
        return;
      }

      const { categoryId, orderedChannelIds } = parsed.data;
      await prisma.$transaction(
        orderedChannelIds.map((chId, index) =>
          prisma.channel.updateMany({
            where: { id: chId, communityId },
            data: { categoryId, position: index },
          })
        )
      );

      const dto = await buildCommunityDTO(communityId, userId);
      res.status(200).json({ community: dto });
    } catch (err) {
      next(err);
    }
  }
);

// 7. Update Channel (Topic, Pin, Archive, Name)
communitiesRouter.patch('/channels/:channelId', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const { channelId } = req.params;
    const userId = req.authUser!.id;

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      res.status(404).json({ error: 'Channel not found.' });
      return;
    }

    const member = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: channel.communityId, userId } },
    });
    if (!member || !MODERATOR_ROLES.has(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions to update channel.' });
      return;
    }

    const parsed = UpdateChannelInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid channel update data' });
      return;
    }

    await prisma.channel.update({
      where: { id: channelId },
      data: parsed.data,
    });

    const dto = await buildCommunityDTO(channel.communityId, userId);
    res.status(200).json({ community: dto });
  } catch (err) {
    next(err);
  }
});

// 8. Set Per-Channel Role Permission Override (`canView`, `canSend`)
communitiesRouter.put(
  '/channels/:channelId/overrides',
  requireAuth,
  csrfProtection,
  async (req, res, next) => {
    try {
      const { channelId } = req.params;
      const userId = req.authUser!.id;

      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) {
        res.status(404).json({ error: 'Channel not found.' });
        return;
      }

      const member = await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId: channel.communityId, userId } },
      });
      if (!member || !MANAGER_ROLES.has(member.role)) {
        res.status(403).json({ error: 'Only owners and admins can configure channel overrides.' });
        return;
      }

      const parsed = ChannelPermissionOverrideInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid permission override payload' });
        return;
      }

      const { role, canView, canSend } = parsed.data;
      await prisma.channelPermissionOverride.upsert({
        where: {
          channelId_role: { channelId, role },
        },
        update: { canView, canSend },
        create: { channelId, role, canView, canSend },
      });

      const dto = await buildCommunityDTO(channel.communityId, userId);
      res.status(200).json({ community: dto });
    } catch (err) {
      next(err);
    }
  }
);

// 9. Community Member List & Role / Mute / Pin / Archive Management
communitiesRouter.get('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.authUser!.id;

    const myMember = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!myMember) {
      res.status(403).json({ error: 'Only community members can view the member list.' });
      return;
    }

    const acceptedContacts = await getAcceptedContactIds(userId);
    const members = await prisma.communityMember.findMany({
      where: { communityId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });

    res.status(200).json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role as CommunityRole,
        isMuted: m.isMuted,
        isPinned: m.isPinned,
        isArchived: m.isArchived,
        joinedAt: m.joinedAt.toISOString(),
        user: toUserSummary(m.user, {
          isSelf: m.userId === userId,
          canSeePrivateRoom: m.userId === userId || acceptedContacts.has(m.userId),
          isOnline: isUserOnline(m.userId),
        }),
      })),
    });
  } catch (err) {
    next(err);
  }
});

communitiesRouter.patch(
  '/:id/members/:targetUserId',
  requireAuth,
  csrfProtection,
  async (req, res, next) => {
    try {
      const communityId = req.params.id;
      const { targetUserId } = req.params;
      const actorId = req.authUser!.id;

      const actorMember = await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId: actorId } },
      });
      if (!actorMember || !MANAGER_ROLES.has(actorMember.role)) {
        res.status(403).json({ error: 'Only owners and admins can change member roles.' });
        return;
      }

      const parsed = UpdateMemberRoleInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      const updated = await prisma.communityMember.update({
        where: { communityId_userId: { communityId, userId: targetUserId } },
        data: { role: parsed.data.role },
      });

      res.status(200).json({ ok: true, role: updated.role });
    } catch (err) {
      next(err);
    }
  }
);

communitiesRouter.patch(
  '/:id/preferences',
  requireAuth,
  csrfProtection,
  async (req, res, next) => {
    try {
      const communityId = req.params.id;
      const userId = req.authUser!.id;

      const parsed = UpdateMemberPreferencesInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid preferences' });
        return;
      }

      await prisma.communityMember.update({
        where: { communityId_userId: { communityId, userId } },
        data: parsed.data,
      });

      const dto = await buildCommunityDTO(communityId, userId);
      res.status(200).json({ community: dto });
    } catch (err) {
      next(err);
    }
  }
);

// 10. Invite Links (Expiry & Max Uses)
communitiesRouter.post('/:id/invites', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.authUser!.id;

    const member = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!member || !MODERATOR_ROLES.has(member.role)) {
      res.status(403).json({ error: 'Only moderators, admins, or owners can create invite links.' });
      return;
    }

    const parsed = CreateInviteInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid invite parameters' });
      return;
    }

    const code = crypto.randomBytes(5).toString('hex').toUpperCase();
    const expiresAt = parsed.data.expiresInHours
      ? new Date(Date.now() + parsed.data.expiresInHours * 3600_000)
      : null;

    const invite = await prisma.invite.create({
      data: {
        code,
        communityId,
        creatorId: userId,
        maxUses: parsed.data.maxUses ?? null,
        expiresAt,
      },
    });

    res.status(201).json({
      invite: {
        id: invite.id,
        code: invite.code,
        communityId: invite.communityId,
        uses: invite.uses,
        maxUses: invite.maxUses,
        expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
        createdAt: invite.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

communitiesRouter.post('/join/:code', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const userId = req.authUser!.id;

    const invite = await prisma.invite.findUnique({ where: { code } });
    if (!invite) {
      res.status(404).json({ error: 'Invalid invite code.' });
      return;
    }

    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
      res.status(410).json({ error: 'This invite link has expired.' });
      return;
    }

    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      res.status(410).json({ error: 'This invite link has reached its maximum number of uses.' });
      return;
    }

    const existingMember = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId: invite.communityId, userId },
      },
    });

    if (!existingMember) {
      await prisma.$transaction([
        prisma.invite.update({
          where: { id: invite.id },
          data: { uses: { increment: 1 } },
        }),
        prisma.communityMember.create({
          data: {
            communityId: invite.communityId,
            userId,
            role: 'member',
          },
        }),
      ]);
      await ensureUserInCommunityChannelConversations(invite.communityId, userId, 'member');
    }

    const dto = await buildCommunityDTO(invite.communityId, userId);
    res.status(200).json({ community: dto });
  } catch (err) {
    next(err);
  }
});

// 11. Join Requests with Approval Workflow
communitiesRouter.post(
  '/:id/join-requests',
  requireAuth,
  csrfProtection,
  async (req, res, next) => {
    try {
      const communityId = req.params.id;
      const userId = req.authUser!.id;

      const parsed = CreateJoinRequestInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid join request note' });
        return;
      }

      const existingMember = await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId } },
      });
      if (existingMember) {
        res.status(409).json({ error: 'You are already a member of this community.' });
        return;
      }

      const jr = await prisma.joinRequest.upsert({
        where: { communityId_userId: { communityId, userId } },
        update: { status: 'pending', note: parsed.data.note },
        create: {
          communityId,
          userId,
          status: 'pending',
          note: parsed.data.note,
        },
        include: { user: true },
      });

      res.status(201).json({
        joinRequest: {
          id: jr.id,
          communityId: jr.communityId,
          status: jr.status,
          note: jr.note,
          createdAt: jr.createdAt.toISOString(),
          user: toUserSummary(jr.user, { isSelf: true, canSeePrivateRoom: false }),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

communitiesRouter.get('/:id/join-requests', requireAuth, async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.authUser!.id;

    const member = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!member || !MODERATOR_ROLES.has(member.role)) {
      res.status(403).json({ error: 'Only moderators, admins, and owners can view join requests.' });
      return;
    }

    const requests = await prisma.joinRequest.findMany({
      where: { communityId, status: 'pending' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json({
      joinRequests: requests.map((jr) => ({
        id: jr.id,
        communityId: jr.communityId,
        status: jr.status,
        note: jr.note,
        createdAt: jr.createdAt.toISOString(),
        user: toUserSummary(jr.user, { isSelf: false, canSeePrivateRoom: false }),
      })),
    });
  } catch (err) {
    next(err);
  }
});

communitiesRouter.post(
  '/join-requests/:requestId/respond',
  requireAuth,
  csrfProtection,
  async (req, res, next) => {
    try {
      const { requestId } = req.params;
      const userId = req.authUser!.id;

      const parsed = RespondJoinRequestInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }

      const jr = await prisma.joinRequest.findUnique({ where: { id: requestId } });
      if (!jr || jr.status !== 'pending') {
        res.status(404).json({ error: 'Pending join request not found.' });
        return;
      }

      const member = await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId: jr.communityId, userId } },
      });
      if (!member || !MODERATOR_ROLES.has(member.role)) {
        res.status(403).json({ error: 'Insufficient permissions to review join requests.' });
        return;
      }

      const nextStatus = parsed.data.action === 'approve' ? 'approved' : 'rejected';
      await prisma.joinRequest.update({
        where: { id: requestId },
        data: { status: nextStatus },
      });

      if (nextStatus === 'approved') {
        await prisma.communityMember.upsert({
          where: {
            communityId_userId: { communityId: jr.communityId, userId: jr.userId },
          },
          update: {},
          create: {
            communityId: jr.communityId,
            userId: jr.userId,
            role: 'member',
          },
        });
        await ensureUserInCommunityChannelConversations(jr.communityId, jr.userId, 'member');
      }

      res.status(200).json({ ok: true, status: nextStatus });
    } catch (err) {
      next(err);
    }
  }
);

// 12. Threaded Replies for a Root Message
communitiesRouter.get('/threads/:rootMessageId', requireAuth, async (req, res, next) => {
  try {
    const { rootMessageId } = req.params;
    const userId = req.authUser!.id;

    const rootMessage = await prisma.message.findUnique({
      where: { id: rootMessageId },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        replyTo: {
          include: { sender: { select: { displayName: true } } },
        },
        _count: {
          select: { threadReplies: true },
        },
      },
    });

    if (!rootMessage) {
      res.status(404).json({ error: 'Thread root message not found.' });
      return;
    }

    const membership = await prisma.membership.findUnique({
      where: {
        conversationId_userId: { conversationId: rootMessage.conversationId, userId },
      },
    });
    if (!membership) {
      res.status(403).json({ error: 'You do not have access to this thread.' });
      return;
    }

    const channelAccess = await checkConversationChannelAccess(rootMessage.conversationId, userId);
    if (!channelAccess.canView) {
      res.status(403).json({ error: 'You do not have permission to view this channel thread.' });
      return;
    }

    const replies = await prisma.message.findMany({
      where: { threadRootId: rootMessageId },
      orderBy: { seq: 'asc' },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        replyTo: {
          include: { sender: { select: { displayName: true } } },
        },
        _count: {
          select: { threadReplies: true },
        },
      },
    });

    res.status(200).json({
      rootMessage: formatMessageDTO(rootMessage),
      replies: replies.map(formatMessageDTO),
    });
  } catch (err) {
    next(err);
  }
});
