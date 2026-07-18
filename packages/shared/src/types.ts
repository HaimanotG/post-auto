import type { z } from "zod";
import type {
  aiReplyDecisionSchema,
  businessMemberRoleSchema,
  commandSourceSchema,
  inboxMessageStatusSchema,
  inboxMessageTypeSchema,
  platformSchema,
  postPlatformVariantStatusSchema,
  postStatusSchema,
  socialAccountStatusSchema,
  webhookProcessingStatusSchema,
} from "./schemas.js";

export type Platform = z.infer<typeof platformSchema>;
export type BusinessMemberRole = z.infer<typeof businessMemberRoleSchema>;
export type SocialAccountStatus = z.infer<typeof socialAccountStatusSchema>;
export type PostStatus = z.infer<typeof postStatusSchema>;
export type PostPlatformVariantStatus = z.infer<typeof postPlatformVariantStatusSchema>;
export type InboxMessageType = z.infer<typeof inboxMessageTypeSchema>;
export type InboxMessageStatus = z.infer<typeof inboxMessageStatusSchema>;
export type AiReplyDecision = z.infer<typeof aiReplyDecisionSchema>;
export type WebhookProcessingStatus = z.infer<typeof webhookProcessingStatusSchema>;
export type CommandSource = z.infer<typeof commandSourceSchema>;
