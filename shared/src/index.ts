import { z } from 'zod';

// ============================================================================
// 1. Auth & User Schemas
// ============================================================================

export const UsernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(24, 'Username must be at most 24 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores')
  .transform((v) => v.toLowerCase());

export const EmailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address')
  .max(120)
  .transform((v) => v.toLowerCase());

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const RegisterInputSchema = z.object({
  username: UsernameSchema,
  email: EmailSchema,
  displayName: z.string().trim().min(1, 'Display name is required').max(50),
  password: PasswordSchema,
  roomCode: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v && v.length > 0 ? v.toUpperCase() : undefined)),
});

export const LoginInputSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required').max(120),
  password: z.string().min(1, 'Password is required').max(128),
});

export const GoogleLoginInputSchema = z.object({
  idToken: z.string().min(10, 'Google ID token is required'),
});

export type GoogleLoginInput = z.infer<typeof GoogleLoginInputSchema>;

export const UserSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string(),
  roomCode: z.string().nullable(),
  isRoomPrivate: z.boolean().optional().default(true),
  role: z.enum(['member', 'moderator', 'admin', 'super_admin']),
  isOnline: z.boolean().optional(),
  lastSeenAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type UserSummary = z.infer<typeof UserSummarySchema>;

// ============================================================================
// 2. Session, Device, E2EE Key & Face Auth Schemas (Phase 4)
// ============================================================================

export const SessionDTO_Schema = z.object({
  id: z.string().uuid(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
  isCurrent: z.boolean(),
});

export type SessionDTO = z.infer<typeof SessionDTO_Schema>;

export const RegisterDeviceKeyInputSchema = z.object({
  deviceId: z.string().uuid().optional(),
  deviceName: z.string().trim().min(1).max(80),
  identityPublicKey: z.string().min(16).max(2048), // JWK/Base64 ECDH public key
  signingPublicKey: z.string().min(16).max(2048),  // JWK/Base64 ECDSA public key
  wrappedPrivateKeyBackup: z.string().max(8192).nullable().optional(),
  backupSalt: z.string().max(256).nullable().optional(),
  backupIv: z.string().max(256).nullable().optional(),
});

export type RegisterDeviceKeyInput = z.infer<typeof RegisterDeviceKeyInputSchema>;

export const DeviceDTO_Schema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  deviceName: z.string(),
  identityPublicKey: z.string(),
  signingPublicKey: z.string(),
  keyFingerprint: z.string(),
  createdAt: z.string(),
});

export type DeviceDTO = z.infer<typeof DeviceDTO_Schema>;

export const DistributeSenderKeyInputSchema = z.object({
  conversationId: z.string().uuid(),
  generation: z.number().int().positive(),
  envelopes: z
    .array(
      z.object({
        recipientUserId: z.string().uuid(),
        wrappedSenderKey: z.string().min(16).max(4096),
        nonce: z.string().min(8).max(256),
      })
    )
    .min(1),
});

export type DistributeSenderKeyInput = z.infer<typeof DistributeSenderKeyInputSchema>;

export const FaceEnrollInputSchema = z.object({
  deviceId: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(80),
  encryptedEmbedding: z.string().min(16).max(16384),
  embeddingIv: z.string().min(8).max(256),
  faceSigningPublicKey: z.string().min(16).max(2048), // SPKI/JWK ECDSA P-256 public key
});

export type FaceEnrollInput = z.infer<typeof FaceEnrollInputSchema>;

export const FaceChallengeRequestSchema = z.object({
  identifier: z.string().trim().min(1).max(120),
  deviceId: z.string().uuid(),
});

export type FaceChallengeRequest = z.infer<typeof FaceChallengeRequestSchema>;

export const FaceVerifyLoginInputSchema = z.object({
  challengeId: z.string().uuid(),
  deviceId: z.string().uuid(),
  livenessGesture: z.enum(['blink', 'turn_left', 'turn_right']),
  embeddingDistance: z.number().nonnegative(),
  signatureBase64: z.string().min(16).max(1024),
});

export type FaceVerifyLoginInput = z.infer<typeof FaceVerifyLoginInputSchema>;

// ============================================================================
// 3. Profile & Contact Schemas (Phase 2)
// ============================================================================

export const UpdateProfileInputSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name is required').max(50).optional(),
  bio: z.string().trim().max(160, 'Bio cannot exceed 160 characters').optional(),
  avatarUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (val) =>
        val === '' ||
        val.startsWith('data:image/') ||
        val.startsWith('https://') ||
        val.startsWith('http://'),
      'Avatar must be a valid image URL or data URI'
    )
    .nullable()
    .optional(),
  roomCode: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v.toUpperCase() : null)),
  isRoomPrivate: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

export const ContactRequestInputSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Enter a username, email, or scan a Kamand QR code')
    .max(200),
});

export type ContactRequestInput = z.infer<typeof ContactRequestInputSchema>;

export const RespondContactInputSchema = z.object({
  action: z.enum(['accept', 'decline']),
});

export type RespondContactInput = z.infer<typeof RespondContactInputSchema>;

export const BlockUserInputSchema = z.object({
  targetUserId: z.string().uuid('Invalid user ID'),
});

export type BlockUserInput = z.infer<typeof BlockUserInputSchema>;

export const ContactDTO_Schema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'blocked']),
  direction: z.enum(['incoming', 'outgoing']),
  peer: UserSummarySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ContactDTO = z.infer<typeof ContactDTO_Schema>;

// ============================================================================
// 4. Status / Stories Schemas (Phase 2)
// ============================================================================

export const CreateStatusInputSchema = z.object({
  caption: z
    .string()
    .trim()
    .min(1, 'Status text or caption is required')
    .max(500, 'Status cannot exceed 500 characters'),
  mediaDataUrl: z
    .string()
    .max(1_500_000, 'Image size exceeds limit')
    .refine((v) => v.startsWith('data:image/'), 'Only data:image/* media is supported in status')
    .nullable()
    .optional(),
  bgColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
    .default('#0284c7'),
  visibility: z.enum(['contacts', 'custom']).default('contacts'),
  allowedUserIds: z.array(z.string().uuid()).max(200).optional().default([]),
});

export type CreateStatusInput = z.infer<typeof CreateStatusInputSchema>;

export const StatusViewDTO_Schema = z.object({
  viewer: z.object({
    id: z.string().uuid(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  viewedAt: z.string(),
});

export type StatusViewDTO = z.infer<typeof StatusViewDTO_Schema>;

export const StatusDTO_Schema = z.object({
  id: z.string().uuid(),
  author: UserSummarySchema,
  caption: z.string(),
  mediaDataUrl: z.string().nullable(),
  bgColor: z.string(),
  visibility: z.enum(['contacts', 'custom']),
  createdAt: z.string(),
  expiresAt: z.string(),
  hasViewed: z.boolean(),
  viewCount: z.number().int().nonnegative(),
  views: z.array(StatusViewDTO_Schema).optional(),
});

export type StatusDTO = z.infer<typeof StatusDTO_Schema>;

// ============================================================================
// 5. Conversation & Message Schemas (Phase 1–4)
// ============================================================================

export const CreateDirectConversationSchema = z.object({
  targetUserId: z.string().uuid('Invalid target user ID'),
});

export const MessageTypeSchema = z.enum(['text', 'image', 'voice', 'file', 'system']);

export const MessageDTO_Schema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  sender: z.object({
    id: z.string().uuid(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  body: z.string(),
  ciphertext: z.string().nullable(),
  nonce: z.string().nullable(),
  senderKeyGeneration: z.number().int().positive().nullable().optional(),
  type: MessageTypeSchema,
  replyToId: z.string().uuid().nullable(),
  replyToPreview: z
    .object({
      id: z.string().uuid(),
      senderName: z.string(),
      body: z.string(),
    })
    .nullable()
    .optional(),
  threadRootId: z.string().uuid().nullable().optional(),
  threadReplyCount: z.number().int().nonnegative().optional().default(0),
  seq: z.number().int().positive(),
  status: z.enum(['sending', 'sent', 'delivered', 'read', 'failed']).default('sent'),
  editedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type MessageDTO = z.infer<typeof MessageDTO_Schema>;

export const ConversationSummarySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['direct', 'group']),
  title: z.string().nullable(),
  lastSeq: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  lastReadSeq: z.number().int().nonnegative(),
  updatedAt: z.string(),
  participants: z.array(UserSummarySchema),
  lastMessage: MessageDTO_Schema.nullable(),
  isBlocked: z.boolean().optional().default(false),
});

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const CursorPaginationQuerySchema = z.object({
  beforeSeq: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .refine(
      (v) => v === undefined || (!Number.isNaN(v) && v > 0),
      'beforeSeq must be a positive integer'
    ),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Math.max(parseInt(v, 10), 1), 100) : 40)),
});

// ============================================================================
// 6. Structured Communities, Categories, Channels & Roles (Phase 3)
// ============================================================================

export const CommunityRoleSchema = z.enum([
  'owner',
  'admin',
  'moderator',
  'member',
  'readonly',
]);

export type CommunityRole = z.infer<typeof CommunityRoleSchema>;

export const ChannelTypeSchema = z.enum(['text', 'announcement', 'voice']);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export const CreateCommunityInputSchema = z.object({
  name: z.string().trim().min(2, 'Community name must be at least 2 characters').max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens'),
  description: z.string().trim().max(300).optional().default(''),
  isPrivate: z.boolean().optional().default(false),
});

export type CreateCommunityInput = z.infer<typeof CreateCommunityInputSchema>;

export const CreateCategoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(45),
});

export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;

export const CreateChannelInputSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  name: z
    .string()
    .trim()
    .min(1, 'Channel name is required')
    .max(45)
    .transform((v) => v.toLowerCase().replace(/\s+/g, '-')),
  topic: z.string().trim().max(250).optional().default(''),
  type: ChannelTypeSchema.default('text'),
});

export type CreateChannelInput = z.infer<typeof CreateChannelInputSchema>;

export const UpdateChannelInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(45)
    .transform((v) => v.toLowerCase().replace(/\s+/g, '-'))
    .optional(),
  topic: z.string().trim().max(250).optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export type UpdateChannelInput = z.infer<typeof UpdateChannelInputSchema>;

export const ChannelPermissionOverrideInputSchema = z.object({
  role: CommunityRoleSchema,
  canView: z.boolean(),
  canSend: z.boolean(),
});

export type ChannelPermissionOverrideInput = z.infer<typeof ChannelPermissionOverrideInputSchema>;

export const ReorderCategoriesInputSchema = z.object({
  orderedCategoryIds: z.array(z.string().uuid()).min(1),
});

export const ReorderChannelsInputSchema = z.object({
  categoryId: z.string().uuid(),
  orderedChannelIds: z.array(z.string().uuid()).min(1),
});

export const CreateInviteInputSchema = z.object({
  expiresInHours: z.number().int().min(1).max(720).optional().default(168),
  maxUses: z.number().int().min(1).max(1000).nullable().optional().default(null),
});

export type CreateInviteInput = z.infer<typeof CreateInviteInputSchema>;

export const CreateJoinRequestInputSchema = z.object({
  note: z.string().trim().max(240).optional().default(''),
});

export const RespondJoinRequestInputSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export const UpdateMemberRoleInputSchema = z.object({
  role: CommunityRoleSchema,
});

export const UpdateMemberPreferencesInputSchema = z.object({
  isMuted: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const ChannelDTO_Schema = z.object({
  id: z.string().uuid(),
  communityId: z.string().uuid(),
  categoryId: z.string().uuid(),
  conversationId: z.string().uuid(),
  name: z.string(),
  topic: z.string(),
  type: ChannelTypeSchema,
  position: z.number().int(),
  isPinned: z.boolean(),
  isArchived: z.boolean(),
  canView: z.boolean(),
  canSend: z.boolean(),
  overrides: z.array(
    z.object({
      id: z.string().uuid(),
      role: CommunityRoleSchema,
      canView: z.boolean(),
      canSend: z.boolean(),
    })
  ),
});

export type ChannelDTO = z.infer<typeof ChannelDTO_Schema>;

export const CategoryDTO_Schema = z.object({
  id: z.string().uuid(),
  communityId: z.string().uuid(),
  name: z.string(),
  position: z.number().int(),
  channels: z.array(ChannelDTO_Schema),
});

export type CategoryDTO = z.infer<typeof CategoryDTO_Schema>;

export const CommunityMemberDTO_Schema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  role: CommunityRoleSchema,
  isMuted: z.boolean(),
  isPinned: z.boolean(),
  isArchived: z.boolean(),
  joinedAt: z.string(),
  user: UserSummarySchema,
});

export type CommunityMemberDTO = z.infer<typeof CommunityMemberDTO_Schema>;

export const CommunityDTO_Schema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  isPrivate: z.boolean(),
  myRole: CommunityRoleSchema.nullable(),
  isMuted: z.boolean().optional().default(false),
  isPinned: z.boolean().optional().default(false),
  isArchived: z.boolean().optional().default(false),
  memberCount: z.number().int().nonnegative(),
  categories: z.array(CategoryDTO_Schema),
});

export type CommunityDTO = z.infer<typeof CommunityDTO_Schema>;

export const InviteDTO_Schema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  communityId: z.string().uuid(),
  uses: z.number().int().nonnegative(),
  maxUses: z.number().int().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

export type InviteDTO = z.infer<typeof InviteDTO_Schema>;

export const JoinRequestDTO_Schema = z.object({
  id: z.string().uuid(),
  communityId: z.string().uuid(),
  status: z.enum(['pending', 'approved', 'rejected']),
  note: z.string(),
  createdAt: z.string(),
  user: UserSummarySchema,
});

export type JoinRequestDTO = z.infer<typeof JoinRequestDTO_Schema>;

// ============================================================================
// 7. WebSocket Event Payloads & Acknowledgements
// ============================================================================

export const WsSendMessagePayloadSchema = z
  .object({
    id: z.string().uuid('Client message ID must be a valid UUID v4'),
    conversationId: z.string().uuid('Invalid conversation ID'),
    body: z.string().trim().max(4000, 'Message cannot exceed 4000 characters').default(''),
    ciphertext: z.string().max(16000).nullable().optional(),
    nonce: z.string().max(256).nullable().optional(),
    senderKeyGeneration: z.number().int().positive().nullable().optional(),
    type: MessageTypeSchema.default('text'),
    replyToId: z.string().uuid().nullable().optional(),
    threadRootId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) => data.body.length > 0 || (Boolean(data.ciphertext) && Boolean(data.nonce)),
    'Message must contain either a body or E2EE ciphertext + nonce'
  );

export type WsSendMessagePayload = z.infer<typeof WsSendMessagePayloadSchema>;

export const WsSendMessageAckSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    message: MessageDTO_Schema,
    deduplicated: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    code: z.enum([
      'VALIDATION_ERROR',
      'FORBIDDEN',
      'NOT_FOUND',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ]),
  }),
]);

export type WsSendMessageAck = z.infer<typeof WsSendMessageAckSchema>;

export const WsMarkDeliveredPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  seq: z.number().int().positive(),
});

export type WsMarkDeliveredPayload = z.infer<typeof WsMarkDeliveredPayloadSchema>;

export const WsMarkReadPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  seq: z.number().int().positive(),
});

export type WsMarkReadPayload = z.infer<typeof WsMarkReadPayloadSchema>;

export const WsTypingPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  isTyping: z.boolean(),
});

export type WsTypingPayload = z.infer<typeof WsTypingPayloadSchema>;

export const WsTypingUpdateEventSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  isTyping: z.boolean(),
});

export type WsTypingUpdateEvent = z.infer<typeof WsTypingUpdateEventSchema>;

export const WsSyncResumePayloadSchema = z.object({
  cursors: z.record(z.string().uuid(), z.number().int().nonnegative()),
});

export type WsSyncResumePayload = z.infer<typeof WsSyncResumePayloadSchema>;

export const WsSyncResumeAckSchema = z.object({
  ok: z.boolean(),
  missedMessages: z.record(z.string().uuid(), z.array(MessageDTO_Schema)),
});

export type WsSyncResumeAck = z.infer<typeof WsSyncResumeAckSchema>;
