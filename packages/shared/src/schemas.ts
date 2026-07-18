import { z } from "zod";
import { PLATFORMS } from "./constants.js";

export const platformSchema = z.enum(PLATFORMS);

export const businessMemberRoleSchema = z.enum(["owner", "staff"]);

export const socialAccountStatusSchema = z.enum(["active", "revoked", "error"]);

export const postStatusSchema = z.enum([
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "partial",
]);

export const postPlatformVariantStatusSchema = z.enum([
  "pending",
  "publishing",
  "published",
  "failed",
]);

export const inboxMessageTypeSchema = z.enum(["comment", "mention", "dm"]);

export const inboxMessageStatusSchema = z.enum([
  "new",
  "auto_replied",
  "needs_attention",
  "resolved",
  "ignored",
]);

export const aiReplyDecisionSchema = z.enum(["auto_reply", "escalate", "ignore"]);

export const webhookProcessingStatusSchema = z.enum(["pending", "processed", "failed"]);

export const commandSourceSchema = z.enum(["telegram_chat", "voice", "quick_action"]);
