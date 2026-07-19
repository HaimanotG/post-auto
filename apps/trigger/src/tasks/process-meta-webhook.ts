import { prisma } from "@postauto/db";
import type { Platform } from "@postauto/shared";
import { task } from "@trigger.dev/sdk/v3";

export type NormalizedInboxMessageType = "comment" | "mention" | "dm";

/**
 * Platform-agnostic shape extracted from a raw Meta webhook payload, before
 * we know which business/social_account it belongs to (that requires a
 * store lookup keyed on externalAccountId, done in runProcessMetaWebhook).
 */
export interface NormalizedInboxMessage {
  type: NormalizedInboxMessageType;
  /** Meta's page/IG-account/threads-user id the event arrived on (entry.id), used to resolve social_accounts. */
  externalAccountId: string | null;
  externalMessageId: string;
  /** Meta's post/media id this message is attached to, if any -- resolved against post_platform_variants.external_post_id to populate relatedPostId. */
  externalRelatedObjectId: string | null;
  senderExternalId: string;
  senderName: string | null;
  senderUsername: string | null;
  body: string;
}

interface MetaWebhookEnvelope {
  object?: string;
  entry?: MetaWebhookEntry[];
}

interface MetaWebhookEntry {
  id?: string;
  time?: number;
  changes?: MetaWebhookChange[];
  messaging?: MetaMessagingEvent[];
}

interface MetaWebhookChange {
  field?: string;
  value?: Record<string, unknown>;
}

interface MetaWebhookFrom {
  id?: string;
  username?: string;
}

interface MetaMessagingEvent {
  sender?: { id?: string };
  message?: { mid?: string; text?: string };
}

function str(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

/**
 * facebook_page's `feed` change (https://developers.facebook.com/docs/graph-api/webhooks/reference/page/#feed):
 * item="comment" is a comment on a Page post. `mention` is Meta's separate
 * field for "your Page was @mentioned" and reuses the same sender_id/
 * sender_name/message/post_id shape.
 */
function normalizeFacebookPageChange(entryAccountId: string | null, change: MetaWebhookChange): NormalizedInboxMessage | null {
  const value = change.value ?? {};

  if (change.field === "feed" && value.item === "comment") {
    return {
      type: "comment",
      externalAccountId: entryAccountId,
      externalMessageId: str(value.comment_id) ?? "",
      externalRelatedObjectId: str(value.post_id),
      senderExternalId: str(value.sender_id) ?? "unknown",
      senderName: str(value.sender_name),
      senderUsername: null,
      body: str(value.message) ?? "",
    };
  }

  if (change.field === "mention") {
    return {
      type: "mention",
      externalAccountId: entryAccountId,
      externalMessageId: str(value.comment_id ?? value.post_id) ?? "",
      externalRelatedObjectId: str(value.post_id),
      senderExternalId: str(value.sender_id) ?? "unknown",
      senderName: str(value.sender_name),
      senderUsername: null,
      body: str(value.message) ?? "",
    };
  }

  return null;
}

/**
 * instagram_business's `comments` change carries full text + a `from` object
 * (https://developers.facebook.com/docs/instagram-platform/webhooks#comments).
 * `mentions` fires when the connected IG account is @mentioned in a caption
 * or comment, but Meta's payload only carries media_id/comment_id -- no
 * sender or text -- so those are left as best-effort placeholders here;
 * fetching the actual comment/caption content is a future enrichment step,
 * not part of this normalization pass.
 */
function normalizeInstagramChange(entryAccountId: string | null, change: MetaWebhookChange): NormalizedInboxMessage | null {
  const value = change.value ?? {};

  if (change.field === "comments") {
    const from = (value.from ?? {}) as MetaWebhookFrom;
    const media = (value.media ?? {}) as { id?: string };
    return {
      type: "comment",
      externalAccountId: entryAccountId,
      externalMessageId: str(value.id) ?? "",
      externalRelatedObjectId: str(media.id),
      senderExternalId: str(from.id) ?? "unknown",
      senderName: null,
      senderUsername: str(from.username),
      body: str(value.text) ?? "",
    };
  }

  if (change.field === "mentions") {
    return {
      type: "mention",
      externalAccountId: entryAccountId,
      externalMessageId: str(value.comment_id ?? value.media_id) ?? "",
      externalRelatedObjectId: str(value.media_id),
      senderExternalId: "unknown",
      senderName: null,
      senderUsername: null,
      body: "",
    };
  }

  return null;
}

/**
 * Threads' `replies` change is the closest analog to a Page/IG comment: a
 * reply to a Threads post. Mirrors the Graph API `from` object convention
 * used by comments elsewhere; Threads webhooks are newer/less stable than
 * Page/IG's, so field names here should be re-verified against Meta's
 * Threads webhooks reference before relying on this against live traffic.
 */
function normalizeThreadsChange(entryAccountId: string | null, change: MetaWebhookChange): NormalizedInboxMessage | null {
  const value = change.value ?? {};

  if (change.field === "replies") {
    const from = (value.from ?? {}) as MetaWebhookFrom;
    const repliedTo = (value.replied_to ?? {}) as { id?: string };
    return {
      type: "comment",
      externalAccountId: entryAccountId,
      externalMessageId: str(value.id) ?? "",
      externalRelatedObjectId: str(repliedTo.id),
      senderExternalId: str(from.id) ?? "unknown",
      senderName: null,
      senderUsername: str(from.username),
      body: str(value.text) ?? "",
    };
  }

  return null;
}

/**
 * Messenger/IG-Messaging direct messages arrive in `entry[].messaging[]`
 * (not `changes`) with an identical shape on both facebook_page and
 * instagram_business subscriptions
 * (https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages).
 */
function normalizeMessagingEvent(entryAccountId: string | null, event: MetaMessagingEvent): NormalizedInboxMessage | null {
  if (!event.message?.mid) {
    return null;
  }
  return {
    type: "dm",
    externalAccountId: entryAccountId,
    externalMessageId: event.message.mid,
    externalRelatedObjectId: null,
    senderExternalId: str(event.sender?.id) ?? "unknown",
    senderName: null,
    senderUsername: null,
    body: str(event.message.text) ?? "",
  };
}

const CHANGE_NORMALIZERS: Record<Platform, (entryAccountId: string | null, change: MetaWebhookChange) => NormalizedInboxMessage | null> = {
  facebook_page: normalizeFacebookPageChange,
  instagram_business: normalizeInstagramChange,
  threads: normalizeThreadsChange,
};

/**
 * Pure normalization: flattens a raw Meta webhook payload (already known to
 * belong to `platform` via webhook_events.platform) into zero or more
 * candidate inbox messages. No I/O -- account/business resolution and
 * persistence happen in runProcessMetaWebhook.
 */
export function normalizeWebhookEventPayload(platform: Platform, rawPayload: unknown): NormalizedInboxMessage[] {
  const envelope = (rawPayload ?? {}) as MetaWebhookEnvelope;
  const normalizeChange = CHANGE_NORMALIZERS[platform];
  const messages: NormalizedInboxMessage[] = [];

  for (const entry of envelope.entry ?? []) {
    const entryAccountId = str(entry.id);

    for (const change of entry.changes ?? []) {
      const normalized = normalizeChange(entryAccountId, change);
      if (normalized) {
        messages.push(normalized);
      }
    }

    for (const event of entry.messaging ?? []) {
      const normalized = normalizeMessagingEvent(entryAccountId, event);
      if (normalized) {
        messages.push(normalized);
      }
    }
  }

  return messages;
}

export interface ProcessMetaWebhookPayload {
  webhookEventId: string;
}

interface StoredWebhookEvent {
  id: string;
  platform: Platform;
  rawPayload: unknown;
}

interface InboxMessageWriteData {
  businessId: string;
  socialAccountId: string;
  platform: Platform;
  type: NormalizedInboxMessageType;
  externalMessageId: string;
  relatedPostId: string | null;
  senderExternalId: string;
  senderName: string | null;
  senderUsername: string | null;
  body: string;
}

/**
 * Structural subset of PrismaClient this task needs, mirroring the narrow
 * interface pattern used by publish-post.ts's PublishPostStore and
 * render-slides.ts's RenderSlidesStore.
 */
export interface ProcessMetaWebhookStore {
  webhookEvent: {
    findUnique(args: { where: { id: string } }): Promise<StoredWebhookEvent | null>;
    update(args: {
      where: { id: string };
      data: { processingStatus: "processing" | "processed" | "failed" };
    }): Promise<unknown>;
  };
  socialAccount: {
    findFirst(args: {
      where: { platform: Platform; externalAccountId: string };
    }): Promise<{ id: string; businessId: string } | null>;
  };
  postPlatformVariant: {
    findFirst(args: { where: { externalPostId: string } }): Promise<{ postId: string } | null>;
  };
  inboxMessage: {
    upsert(args: {
      where: { externalMessageId: string };
      create: InboxMessageWriteData;
      update: Partial<InboxMessageWriteData>;
    }): Promise<unknown>;
  };
}

export interface ProcessMetaWebhookDeps {
  store: ProcessMetaWebhookStore;
}

/**
 * Pure orchestration for process-meta-webhook: loads a webhook_events row,
 * normalizes its raw payload into candidate inbox messages, resolves each
 * one's social_account (and thus business) via externalAccountId, and
 * upserts into inbox_messages keyed on external_message_id so redelivered
 * webhooks (Meta retries on non-200/timeouts) are idempotent. A message
 * whose social_account can't be resolved (e.g. the account was since
 * disconnected) is skipped rather than failing the whole event. relatedPostId
 * is resolved best-effort from post_platform_variants.external_post_id per
 * PLAN.md's reserved posts.product_id join point; left null when no match.
 */
export async function runProcessMetaWebhook(
  deps: ProcessMetaWebhookDeps,
  payload: ProcessMetaWebhookPayload,
): Promise<{ processed: number; skipped: number }> {
  const event = await deps.store.webhookEvent.findUnique({ where: { id: payload.webhookEventId } });
  if (!event) {
    throw new Error(`WebhookEvent ${payload.webhookEventId} not found`);
  }

  await deps.store.webhookEvent.update({ where: { id: event.id }, data: { processingStatus: "processing" } });

  try {
    const normalized = normalizeWebhookEventPayload(event.platform, event.rawPayload);
    let processed = 0;
    let skipped = 0;

    for (const message of normalized) {
      if (!message.externalAccountId || !message.externalMessageId) {
        skipped += 1;
        continue;
      }

      const socialAccount = await deps.store.socialAccount.findFirst({
        where: { platform: event.platform, externalAccountId: message.externalAccountId },
      });
      if (!socialAccount) {
        skipped += 1;
        continue;
      }

      const relatedVariant = message.externalRelatedObjectId
        ? await deps.store.postPlatformVariant.findFirst({ where: { externalPostId: message.externalRelatedObjectId } })
        : null;

      await deps.store.inboxMessage.upsert({
        where: { externalMessageId: message.externalMessageId },
        create: {
          businessId: socialAccount.businessId,
          socialAccountId: socialAccount.id,
          platform: event.platform,
          type: message.type,
          externalMessageId: message.externalMessageId,
          relatedPostId: relatedVariant?.postId ?? null,
          senderExternalId: message.senderExternalId,
          senderName: message.senderName,
          senderUsername: message.senderUsername,
          body: message.body,
        },
        update: {
          senderName: message.senderName,
          senderUsername: message.senderUsername,
          body: message.body,
          relatedPostId: relatedVariant?.postId ?? null,
        },
      });
      processed += 1;
    }

    await deps.store.webhookEvent.update({ where: { id: event.id }, data: { processingStatus: "processed" } });
    return { processed, skipped };
  } catch (error) {
    await deps.store.webhookEvent.update({ where: { id: event.id }, data: { processingStatus: "failed" } });
    throw error;
  }
}

const prismaStore: ProcessMetaWebhookStore = {
  webhookEvent: {
    findUnique: (args) => prisma.webhookEvent.findUnique(args),
    update: (args) => prisma.webhookEvent.update(args),
  },
  socialAccount: {
    findFirst: (args) => prisma.socialAccount.findFirst({ where: args.where, select: { id: true, businessId: true } }),
  },
  postPlatformVariant: {
    findFirst: (args) => prisma.postPlatformVariant.findFirst({ where: args.where, select: { postId: true } }),
  },
  inboxMessage: {
    upsert: (args) => prisma.inboxMessage.upsert(args),
  },
};

export const processMetaWebhookTask = task({
  id: "process-meta-webhook",
  run: async (payload: ProcessMetaWebhookPayload) => {
    return runProcessMetaWebhook({ store: prismaStore }, payload);
  },
});
