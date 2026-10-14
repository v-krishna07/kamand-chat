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

export const UserSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string(),
  roomCode: z.string().nullable(),
  role: z.enum(['member', 'moderator', 'admin', 'super_admin']),
  isOnline: z.boolean().optional(),
  lastSeenAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type UserSummary = z.infer<typeof UserSummarySchema>;

// ============================================================================
// 2. Conversation & Message Schemas
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
});

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const CursorPaginationQuerySchema = z.object({
  beforeSeq: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .refine((v) => v === undefined || (!Number.isNaN(v) && v > 0), 'beforeSeq must be a positive integer'),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Math.max(parseInt(v, 10), 1), 100) : 40)),
});

// ============================================================================
// 3. WebSocket Event Payloads & Acknowledgements
// ============================================================================

export const WsSendMessagePayloadSchema = z.object({
  id: z.string().uuid('Client message ID must be a valid UUID v4'),
  conversationId: z.string().uuid('Invalid conversation ID'),
  body: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message cannot exceed 4000 characters'),
  ciphertext: z.string().max(16000).nullable().optional(),
  nonce: z.string().max(256).nullable().optional(),
  type: MessageTypeSchema.default('text'),
  replyToId: z.string().uuid().nullable().optional(),
});

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
    code: z.enum(['VALIDATION_ERROR', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR']),
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

export const WsSyncResumePayloadSchema = z.object({
  cursors: z.record(z.string().uuid(), z.number().int().nonnegative()),
});

export type WsSyncResumePayload = z.infer<typeof WsSyncResumePayloadSchema>;

export const WsSyncResumeAckSchema = z.object({
  ok: z.boolean(),
  missedMessages: z.record(z.string().uuid(), z.array(MessageDTO_Schema)),
});

export type WsSyncResumeAck = z.infer<typeof WsSyncResumeAckSchema>;
