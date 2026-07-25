import { GraphApiError, GraphClient } from "@postauto/social";
import { describe, expect, it, vi } from "vitest";
import { runPublishReply, type PublishReplyDeps, type PublishReplyStore } from "./publish-reply.js";

const TOKEN_ENCRYPTION_KEY = "fixture-key";

interface BuildOptions {
  decision?: { id: string; replyText: string | null } | null;
  message?: {
    id: string;
    platform: string;
    type: string;
    externalMessageId: string;
    senderExternalId: string;
    socialAccount: {
      id: string;
      externalAccountId: string;
      accessTokenEncrypted: string;
      status: string;
    } | null;
  } | null;
}

function buildDeps(options: BuildOptions = {}): {
  deps: PublishReplyDeps;
  store: PublishReplyStore;
  inboxMessageUpdate: ReturnType<typeof vi.fn>;
} {
  const decision =
    options.decision === undefined ? { id: "ai_reply_decision_1", replyText: "It's ETB 500!" } : options.decision;
  const message =
    options.message === undefined
      ? {
          id: "inbox_message_1",
          platform: "facebook_page",
          type: "comment",
          externalMessageId: "comment-1",
          senderExternalId: "sender-1",
          socialAccount: {
            id: "account_1",
            externalAccountId: "page-123",
            accessTokenEncrypted: "encrypted-token",
            status: "active",
          },
        }
      : options.message;

  const inboxMessageUpdate = vi.fn().mockResolvedValue(undefined);

  const store: PublishReplyStore = {
    aiReplyDecision: { findUnique: vi.fn().mockResolvedValue(decision) },
    inboxMessage: { findUnique: vi.fn().mockResolvedValue(message), update: inboxMessageUpdate },
  };

  const deps: PublishReplyDeps = {
    store,
    graphClient: new GraphClient(),
    threadsGraphClient: new GraphClient({ baseUrl: "https://graph.threads.test" }),
    replyToFacebookComment: vi.fn().mockResolvedValue({ commentId: "reply-1" }),
    sendFacebookMessage: vi.fn().mockResolvedValue({ messageId: "mid.1" }),
    replyToInstagramComment: vi.fn().mockResolvedValue({ commentId: "ig-reply-1" }),
    sendInstagramMessage: vi.fn().mockResolvedValue({ messageId: "mid.2" }),
    replyToThreadsPost: vi.fn().mockResolvedValue({ mediaId: "threads-reply-1" }),
    decryptToken: vi.fn((payload: string) => `decrypted:${payload}`),
    tokenEncryptionKey: TOKEN_ENCRYPTION_KEY,
  };

  return { deps, store, inboxMessageUpdate };
}

describe("runPublishReply", () => {
  it("throws when the ai_reply_decisions row doesn't exist", async () => {
    const { deps } = buildDeps({ decision: null });

    await expect(runPublishReply(deps, { aiReplyDecisionId: "x", inboxMessageId: "y" })).rejects.toThrow(
      "AiReplyDecision x not found",
    );
  });

  it("does nothing when the decision has no reply text", async () => {
    const { deps } = buildDeps({ decision: { id: "d1", replyText: null } });

    await runPublishReply(deps, { aiReplyDecisionId: "d1", inboxMessageId: "y" });

    expect(deps.replyToFacebookComment).not.toHaveBeenCalled();
  });

  it("throws when the inbox message doesn't exist", async () => {
    const { deps } = buildDeps({ message: null });

    await expect(runPublishReply(deps, { aiReplyDecisionId: "d1", inboxMessageId: "missing" })).rejects.toThrow(
      "InboxMessage missing not found",
    );
  });

  it("replies to a Facebook comment using the decrypted page token", async () => {
    const { deps } = buildDeps();

    await runPublishReply(deps, { aiReplyDecisionId: "ai_reply_decision_1", inboxMessageId: "inbox_message_1" });

    expect(deps.decryptToken).toHaveBeenCalledWith("encrypted-token", TOKEN_ENCRYPTION_KEY);
    expect(deps.replyToFacebookComment).toHaveBeenCalledWith(deps.graphClient, {
      commentId: "comment-1",
      pageAccessToken: "decrypted:encrypted-token",
      message: "It's ETB 500!",
    });
  });

  it("sends a Facebook Messenger DM for type dm", async () => {
    const { deps } = buildDeps({
      message: {
        id: "inbox_message_1",
        platform: "facebook_page",
        type: "dm",
        externalMessageId: "mid.100",
        senderExternalId: "psid-1",
        socialAccount: {
          id: "account_1",
          externalAccountId: "page-123",
          accessTokenEncrypted: "encrypted-token",
          status: "active",
        },
      },
    });

    await runPublishReply(deps, { aiReplyDecisionId: "ai_reply_decision_1", inboxMessageId: "inbox_message_1" });

    expect(deps.sendFacebookMessage).toHaveBeenCalledWith(deps.graphClient, {
      pageAccessToken: "decrypted:encrypted-token",
      recipientId: "psid-1",
      text: "It's ETB 500!",
    });
    expect(deps.replyToFacebookComment).not.toHaveBeenCalled();
  });

  it("replies to an Instagram comment using the ig-comment-id endpoint", async () => {
    const { deps } = buildDeps({
      message: {
        id: "inbox_message_1",
        platform: "instagram_business",
        type: "comment",
        externalMessageId: "ig-comment-1",
        senderExternalId: "igsid-1",
        socialAccount: {
          id: "account_ig",
          externalAccountId: "ig-user-1",
          accessTokenEncrypted: "encrypted-page-token",
          status: "active",
        },
      },
    });

    await runPublishReply(deps, { aiReplyDecisionId: "ai_reply_decision_1", inboxMessageId: "inbox_message_1" });

    expect(deps.replyToInstagramComment).toHaveBeenCalledWith(deps.graphClient, {
      commentId: "ig-comment-1",
      pageAccessToken: "decrypted:encrypted-page-token",
      message: "It's ETB 500!",
    });
  });

  it("sends an Instagram Direct message for type dm", async () => {
    const { deps } = buildDeps({
      message: {
        id: "inbox_message_1",
        platform: "instagram_business",
        type: "dm",
        externalMessageId: "mid.200",
        senderExternalId: "igsid-1",
        socialAccount: {
          id: "account_ig",
          externalAccountId: "ig-user-1",
          accessTokenEncrypted: "encrypted-page-token",
          status: "active",
        },
      },
    });

    await runPublishReply(deps, { aiReplyDecisionId: "ai_reply_decision_1", inboxMessageId: "inbox_message_1" });

    expect(deps.sendInstagramMessage).toHaveBeenCalledWith(deps.graphClient, {
      igUserId: "ig-user-1",
      pageAccessToken: "decrypted:encrypted-page-token",
      recipientId: "igsid-1",
      text: "It's ETB 500!",
    });
  });

  it("replies to a Threads post using the threads-specific GraphClient", async () => {
    const { deps } = buildDeps({
      message: {
        id: "inbox_message_1",
        platform: "threads",
        type: "comment",
        externalMessageId: "threads-reply-in",
        senderExternalId: "threads-sender-1",
        socialAccount: {
          id: "account_threads",
          externalAccountId: "threads-user-1",
          accessTokenEncrypted: "encrypted-threads-token",
          status: "active",
        },
      },
    });

    await runPublishReply(deps, { aiReplyDecisionId: "ai_reply_decision_1", inboxMessageId: "inbox_message_1" });

    expect(deps.replyToThreadsPost).toHaveBeenCalledWith(deps.threadsGraphClient, {
      threadsUserId: "threads-user-1",
      accessToken: "decrypted:encrypted-threads-token",
      replyToId: "threads-reply-in",
      text: "It's ETB 500!",
    });
  });

  it("rolls the message back to needs_attention when the connected account is no longer active", async () => {
    const { deps, inboxMessageUpdate } = buildDeps({
      message: {
        id: "inbox_message_1",
        platform: "facebook_page",
        type: "comment",
        externalMessageId: "comment-1",
        senderExternalId: "sender-1",
        socialAccount: {
          id: "account_1",
          externalAccountId: "page-123",
          accessTokenEncrypted: "encrypted-token",
          status: "error",
        },
      },
    });

    await runPublishReply(deps, { aiReplyDecisionId: "ai_reply_decision_1", inboxMessageId: "inbox_message_1" });

    expect(deps.replyToFacebookComment).not.toHaveBeenCalled();
    expect(inboxMessageUpdate).toHaveBeenCalledWith({
      where: { id: "inbox_message_1" },
      data: { status: "needs_attention" },
    });
  });

  it("rolls the message back to needs_attention on a permanent Graph API error, without retrying", async () => {
    const permanentError = new GraphApiError({ message: "Invalid parameter", status: 400, category: "permanent" });
    const { deps, inboxMessageUpdate } = buildDeps();
    deps.replyToFacebookComment = vi.fn().mockRejectedValue(permanentError);

    await runPublishReply(deps, { aiReplyDecisionId: "ai_reply_decision_1", inboxMessageId: "inbox_message_1" });

    expect(inboxMessageUpdate).toHaveBeenCalledWith({
      where: { id: "inbox_message_1" },
      data: { status: "needs_attention" },
    });
  });

  it("rethrows a retryable Graph API error so Trigger.dev retries the run", async () => {
    const rateLimitedError = new GraphApiError({ message: "Rate limited", status: 429, category: "rate_limited" });
    const { deps, inboxMessageUpdate } = buildDeps();
    deps.replyToFacebookComment = vi.fn().mockRejectedValue(rateLimitedError);

    await expect(
      runPublishReply(deps, { aiReplyDecisionId: "ai_reply_decision_1", inboxMessageId: "inbox_message_1" }),
    ).rejects.toThrow("Rate limited");

    expect(inboxMessageUpdate).not.toHaveBeenCalled();
  });
});
