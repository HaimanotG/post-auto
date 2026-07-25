import { decryptToken } from "@postauto/shared";
import {
  GraphApiError,
  GraphClient,
  replyToFacebookComment,
  replyToInstagramComment,
  replyToThreadsPost,
  sendFacebookMessage,
  sendInstagramMessage,
  type ReplyToFacebookCommentParams,
  type ReplyToFacebookCommentResult,
  type ReplyToInstagramCommentParams,
  type ReplyToInstagramCommentResult,
  type ReplyToThreadsPostParams,
  type ReplyToThreadsPostResult,
  type SendFacebookMessageParams,
  type SendFacebookMessageResult,
  type SendInstagramMessageParams,
  type SendInstagramMessageResult,
} from "@postauto/social";
import { prisma } from "@postauto/db";
import { task } from "@trigger.dev/sdk";
import { loadEnv } from "../env.js";

export interface PublishReplyPayload {
  aiReplyDecisionId: string;
  inboxMessageId: string;
}

interface PublishReplySocialAccount {
  id: string;
  externalAccountId: string;
  accessTokenEncrypted: string;
  status: string;
}

interface PublishReplyInboxMessage {
  id: string;
  platform: string;
  type: string;
  externalMessageId: string;
  senderExternalId: string;
  socialAccount: PublishReplySocialAccount | null;
}

interface PublishReplyDecision {
  id: string;
  replyText: string | null;
}

/**
 * Structural subset of PrismaClient this task needs, mirroring the narrow
 * interface pattern used by publish-post.ts's PublishPostStore and
 * process-meta-webhook.ts's ProcessMetaWebhookStore.
 */
export interface PublishReplyStore {
  aiReplyDecision: {
    findUnique(args: { where: { id: string } }): Promise<PublishReplyDecision | null>;
  };
  inboxMessage: {
    findUnique(args: {
      where: { id: string };
      include: { socialAccount: true };
    }): Promise<PublishReplyInboxMessage | null>;
    update(args: { where: { id: string }; data: { status: "needs_attention" } }): Promise<unknown>;
  };
}

export interface PublishReplyDeps {
  store: PublishReplyStore;
  graphClient: GraphClient;
  /** Threads lives on a different host (`graph.threads.net`) than the rest of the Graph API -- see publish-post.ts. */
  threadsGraphClient: GraphClient;
  replyToFacebookComment: (client: GraphClient, params: ReplyToFacebookCommentParams) => Promise<ReplyToFacebookCommentResult>;
  sendFacebookMessage: (client: GraphClient, params: SendFacebookMessageParams) => Promise<SendFacebookMessageResult>;
  replyToInstagramComment: (
    client: GraphClient,
    params: ReplyToInstagramCommentParams,
  ) => Promise<ReplyToInstagramCommentResult>;
  sendInstagramMessage: (client: GraphClient, params: SendInstagramMessageParams) => Promise<SendInstagramMessageResult>;
  replyToThreadsPost: (client: GraphClient, params: ReplyToThreadsPostParams) => Promise<ReplyToThreadsPostResult>;
  decryptToken: (payload: string, hexKey: string) => string;
  tokenEncryptionKey: string;
}

/**
 * Pure orchestration for publish-reply: the task classify-and-reply.ts
 * enqueues on an `auto_reply` decision (previously a no-op -- this task
 * didn't exist, see that file's history). Loads the generated reply text and
 * the inbox message it answers, decrypts the connected account's token, and
 * dispatches to the matching packages/social reply/send-message adapter
 * based on platform + message type (comment/mention -> reply-to-comment,
 * dm -> send-message). A permanent failure rolls the inbox message back to
 * `needs_attention` (it was optimistically set to `auto_replied` by
 * classify-and-reply) so a human notices the customer was never actually
 * answered; retryable errors are rethrown for Trigger.dev's retry/backoff.
 */
export async function runPublishReply(deps: PublishReplyDeps, payload: PublishReplyPayload): Promise<void> {
  const decision = await deps.store.aiReplyDecision.findUnique({ where: { id: payload.aiReplyDecisionId } });
  if (!decision) {
    throw new Error(`AiReplyDecision ${payload.aiReplyDecisionId} not found`);
  }
  if (!decision.replyText) {
    // Nothing to publish -- shouldn't happen for an auto_reply decision, but guards against bad data.
    return;
  }

  const message = await deps.store.inboxMessage.findUnique({
    where: { id: payload.inboxMessageId },
    include: { socialAccount: true },
  });
  if (!message) {
    throw new Error(`InboxMessage ${payload.inboxMessageId} not found`);
  }

  const socialAccount = message.socialAccount;
  if (!socialAccount || socialAccount.status !== "active") {
    await deps.store.inboxMessage.update({ where: { id: message.id }, data: { status: "needs_attention" } });
    return;
  }

  const accessToken = deps.decryptToken(socialAccount.accessTokenEncrypted, deps.tokenEncryptionKey);
  const replyText = decision.replyText;

  try {
    switch (message.platform) {
      case "facebook_page": {
        if (message.type === "dm") {
          await deps.sendFacebookMessage(deps.graphClient, {
            pageAccessToken: accessToken,
            recipientId: message.senderExternalId,
            text: replyText,
          });
        } else {
          await deps.replyToFacebookComment(deps.graphClient, {
            commentId: message.externalMessageId,
            pageAccessToken: accessToken,
            message: replyText,
          });
        }
        break;
      }
      case "instagram_business": {
        if (message.type === "dm") {
          await deps.sendInstagramMessage(deps.graphClient, {
            igUserId: socialAccount.externalAccountId,
            pageAccessToken: accessToken,
            recipientId: message.senderExternalId,
            text: replyText,
          });
        } else {
          await deps.replyToInstagramComment(deps.graphClient, {
            commentId: message.externalMessageId,
            pageAccessToken: accessToken,
            message: replyText,
          });
        }
        break;
      }
      case "threads": {
        await deps.replyToThreadsPost(deps.threadsGraphClient, {
          threadsUserId: socialAccount.externalAccountId,
          accessToken,
          replyToId: message.externalMessageId,
          text: replyText,
        });
        break;
      }
      default:
        await deps.store.inboxMessage.update({ where: { id: message.id }, data: { status: "needs_attention" } });
        return;
    }
  } catch (error) {
    const isRetryable = error instanceof GraphApiError ? error.isRetryable : true;
    if (!isRetryable) {
      await deps.store.inboxMessage.update({ where: { id: message.id }, data: { status: "needs_attention" } });
      return;
    }
    throw error;
  }
}

const prismaStore: PublishReplyStore = {
  aiReplyDecision: {
    findUnique: (args) =>
      prisma.aiReplyDecision.findUnique({ where: args.where, select: { id: true, replyText: true } }),
  },
  inboxMessage: {
    findUnique: (args) =>
      prisma.inboxMessage.findUnique({
        where: args.where,
        select: {
          id: true,
          platform: true,
          type: true,
          externalMessageId: true,
          senderExternalId: true,
          socialAccount: {
            select: { id: true, externalAccountId: true, accessTokenEncrypted: true, status: true },
          },
        },
      }),
    update: (args) => prisma.inboxMessage.update(args),
  },
};

export const publishReplyTask = task({
  id: "publish-reply",
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
    randomize: true,
  },
  run: async (payload: PublishReplyPayload) => {
    const env = loadEnv();
    await runPublishReply(
      {
        store: prismaStore,
        graphClient: new GraphClient(),
        threadsGraphClient: new GraphClient({ baseUrl: "https://graph.threads.net" }),
        replyToFacebookComment,
        sendFacebookMessage,
        replyToInstagramComment,
        sendInstagramMessage,
        replyToThreadsPost,
        decryptToken,
        tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
      },
      payload,
    );
  },
});
