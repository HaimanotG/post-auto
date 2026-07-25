import { describe, expect, it, vi } from "vitest";
import {
  normalizeWebhookEventPayload,
  runProcessMetaWebhook,
  type ProcessMetaWebhookDeps,
  type ProcessMetaWebhookStore,
} from "./process-meta-webhook.js";

describe("normalizeWebhookEventPayload", () => {
  it("normalizes a Page comment", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page_1",
          time: 1716400000,
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "comment_1",
                post_id: "page_1_post_1",
                sender_id: "user_1",
                sender_name: "Jane Doe",
                message: "Is this still available?",
              },
            },
          ],
        },
      ],
    };

    expect(normalizeWebhookEventPayload("facebook_page", payload)).toEqual([
      {
        type: "comment",
        externalAccountId: "page_1",
        externalMessageId: "comment_1",
        externalRelatedObjectId: "page_1_post_1",
        senderExternalId: "user_1",
        senderName: "Jane Doe",
        senderUsername: null,
        body: "Is this still available?",
      },
    ]);
  });

  it("normalizes a Page mention", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page_1",
          changes: [
            {
              field: "mention",
              value: {
                item: "post",
                post_id: "other_page_post_1",
                sender_id: "user_2",
                sender_name: "John Smith",
                message: "Check out @OurBoutique's new arrivals!",
              },
            },
          ],
        },
      ],
    };

    expect(normalizeWebhookEventPayload("facebook_page", payload)).toEqual([
      {
        type: "mention",
        externalAccountId: "page_1",
        externalMessageId: "other_page_post_1",
        externalRelatedObjectId: "other_page_post_1",
        senderExternalId: "user_2",
        senderName: "John Smith",
        senderUsername: null,
        body: "Check out @OurBoutique's new arrivals!",
      },
    ]);
  });

  it("normalizes a Page (Messenger) DM", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page_1",
          messaging: [
            {
              sender: { id: "user_3" },
              recipient: { id: "page_1" },
              timestamp: 1716400000,
              message: { mid: "mid.123", text: "Do you deliver to Bahir Dar?" },
            },
          ],
        },
      ],
    };

    expect(normalizeWebhookEventPayload("facebook_page", payload)).toEqual([
      {
        type: "dm",
        externalAccountId: "page_1",
        externalMessageId: "mid.123",
        externalRelatedObjectId: null,
        senderExternalId: "user_3",
        senderName: null,
        senderUsername: null,
        body: "Do you deliver to Bahir Dar?",
      },
    ]);
  });

  it("normalizes an Instagram comment", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig_account_1",
          changes: [
            {
              field: "comments",
              value: {
                id: "ig_comment_1",
                text: "Love this color!",
                from: { id: "ig_user_1", username: "selam_shopper" },
                media: { id: "ig_media_1", media_product_type: "FEED" },
              },
            },
          ],
        },
      ],
    };

    expect(normalizeWebhookEventPayload("instagram_business", payload)).toEqual([
      {
        type: "comment",
        externalAccountId: "ig_account_1",
        externalMessageId: "ig_comment_1",
        externalRelatedObjectId: "ig_media_1",
        senderExternalId: "ig_user_1",
        senderName: null,
        senderUsername: "selam_shopper",
        body: "Love this color!",
      },
    ]);
  });

  it("normalizes an Instagram mention (sender/text not provided by Meta for this event)", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig_account_1",
          changes: [
            {
              field: "mentions",
              value: { media_id: "ig_media_2", comment_id: "ig_comment_2" },
            },
          ],
        },
      ],
    };

    expect(normalizeWebhookEventPayload("instagram_business", payload)).toEqual([
      {
        type: "mention",
        externalAccountId: "ig_account_1",
        externalMessageId: "ig_comment_2",
        externalRelatedObjectId: "ig_media_2",
        senderExternalId: "unknown",
        senderName: null,
        senderUsername: null,
        body: "",
      },
    ]);
  });

  it("normalizes an Instagram DM", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig_account_1",
          messaging: [
            {
              sender: { id: "ig_user_2" },
              recipient: { id: "ig_account_1" },
              message: { mid: "ig_mid.1", text: "What's the price?" },
            },
          ],
        },
      ],
    };

    expect(normalizeWebhookEventPayload("instagram_business", payload)).toEqual([
      {
        type: "dm",
        externalAccountId: "ig_account_1",
        externalMessageId: "ig_mid.1",
        externalRelatedObjectId: null,
        senderExternalId: "ig_user_2",
        senderName: null,
        senderUsername: null,
        body: "What's the price?",
      },
    ]);
  });

  it("normalizes a Threads reply", () => {
    const payload = {
      object: "threads",
      entry: [
        {
          id: "threads_user_1",
          changes: [
            {
              field: "replies",
              value: {
                id: "threads_reply_1",
                text: "Restocking soon?",
                from: { id: "threads_user_2", username: "addis_fan" },
                replied_to: { id: "threads_post_1" },
              },
            },
          ],
        },
      ],
    };

    expect(normalizeWebhookEventPayload("threads", payload)).toEqual([
      {
        type: "comment",
        externalAccountId: "threads_user_1",
        externalMessageId: "threads_reply_1",
        externalRelatedObjectId: "threads_post_1",
        senderExternalId: "threads_user_2",
        senderName: null,
        senderUsername: "addis_fan",
        body: "Restocking soon?",
      },
    ]);
  });

  it("ignores unrecognized change fields and entries with neither changes nor messaging", () => {
    const payload = {
      object: "page",
      entry: [{ id: "page_1", changes: [{ field: "ratings", value: {} }] }, { id: "page_2" }],
    };

    expect(normalizeWebhookEventPayload("facebook_page", payload)).toEqual([]);
  });

  it("handles a missing/empty entry array", () => {
    expect(normalizeWebhookEventPayload("facebook_page", {})).toEqual([]);
    expect(normalizeWebhookEventPayload("facebook_page", null)).toEqual([]);
  });
});

const CREATED_TIMESTAMP = new Date("2026-07-25T10:00:00.000Z");
const UPDATED_TIMESTAMP = new Date("2026-07-25T11:00:00.000Z");

function buildDeps(
  overrides: Partial<{
    event: { id: string; platform: "facebook_page" | "instagram_business" | "threads"; rawPayload: unknown } | null;
    socialAccount: { id: string; businessId: string } | null;
    postPlatformVariant: { postId: string } | null;
    /** Whether inboxMessage.upsert's mocked return simulates a freshly-created row (default) or a redelivered update. */
    wasCreated: boolean;
    enqueueClassifyAndReply: ReturnType<typeof vi.fn>;
  }> = {},
): {
  deps: ProcessMetaWebhookDeps;
  store: {
    webhookEvent: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    socialAccount: { findFirst: ReturnType<typeof vi.fn> };
    postPlatformVariant: { findFirst: ReturnType<typeof vi.fn> };
    inboxMessage: { upsert: ReturnType<typeof vi.fn> };
  };
  enqueueClassifyAndReply: ReturnType<typeof vi.fn>;
} {
  const event =
    "event" in overrides
      ? overrides.event
      : {
          id: "webhook_event_1",
          platform: "facebook_page" as const,
          rawPayload: {
            object: "page",
            entry: [
              {
                id: "page_1",
                changes: [
                  {
                    field: "feed",
                    value: { item: "comment", comment_id: "comment_1", post_id: "post_1", sender_id: "user_1", message: "Hi" },
                  },
                ],
              },
            ],
          },
        };
  const socialAccount = "socialAccount" in overrides ? overrides.socialAccount : { id: "social_account_1", businessId: "business_1" };
  const postPlatformVariant = "postPlatformVariant" in overrides ? overrides.postPlatformVariant : null;
  const wasCreated = overrides.wasCreated ?? true;

  const webhookEventFindUnique = vi.fn().mockResolvedValue(event);
  const webhookEventUpdate = vi.fn().mockResolvedValue(undefined);
  const socialAccountFindFirst = vi.fn().mockResolvedValue(socialAccount);
  const postPlatformVariantFindFirst = vi.fn().mockResolvedValue(postPlatformVariant);
  const inboxMessageUpsert = vi.fn().mockResolvedValue({
    id: "inbox_message_1",
    createdAt: CREATED_TIMESTAMP,
    updatedAt: wasCreated ? CREATED_TIMESTAMP : UPDATED_TIMESTAMP,
  });
  const enqueueClassifyAndReply = overrides.enqueueClassifyAndReply ?? vi.fn().mockResolvedValue(undefined);

  const store = {
    webhookEvent: { findUnique: webhookEventFindUnique, update: webhookEventUpdate },
    socialAccount: { findFirst: socialAccountFindFirst },
    postPlatformVariant: { findFirst: postPlatformVariantFindFirst },
    inboxMessage: { upsert: inboxMessageUpsert },
  };

  return {
    deps: { store: store as unknown as ProcessMetaWebhookStore, enqueueClassifyAndReply },
    store,
    enqueueClassifyAndReply,
  };
}

describe("runProcessMetaWebhook", () => {
  it("throws when the webhook_events row doesn't exist", async () => {
    const { deps } = buildDeps({ event: null });

    await expect(runProcessMetaWebhook(deps, { webhookEventId: "missing" })).rejects.toThrow("not found");
  });

  it("marks the event processing, resolves the social account, upserts an inbox_messages row, then marks processed", async () => {
    const { deps, store } = buildDeps();

    const result = await runProcessMetaWebhook(deps, { webhookEventId: "webhook_event_1" });

    expect(result).toEqual({ processed: 1, skipped: 0 });
    expect(store.webhookEvent.update).toHaveBeenNthCalledWith(1, {
      where: { id: "webhook_event_1" },
      data: { processingStatus: "processing" },
    });
    expect(store.socialAccount.findFirst).toHaveBeenCalledWith({
      where: { platform: "facebook_page", externalAccountId: "page_1" },
    });
    expect(store.inboxMessage.upsert).toHaveBeenCalledWith({
      where: { externalMessageId: "comment_1" },
      create: {
        businessId: "business_1",
        socialAccountId: "social_account_1",
        platform: "facebook_page",
        type: "comment",
        externalMessageId: "comment_1",
        relatedPostId: null,
        senderExternalId: "user_1",
        senderName: null,
        senderUsername: null,
        body: "Hi",
      },
      update: { senderName: null, senderUsername: null, body: "Hi", relatedPostId: null },
    });
    expect(store.webhookEvent.update).toHaveBeenNthCalledWith(2, {
      where: { id: "webhook_event_1" },
      data: { processingStatus: "processed" },
    });
  });

  it("enqueues classify-and-reply for a newly created inbox message", async () => {
    const { deps, enqueueClassifyAndReply } = buildDeps({ wasCreated: true });

    await runProcessMetaWebhook(deps, { webhookEventId: "webhook_event_1" });

    expect(enqueueClassifyAndReply).toHaveBeenCalledWith({ inboxMessageId: "inbox_message_1" });
  });

  it("does not enqueue classify-and-reply when the upsert only updated an existing message (redelivered webhook)", async () => {
    const { deps, enqueueClassifyAndReply } = buildDeps({ wasCreated: false });

    await runProcessMetaWebhook(deps, { webhookEventId: "webhook_event_1" });

    expect(enqueueClassifyAndReply).not.toHaveBeenCalled();
  });

  it("does not fail the event when enqueuing classify-and-reply fails", async () => {
    const enqueueClassifyAndReply = vi.fn().mockRejectedValue(new Error("trigger.dev unreachable"));
    const { deps, store } = buildDeps({ wasCreated: true, enqueueClassifyAndReply });

    const result = await runProcessMetaWebhook(deps, { webhookEventId: "webhook_event_1" });

    expect(result).toEqual({ processed: 1, skipped: 0 });
    expect(store.webhookEvent.update).toHaveBeenNthCalledWith(2, {
      where: { id: "webhook_event_1" },
      data: { processingStatus: "processed" },
    });
  });

  it("resolves relatedPostId from post_platform_variants.external_post_id when a match exists", async () => {
    const { deps, store } = buildDeps({ postPlatformVariant: { postId: "post_internal_1" } });

    await runProcessMetaWebhook(deps, { webhookEventId: "webhook_event_1" });

    expect(store.postPlatformVariant.findFirst).toHaveBeenCalledWith({ where: { externalPostId: "post_1" } });
    expect(store.inboxMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ relatedPostId: "post_internal_1" }),
      }),
    );
  });

  it("skips a message whose social_account can't be resolved, without failing the event", async () => {
    const { deps, store } = buildDeps({ socialAccount: null });

    const result = await runProcessMetaWebhook(deps, { webhookEventId: "webhook_event_1" });

    expect(result).toEqual({ processed: 0, skipped: 1 });
    expect(store.inboxMessage.upsert).not.toHaveBeenCalled();
    expect(store.webhookEvent.update).toHaveBeenNthCalledWith(2, {
      where: { id: "webhook_event_1" },
      data: { processingStatus: "processed" },
    });
  });

  it("marks the event failed and rethrows when normalization/persistence throws", async () => {
    const { deps, store } = buildDeps();
    store.inboxMessage.upsert.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(runProcessMetaWebhook(deps, { webhookEventId: "webhook_event_1" })).rejects.toThrow("db unavailable");

    expect(store.webhookEvent.update).toHaveBeenNthCalledWith(2, {
      where: { id: "webhook_event_1" },
      data: { processingStatus: "failed" },
    });
  });
});
