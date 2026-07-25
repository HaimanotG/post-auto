import { decryptToken } from "@postauto/shared";
import {
  GraphApiError,
  GraphClient,
  publishPhotoToFacebookPage,
  publishPhotoToInstagram,
  publishThreadsPost,
  sendTelegramMessage,
  type PublishInstagramPhotoParams,
  type PublishInstagramPhotoResult,
  type PublishPhotoParams,
  type PublishPhotoResult,
  type PublishThreadsPostParams,
  type PublishThreadsPostResult,
} from "@postauto/social";
import { task } from "@trigger.dev/sdk";
import { prisma } from "@postauto/db";
import { loadEnv } from "../env.js";

export interface PublishPostPayload {
  postPlatformVariantId: string;
}

interface PublishPostSocialAccount {
  id: string;
  platform: string;
  externalAccountId: string;
  accessTokenEncrypted: string;
  status: string;
}

interface PublishPostSiblingVariant {
  id: string;
  variantStatus: string;
}

export interface PublishPostVariant {
  id: string;
  socialAccountId: string;
  platform: string;
  captionText: string | null;
  mediaUrls: string[];
  retryCount: number;
  post: {
    id: string;
    platformVariants: PublishPostSiblingVariant[];
    business: {
      name: string;
      telegramOwnerUserId: bigint;
      socialAccounts: PublishPostSocialAccount[];
    };
  };
}

type VariantUpdateData = Partial<{
  variantStatus: "pending" | "publishing" | "published" | "failed";
  errorMessage: string | null;
  externalPostId: string | null;
  retryCount: number;
}>;

type RolledUpPostStatus = "publishing" | "published" | "failed" | "partial";

/**
 * Structural subset of PrismaClient this task needs, mirroring the narrow
 * interface pattern used by apps/api's routes (see PostStore/OAuthStore).
 */
export interface PublishPostStore {
  postPlatformVariant: {
    findUnique(args: {
      where: { id: string };
      include: {
        post: { include: { platformVariants: true; business: { include: { socialAccounts: true } } } };
      };
    }): Promise<PublishPostVariant | null>;
    update(args: { where: { id: string }; data: VariantUpdateData }): Promise<unknown>;
    findMany(args: { where: { postId: string } }): Promise<PublishPostSiblingVariant[]>;
  };
  post: {
    update(args: { where: { id: string }; data: { status: RolledUpPostStatus } }): Promise<unknown>;
  };
}

export interface PublishPostDeps {
  store: PublishPostStore;
  graphClient: GraphClient;
  /** Threads lives on a different host (`graph.threads.net`) than the rest of the Graph API -- see packages/social/src/threads/publish-post.ts. */
  threadsGraphClient: GraphClient;
  /** Injectable for tests; defaults to publishPhotoToFacebookPage. */
  publishPhoto: (client: GraphClient, params: PublishPhotoParams) => Promise<PublishPhotoResult>;
  /** Injectable for tests; defaults to publishPhotoToInstagram. */
  publishInstagramPhoto: (client: GraphClient, params: PublishInstagramPhotoParams) => Promise<PublishInstagramPhotoResult>;
  /** Injectable for tests; defaults to publishThreadsPost. */
  publishThreadsPost: (client: GraphClient, params: PublishThreadsPostParams) => Promise<PublishThreadsPostResult>;
  /** Injectable for tests; defaults to decryptToken. */
  decryptToken: (payload: string, hexKey: string) => string;
  tokenEncryptionKey: string;
  /** Injectable for tests; defaults to sendTelegramMessage. Notifies the seller when a variant permanently fails to publish. */
  notifySeller: (payload: { chatId: bigint; text: string }) => Promise<unknown>;
}

/** Once every sibling variant of a post has reached a terminal state, rolls the parent post_platform_variants' outcome up into posts.status. */
function computeRolledUpPostStatus(
  siblings: PublishPostSiblingVariant[],
  currentVariantId: string,
  currentVariantStatus: "published" | "failed",
): RolledUpPostStatus | null {
  const statuses = siblings.map((sibling) => (sibling.id === currentVariantId ? currentVariantStatus : sibling.variantStatus));

  if (statuses.some((status) => status === "pending" || status === "publishing")) {
    return null;
  }
  if (statuses.every((status) => status === "published")) return "published";
  if (statuses.every((status) => status === "failed")) return "failed";
  return "partial";
}

/**
 * Pure orchestration for publish-post: loads the variant + the specific
 * connected account it targets (`socialAccountId`, not just "the first
 * account for this platform" -- a business can have several Facebook Pages
 * connected, each targeted independently), calls the matching
 * packages/social/<platform>/publish-*.ts adapter, and drives
 * post_platform_variants.variant_status through the transitions PLAN.md
 * describes. Once every sibling variant of the same post has reached a
 * terminal state, rolls the outcome up into posts.status (published / failed
 * / partial). Permanent Graph API errors mark the variant `failed` without
 * retrying; retryable errors (rate-limited, transient, or an unclassified
 * network failure) are rethrown so Trigger.dev's own retry/backoff (configured
 * on the task below) retries the run.
 */
export async function runPublishPost(deps: PublishPostDeps, payload: PublishPostPayload): Promise<void> {
  const variant = await deps.store.postPlatformVariant.findUnique({
    where: { id: payload.postPlatformVariantId },
    include: { post: { include: { platformVariants: true, business: { include: { socialAccounts: true } } } } },
  });

  if (!variant) {
    throw new Error(`PostPlatformVariant ${payload.postPlatformVariantId} not found`);
  }

  async function finishVariant(status: "published" | "failed", data: VariantUpdateData): Promise<void> {
    await deps.store.postPlatformVariant.update({ where: { id: variant!.id }, data });
    // Siblings may have finished concurrently (POST /posts/:id/publish enqueues
    // every target variant via Promise.all), so refetch their current statuses
    // here rather than trusting the snapshot loaded when this task started.
    const siblings = await deps.store.postPlatformVariant.findMany({ where: { postId: variant!.post.id } });
    const rolledUp = computeRolledUpPostStatus(siblings, variant!.id, status);
    if (rolledUp) {
      await deps.store.post.update({ where: { id: variant!.post.id }, data: { status: rolledUp } });
    }

    if (status === "failed") {
      // Best-effort: a failed Telegram notification shouldn't mask the
      // publish failure itself, which is already durably recorded above.
      try {
        await deps.notifySeller({
          chatId: variant!.post.business.telegramOwnerUserId,
          text: `Your post to ${variant!.platform} failed to publish: ${data.errorMessage ?? "unknown error"}`,
        });
      } catch (error) {
        console.error(`Failed to notify seller of failed publish for variant ${variant!.id}`, error);
      }
    }
  }

  const socialAccount = variant.post.business.socialAccounts.find(
    (account) => account.id === variant.socialAccountId && account.status === "active",
  );
  if (!socialAccount) {
    await finishVariant("failed", {
      variantStatus: "failed",
      errorMessage: "The connected account for this post is no longer active. Reconnect it and try again.",
    });
    return;
  }

  const imageUrl = variant.mediaUrls[0];
  const hasText = Boolean(variant.captionText && variant.captionText.trim().length > 0);
  const requiresMedia = variant.platform !== "threads";
  if ((requiresMedia && !imageUrl) || (!requiresMedia && !imageUrl && !hasText)) {
    await finishVariant("failed", { variantStatus: "failed", errorMessage: "Variant has no content to publish." });
    return;
  }

  await deps.store.postPlatformVariant.update({ where: { id: variant.id }, data: { variantStatus: "publishing" } });

  const accessToken = deps.decryptToken(socialAccount.accessTokenEncrypted, deps.tokenEncryptionKey);

  try {
    let externalPostId: string;

    switch (variant.platform) {
      case "facebook_page": {
        const result = await deps.publishPhoto(deps.graphClient, {
          pageId: socialAccount.externalAccountId,
          pageAccessToken: accessToken,
          imageUrl: imageUrl!,
          caption: variant.captionText ?? undefined,
        });
        externalPostId = result.postId ?? result.photoId;
        break;
      }
      case "instagram_business": {
        const result = await deps.publishInstagramPhoto(deps.graphClient, {
          igUserId: socialAccount.externalAccountId,
          pageAccessToken: accessToken,
          imageUrl: imageUrl!,
          caption: variant.captionText ?? undefined,
        });
        externalPostId = result.mediaId;
        break;
      }
      case "threads": {
        const result = await deps.publishThreadsPost(deps.threadsGraphClient, {
          threadsUserId: socialAccount.externalAccountId,
          accessToken,
          text: variant.captionText ?? undefined,
          imageUrl: imageUrl ?? undefined,
        });
        externalPostId = result.mediaId;
        break;
      }
      default:
        await finishVariant("failed", {
          variantStatus: "failed",
          errorMessage: `Unsupported platform "${variant.platform}"`,
        });
        return;
    }

    await finishVariant("published", { variantStatus: "published", externalPostId });
  } catch (error) {
    const isRetryable = error instanceof GraphApiError ? error.isRetryable : true;

    if (!isRetryable) {
      const message = error instanceof Error ? error.message : String(error);
      await finishVariant("failed", { variantStatus: "failed", errorMessage: message });
      return;
    }

    await deps.store.postPlatformVariant.update({
      where: { id: variant.id },
      data: { retryCount: variant.retryCount + 1 },
    });
    throw error;
  }
}

export const publishPostTask = task({
  id: "publish-post",
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
    randomize: true,
  },
  run: async (payload: PublishPostPayload) => {
    const env = loadEnv();
    await runPublishPost(
      {
        store: prisma,
        graphClient: new GraphClient(),
        threadsGraphClient: new GraphClient({ baseUrl: "https://graph.threads.net" }),
        publishPhoto: publishPhotoToFacebookPage,
        publishInstagramPhoto: publishPhotoToInstagram,
        publishThreadsPost,
        decryptToken,
        tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
        notifySeller: ({ chatId, text }) => sendTelegramMessage({ botToken: env.TELEGRAM_BOT_TOKEN, chatId, text }),
      },
      payload,
    );
  },
});
