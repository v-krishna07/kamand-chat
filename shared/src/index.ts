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
  isSuspended: z.boolean().optional().default(false),
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
// 5. Conversation, Media Attachment, Reaction & Message Schemas (Phase 1–9)
// ============================================================================

export const CreateDirectConversationSchema = z.object({
  targetUserId: z.string().uuid('Invalid target user ID'),
});

export const MessageTypeSchema = z.enum(['text', 'image', 'voice', 'file', 'system']);

export const ReactionDTO_Schema = z.object({
  emoji: z.string().min(1).max(16),
  userId: z.string().uuid(),
  username: z.string(),
});
export type ReactionDTO = z.infer<typeof ReactionDTO_Schema>;

export const AttachmentDTO_Schema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  url: z.string(),
  isEncrypted: z.boolean().default(false),
  encryptionIv: z.string().nullable().optional(),
  durationSec: z.number().nonnegative().nullable().optional(),
  waveform: z.array(z.number()).optional(),
});
export type AttachmentDTO = z.infer<typeof AttachmentDTO_Schema>;

export const LinkPreviewDTO_Schema = z.object({
  url: z.string().url(),
  title: z.string(),
  description: z.string(),
  siteName: z.string().nullable(),
});
export type LinkPreviewDTO = z.infer<typeof LinkPreviewDTO_Schema>;

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
  isPinned: z.boolean().optional().default(false),
  isStarred: z.boolean().optional().default(false),
  forwardedFromName: z.string().nullable().optional(),
  reactions: z.array(ReactionDTO_Schema).optional().default([]),
  attachment: AttachmentDTO_Schema.nullable().optional(),
  linkPreview: LinkPreviewDTO_Schema.nullable().optional(),
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
  isMuted: z.boolean().optional().default(false),
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
// 7. Voice & Video Calls Signaling & CallLog Schemas (Phase 5)
// ============================================================================

export const CallMediaTypeSchema = z.enum(['audio', 'video']);
export type CallMediaType = z.infer<typeof CallMediaTypeSchema>;

export const CallStatusSchema = z.enum([
  'ringing',
  'ongoing',
  'completed',
  'declined',
  'busy',
  'missed',
]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const WsCallInitiatePayloadSchema = z.object({
  callId: z.string().uuid(),
  conversationId: z.string().uuid(),
  mediaType: CallMediaTypeSchema,
  isGroup: z.boolean().default(false),
  e2eeKeyMaterial: z.string().min(16).max(512), // 256-bit base64 key for Insertable Streams media E2EE
  keyGeneration: z.number().int().positive().default(1),
});

export type WsCallInitiatePayload = z.infer<typeof WsCallInitiatePayloadSchema>;

export const WsCallResponsePayloadSchema = z.object({
  callId: z.string().uuid(),
  conversationId: z.string().uuid(),
});

export type WsCallResponsePayload = z.infer<typeof WsCallResponsePayloadSchema>;

export const WsCallSignalPayloadSchema = z.object({
  callId: z.string().uuid(),
  conversationId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  signalType: z.enum(['offer', 'answer', 'ice-candidate', 'media-state', 'e2ee-key']),
  sdp: z.string().max(64_000).optional(),
  candidate: z
    .object({
      candidate: z.string(),
      sdpMid: z.string().nullable().optional(),
      sdpMLineIndex: z.number().nullable().optional(),
    })
    .optional(),
  mediaState: z
    .object({
      isMuted: z.boolean(),
      isCameraOff: z.boolean(),
      isScreenSharing: z.boolean(),
    })
    .optional(),
  e2eeKeyMaterial: z.string().max(512).optional(),
  keyGeneration: z.number().int().positive().optional(),
});

export type WsCallSignalPayload = z.infer<typeof WsCallSignalPayloadSchema>;

export const CallLogDTO_Schema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  initiatorId: z.string().uuid(),
  mediaType: CallMediaTypeSchema,
  isGroup: z.boolean(),
  status: CallStatusSchema,
  durationSec: z.number().int().nonnegative(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});

export type CallLogDTO = z.infer<typeof CallLogDTO_Schema>;

// ============================================================================
// 8. LLM / AI Assistant Schemas (Phase 6 - Section 11)
// ============================================================================

export const AiActionSchema = z.enum([
  'reply',
  'summarize',
  'smart_replies',
  'translate',
  'rewrite',
  'extract_tasks',
  'ask',
]);
export type AiAction = z.infer<typeof AiActionSchema>;

export const AiContextMessageSchema = z.object({
  senderName: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(4000),
  createdAt: z.string().optional(),
});
export type AiContextMessage = z.infer<typeof AiContextMessageSchema>;

export const AiUserPreferencesSchema = z.object({
  preferredLanguage: z.string().trim().max(40).default('English'),
  defaultTone: z.enum(['concise', 'friendly', 'academic', 'formal']).default('concise'),
  customContextNote: z.string().trim().max(240).optional().default(''),
});
export type AiUserPreferences = z.infer<typeof AiUserPreferencesSchema>;

export const AiAssistRequestSchema = z.object({
  action: AiActionSchema,
  explicitConsent: z.boolean().refine((v) => v === true, {
    message: 'Explicit user consent is mandatory before sharing any context with the AI assistant.',
  }),
  prompt: z.string().trim().max(2000).optional().default(''),
  targetLanguage: z.string().trim().max(40).optional().default('Hindi'),
  rewriteTone: z
    .enum(['concise', 'friendly', 'academic', 'formal', 'hinglish'])
    .optional()
    .default('concise'),
  selectedMessages: z.array(AiContextMessageSchema).max(50).default([]),
  preferences: AiUserPreferencesSchema.optional(),
});
export type AiAssistRequest = z.infer<typeof AiAssistRequestSchema>;

export const AiExtractedTaskSchema = z.object({
  title: z.string(),
  dueOrTime: z.string().nullable(),
  owner: z.string().nullable(),
});
export type AiExtractedTask = z.infer<typeof AiExtractedTaskSchema>;

export const AiAssistResponseSchema = z.object({
  action: AiActionSchema,
  provider: z.string(),
  outputText: z.string(),
  smartReplies: z.array(z.string()).optional(),
  extractedTasks: z.array(AiExtractedTaskSchema).optional(),
  tokensUsed: z.number().int().nonnegative(),
  remainingBudget: z.number().int().nonnegative(),
});
export type AiAssistResponse = z.infer<typeof AiAssistResponseSchema>;

export const AiTriageReportInputSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  attachedMessages: z.array(AiContextMessageSchema).max(20),
});
export type AiTriageReportInput = z.infer<typeof AiTriageReportInputSchema>;

// ============================================================================
// 9. Phase 9: Media Upload, Link Previews, Moderation Reports & Admin Schemas
// ============================================================================

export const UploadAttachmentInputSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(3).max(100),
  base64Data: z.string().min(4).max(8_000_000), // Up to ~6MB raw binary
  isEncrypted: z.boolean().optional().default(false),
  encryptionIv: z.string().max(128).nullable().optional(),
  durationSec: z.number().nonnegative().nullable().optional(),
  waveform: z.array(z.number().min(0).max(1)).max(64).optional(),
});
export type UploadAttachmentInput = z.infer<typeof UploadAttachmentInputSchema>;

export const FetchLinkPreviewInputSchema = z.object({
  url: z.string().trim().url('Must be a valid http/https URL').max(1024),
});
export type FetchLinkPreviewInput = z.infer<typeof FetchLinkPreviewInputSchema>;

export const CreateReportInputSchema = z.object({
  targetUserId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  messageId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(3, 'Please describe the reason for this report').max(500),
  voluntarilyAttachedMessages: z
    .array(
      z.object({
        messageId: z.string().uuid().optional(),
        senderName: z.string().max(80),
        body: z.string().max(4000),
        createdAt: z.string().optional(),
      })
    )
    .max(20)
    .default([]),
});
export type CreateReportInput = z.infer<typeof CreateReportInputSchema>;

export const ResolveReportInputSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  resolutionNote: z.string().trim().max(400).optional().default(''),
  suspendTargetUser: z.boolean().optional().default(false),
});
export type ResolveReportInput = z.infer<typeof ResolveReportInputSchema>;

export const ReportDTO_Schema = z.object({
  id: z.string().uuid(),
  reporterId: z.string().uuid(),
  reporterUsername: z.string(),
  targetUserId: z.string().uuid().nullable(),
  targetUsername: z.string().nullable(),
  conversationId: z.string().uuid().nullable(),
  messageId: z.string().uuid().nullable(),
  reason: z.string(),
  status: z.enum(['open', 'resolved', 'dismissed']),
  resolutionNote: z.string(),
  voluntarilyAttachedMessages: z.array(
    z.object({
      senderName: z.string(),
      body: z.string(),
      createdAt: z.string().optional(),
    })
  ),
  createdAt: z.string(),
});
export type ReportDTO = z.infer<typeof ReportDTO_Schema>;

// ============================================================================
// 10. WebSocket Event Payloads & Acknowledgements
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
    attachmentId: z.string().uuid().nullable().optional(),
    forwardedFromName: z.string().trim().max(80).nullable().optional(),
  })
  .refine(
    (data) =>
      data.body.length > 0 ||
      Boolean(data.attachmentId) ||
      (Boolean(data.ciphertext) && Boolean(data.nonce)),
    'Message must contain a body, an attachment, or E2EE ciphertext + nonce'
  );

export type WsSendMessagePayload = z.infer<typeof WsSendMessagePayloadSchema>;

export const WsMessageReactPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  emoji: z.string().trim().min(1).max(16),
});
export type WsMessageReactPayload = z.infer<typeof WsMessageReactPayloadSchema>;

export const WsMessageEditPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  newBody: z.string().trim().min(1).max(4000),
  newCiphertext: z.string().max(16000).nullable().optional(),
  newNonce: z.string().max(256).nullable().optional(),
});
export type WsMessageEditPayload = z.infer<typeof WsMessageEditPayloadSchema>;

export const WsMessageDeletePayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  mode: z.enum(['for_me', 'for_everyone']),
});
export type WsMessageDeletePayload = z.infer<typeof WsMessageDeletePayloadSchema>;

export const WsMessagePinStarPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  action: z.enum(['pin', 'unpin', 'star', 'unstar']),
});
export type WsMessagePinStarPayload = z.infer<typeof WsMessagePinStarPayloadSchema>;

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

// ============================================================================
// 10. IIT Mandi Campus Layer Schemas (Phase 7 - Section 12 & 13)
// ============================================================================

export const ConnectorIdSchema = z.enum([
  'moodle_lms',
  'academic_portal',
  'public_institute',
  'mandi_weather',
]);
export type ConnectorId = z.infer<typeof ConnectorIdSchema>;

export const ConnectMoodleInputSchema = z.object({
  explicitConsent: z.boolean().refine((v) => v === true, {
    message: 'You must consent to what is read from Moodle before connecting.',
  }),
  mode: z.enum(['token', 'login_once', 'ics_url']).default('token'),
  token: z.string().trim().max(512).optional(),
  username: z.string().trim().max(120).optional(),
  password: z.string().max(256).optional(), // Used once in-memory for login/token.php, NEVER stored or logged
  icsUrl: z.string().trim().max(1024).optional(),
});
export type ConnectMoodleInput = z.infer<typeof ConnectMoodleInputSchema>;

export const ConnectorHealthDTO_Schema = z.object({
  id: ConnectorIdSchema,
  name: z.string(),
  description: z.string(),
  status: z.enum(['connected', 'degraded_hidden', 'disconnected']),
  uiVisible: z.boolean(),
  failureCount: z.number().int().nonnegative(),
  lastSyncAt: z.string().nullable(),
  nextRetryAt: z.string().nullable(),
  lastError: z.string().nullable(),
  sourceMode: z.enum(['official_api', 'ics_export', 'public_cache', 'admin_data', 'demo_fixtures', 'off']),
});
export type ConnectorHealthDTO = z.infer<typeof ConnectorHealthDTO_Schema>;

const DAY_NORMALIZATION_MAP: Record<string, 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'> = {
  mon: 'Mon',
  monday: 'Mon',
  tue: 'Tue',
  tues: 'Tue',
  tuesday: 'Tue',
  wed: 'Wed',
  wednesday: 'Wed',
  thu: 'Thu',
  thur: 'Thu',
  thurs: 'Thu',
  thursday: 'Thu',
  fri: 'Fri',
  friday: 'Fri',
  sat: 'Sat',
  saturday: 'Sat',
  sun: 'Sun',
  sunday: 'Sun',
};

export const CanonicalDayOfWeekSchema = z
  .string()
  .trim()
  .transform((val, ctx) => {
    const mapped = DAY_NORMALIZATION_MAP[val.toLowerCase()];
    if (!mapped) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid day of week. Use Mon..Sun or Monday..Sunday.',
      });
      return z.NEVER;
    }
    return mapped;
  });

export type CanonicalDayOfWeek = z.infer<typeof CanonicalDayOfWeekSchema>;

export const MessHallIdSchema = z.enum([
  'Pine Mess',
  'Oak Mess',
  'Cedar Mess',
  'Alder Mess',
  'Maple Mess',
  'Peepal Mess',
]);
export type MessHallId = z.infer<typeof MessHallIdSchema>;

export const TimetableSlotInputSchema = z.object({
  courseCode: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  courseTitle: z.string().trim().min(2).max(100),
  dayOfWeek: CanonicalDayOfWeekSchema,
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM 24h format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM 24h format'),
  roomCode: z.string().trim().min(1).max(30).transform((v) => v.toUpperCase()),
});
export type TimetableSlotInput = z.infer<typeof TimetableSlotInputSchema>;

export const CampusDatumCategorySchema = z.enum([
  'mess_menu',
  'bus_schedule',
  'notice',
  'calendar',
  'helpline',
  'lost_found',
  'ride_share',
  'marketplace',
  'mess_poll',
  'club_event',
  'study_buddy',
  'peer_note',
  'anonymous_feedback',
  'sos_alert',
]);
export type CampusDatumCategory = z.infer<typeof CampusDatumCategorySchema>;

export const CreateCampusDatumInputSchema = z.object({
  category: CampusDatumCategorySchema,
  title: z.string().trim().min(2).max(140),
  subtitle: z.string().trim().max(140).optional().default(''),
  body: z.string().trim().min(1).max(2000),
  locationCode: z.string().trim().max(40).optional().default(''),
  eventTime: z.string().trim().max(80).optional().default(''),
});
export type CreateCampusDatumInput = z.infer<typeof CreateCampusDatumInputSchema>;

export const GroundedCampusAiQuerySchema = z.object({
  question: z.string().trim().min(2).max(500),
  includePersonalConsentedData: z.boolean().default(true),
});
export type GroundedCampusAiQuery = z.infer<typeof GroundedCampusAiQuerySchema>;

// ============================================================================
// 10. Campus Map & Navigation Schemas (Phase 8 - Section 13)
// ============================================================================

export const PlaceCategorySchema = z.enum([
  'hostel',
  'academic',
  'mess',
  'library',
  'sports',
  'gate',
  'bus_stop',
  'hospital',
  'shop',
]);
export type PlaceCategory = z.infer<typeof PlaceCategorySchema>;

export const CampusPlaceDTO_Schema = z.object({
  id: z.string(),
  code: z.string(),
  canonicalName: z.string(),
  aliases: z.array(z.string()),
  category: PlaceCategorySchema,
  hostel: z.string().nullable().optional(),
  block: z.string().nullable().optional(),
  lat: z.number(),
  lng: z.number(),
  isPlaceholderCoord: z.boolean().default(true),
  entrances: z.array(z.string()).default([]),
  notes: z.string().default(''),
});
export type CampusPlaceDTO = z.infer<typeof CampusPlaceDTO_Schema>;

export const UpsertCampusPlaceInputSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1).max(30).transform((v) => v.toUpperCase()),
  canonicalName: z.string().trim().min(2).max(120),
  aliases: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  category: PlaceCategorySchema,
  hostel: z.string().trim().max(10).nullable().optional(),
  block: z.string().trim().max(10).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  entrances: z.array(z.string()).optional().default(['Main Entrance']),
  notes: z.string().trim().max(400).optional().default(''),
});
export type UpsertCampusPlaceInput = z.infer<typeof UpsertCampusPlaceInputSchema>;

export const CampusPathEdgeSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  distanceMeters: z.number().positive(),
  stepFree: z.boolean().default(true),
  instructionHint: z.string().optional(),
});
export type CampusPathEdge = z.infer<typeof CampusPathEdgeSchema>;


export const CampusConnectorHealthSchema = z.object({
  id: z.string(),
  name: z.string(),
  isHealthy: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  lastChecked: z.string(),
  fallbackActive: z.boolean(),
  message: z.string(),
});
export type CampusConnectorHealth = z.infer<typeof CampusConnectorHealthSchema>;

export const CampusHealthSummarySchema = z.object({
  overallStatus: z.enum(['healthy', 'degraded', 'offline']),
  connectors: z.array(CampusConnectorHealthSchema),
  timestamp: z.string(),
});
export type CampusHealthSummary = z.infer<typeof CampusHealthSummarySchema>;

export const CourseDTO_Schema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  instructor: z.string(),
  credits: z.number().int().positive(),
  slot: z.string(),
  room: z.string(),
  description: z.string(),
  isEnrolled: z.boolean().optional(),
});
export type CourseDTO = z.infer<typeof CourseDTO_Schema>;

export const CreateCourseInputSchema = z.object({
  code: z.string().trim().min(2).max(15).transform((v) => v.toUpperCase()),
  title: z.string().trim().min(2).max(100),
  instructor: z.string().trim().min(2).max(80),
  credits: z.number().int().min(1).max(10).default(3),
  slot: z.string().trim().min(1).max(10).transform((v) => v.toUpperCase()),
  room: z.string().trim().min(1).max(40).default('A1-NKN'),
  description: z.string().trim().max(500).optional().default(''),
});
export type CreateCourseInput = z.infer<typeof CreateCourseInputSchema>;

export const AssignmentDTO_Schema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  courseCode: z.string(),
  courseTitle: z.string(),
  moodleAssignId: z.number().int().nullable().optional(),
  title: z.string(),
  description: z.string(),
  dueDate: z.string(),
  maxPoints: z.number().int().nonnegative(),
  submissionUrl: z.string().nullable().optional(),
  isOverdue: z.boolean(),
  daysRemaining: z.number(),
});
export type AssignmentDTO = z.infer<typeof AssignmentDTO_Schema>;

export const MoodleSyncResponseSchema = z.object({
  syncedCourses: z.number().int().nonnegative(),
  syncedAssignments: z.number().int().nonnegative(),
  source: z.enum(['moodle_api', 'ics_feed', 'local_cache']),
  fallbackActive: z.boolean(),
  syncedAt: z.string(),
});
export type MoodleSyncResponse = z.infer<typeof MoodleSyncResponseSchema>;

export const TimetableSlotDTO_Schema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid().nullable().optional(),
  dayOfWeek: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm format required'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm format required'),
  location: z.string(),
  title: z.string(),
  slotCode: z.string().nullable().optional(),
});
export type TimetableSlotDTO = z.infer<typeof TimetableSlotDTO_Schema>;

export const FreeSlotQuerySchema = z.object({
  dayOfWeek: CanonicalDayOfWeekSchema.default('Wed'),
  userIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  windowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('08:00'),
  windowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('18:00'),
  minDurationMins: z.number().int().min(15).max(480).default(30),
});
export type FreeSlotQuery = z.infer<typeof FreeSlotQuerySchema>;

export const FreeSlotDTO_Schema = z.object({
  dayOfWeek: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMins: z.number().int().positive(),
  participantsCount: z.number().int().positive(),
});
export type FreeSlotDTO = z.infer<typeof FreeSlotDTO_Schema>;

export const BusTripDTO_Schema = z.object({
  id: z.string().uuid(),
  routeName: z.string(),
  fromLocation: z.string(),
  toLocation: z.string(),
  departureTime: z.string(),
  daysOfWeek: z.string(),
  busType: z.string(),
  isWeekendOnly: z.boolean(),
  minutesUntilDeparture: z.number().int().optional(),
  isNext: z.boolean().optional(),
});
export type BusTripDTO = z.infer<typeof BusTripDTO_Schema>;

export const CreateBusTripInputSchema = z.object({
  routeName: z.string().trim().min(2).max(100),
  fromLocation: z.string().trim().min(2).max(80),
  toLocation: z.string().trim().min(2).max(80),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm format required'),
  daysOfWeek: z.string().trim().max(100).default('Mon,Tue,Wed,Thu,Fri,Sat,Sun'),
  busType: z.string().trim().max(50).default('Electric Bus'),
  isWeekendOnly: z.boolean().optional().default(false),
});
export type CreateBusTripInput = z.infer<typeof CreateBusTripInputSchema>;

export const MealTypeSchema = z.enum(['breakfast', 'lunch', 'snacks', 'dinner']);
export type MealType = z.infer<typeof MealTypeSchema>;

export const MessMealDTO_Schema = z.object({
  id: z.string().uuid(),
  hostelName: z.string(),
  dayOfWeek: z.string(),
  mealType: MealTypeSchema,
  items: z.array(z.string()),
  dietaryNote: z.string().nullable().optional(),
  isCurrentMeal: z.boolean().optional(),
});
export type MessMealDTO = z.infer<typeof MessMealDTO_Schema>;

export const UpdateMessMealInputSchema = z.object({
  hostelName: z.string().trim().min(2).max(50),
  dayOfWeek: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  mealType: MealTypeSchema,
  items: z.array(z.string().trim().min(1)).min(1).max(20),
  dietaryNote: z.string().trim().max(100).optional(),
});
export type UpdateMessMealInput = z.infer<typeof UpdateMessMealInputSchema>;

export const CampusServiceDTO_Schema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: z.enum(['emergency', 'medical', 'transport', 'admin', 'it']),
  phone: z.string(),
  alternatePhone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  location: z.string(),
  operatingHours: z.string(),
  description: z.string(),
});
export type CampusServiceDTO = z.infer<typeof CampusServiceDTO_Schema>;

export const CreateCampusServiceInputSchema = z.object({
  title: z.string().trim().min(2).max(100),
  category: z.enum(['emergency', 'medical', 'transport', 'admin', 'it']),
  phone: z.string().trim().min(3).max(30),
  alternatePhone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional(),
  location: z.string().trim().min(2).max(80),
  operatingHours: z.string().trim().min(2).max(50).default('24x7'),
  description: z.string().trim().max(300).optional().default(''),
});
export type CreateCampusServiceInput = z.infer<typeof CreateCampusServiceInputSchema>;

export const CitationSchema = z.object({
  title: z.string(),
  sourceType: z.enum(['academic_calendar', 'bus_schedule', 'mess_menu', 'campus_handbook', 'course_catalog']),
  reference: z.string(),
  snippet: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const GroundedCampusQARequestSchema = z.object({
  query: z.string().trim().min(2).max(1000),
});
export type GroundedCampusQARequest = z.infer<typeof GroundedCampusQARequestSchema>;

export const GroundedCampusQAResponseSchema = z.object({
  query: z.string(),
  answer: z.string(),
  citations: z.array(CitationSchema),
  confidence: z.enum(['high', 'medium', 'low']),
  timestamp: z.string(),
});
export type GroundedCampusQAResponse = z.infer<typeof GroundedCampusQAResponseSchema>;

export const CampusTodaySummaryDTO_Schema = z.object({
  dateStr: z.string(),
  dayOfWeek: z.string(),
  nextClass: TimetableSlotDTO_Schema.nullable().optional(),
  nextBus: BusTripDTO_Schema.nullable().optional(),
  currentMeal: MessMealDTO_Schema.nullable().optional(),
  upcomingAssignments: z.array(AssignmentDTO_Schema),
  quickContacts: z.array(CampusServiceDTO_Schema),
  connectorsStatus: z.enum(['healthy', 'degraded', 'offline']),
});
export type CampusTodaySummaryDTO = z.infer<typeof CampusTodaySummaryDTO_Schema>;

