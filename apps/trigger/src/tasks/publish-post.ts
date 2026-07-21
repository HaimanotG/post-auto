import { decryptToken } from "@postauto/shared";
import {
  GraphApiError,
  GraphClient,
  publishPhotoToFacebookPage,
  type PublishPhotoParams,
  type PublishPhotoResult,
} from "@postauto/social";
import { task } from "@trigger.dev/sdk";
import { prisma } from "@postauto/db";
import { loadEnv } from "../env.js";

export interface PublishPostPayload {
  postPlatformVariantId: string;
}

interface PublishPostSocialAccount {
  platform: string;
  externalAccountId: string;
  accessTokenEncrypted: string;
  status: string;
}

export interface PublishPostVariant {
  id: string;
  platform: string;
  captionText: string | null;
  mediaUrls: string[];
  retryCount: number;
  post: {
    business: {
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

/**
 * Structural subset of PrismaClient this task needs, mirroring the narrow
 * interface pattern used by apps/api's routes (see PostStore/OAuthStore).
 */
export interface PublishPostStore {
  postPlatformVariant: {
    findUnique(args: {
      where: { id: string };
      include: { post: { include: { business: { include: { socialAccounts: true } } } } };
    }): Promise<PublishPostVariant | null>;
    update(args: { where: { id: string }; data: VariantUpdateData }): Promise<unknown>;
  };
}

export interface PublishPostDeps {
  store: PublishPostStore;
  graphClient: GraphClient;
  /** Injectable for tests; defaults to publishPhotoToFacebookPage. */
  publishPhoto: (client: GraphClient, params: PublishPhotoParams) => Promise<PublishPhotoResult>;
  /** Injectable for tests; defaults to decryptToken. */
  decryptToken: (payload: string, hexKey: string) => string;
  tokenEncryptionKey: string;
}

/**
 * Pure orchestration for publish-post: loads the variant + its business's
 * connected Facebook Page, calls packages/social/facebook/publish-photo.ts,
 * and drives post_platform_variants.variant_status through the transitions
 * PLAN.md describes -- permanent Graph API errors mark the variant `failed`
 * without retrying (matches PLAN.md's "Meta Graph API integration" rate
 * limits section); retryable errors (rate-limited, transient, or an
 * unclassified network failure) are rethrown so Trigger.dev's own
 * retry/backoff (configured on the task below) retries the run.
 */
export async function runPublishPost(deps: PublishPostDeps, payload: PublishPostPayload): Promise<void> {
  const variant = await deps.store.postPlatformVariant.findUnique({
    where: { id: payload.postPlatformVariantId },
    include: { post: { include: { business: { include: { socialAccounts: true } } } } },
  });

  if (!variant) {
    throw new Error(`PostPlatformVariant ${payload.postPlatformVariantId} not found`);
  }

  if (variant.platform !== "facebook_page") {
    await deps.store.postPlatformVariant.update({
      where: { id: variant.id },
      data: {
        variantStatus: "failed",
        errorMessage: `publish-post only supports the facebook_page platform in M1, got "${variant.platform}"`,
      },
    });
    return;
  }

  const socialAccount = variant.post.business.socialAccounts.find(
    (account) => account.platform === "facebook_page" && account.status === "active",
  );
  if (!socialAccount) {
    await deps.store.postPlatformVariant.update({
      where: { id: variant.id },
      data: { variantStatus: "failed", errorMessage: "No active Facebook Page connection found for this business." },
    });
    return;
  }

  const imageUrl = variant.mediaUrls[0];
  if (!imageUrl) {
    await deps.store.postPlatformVariant.update({
      where: { id: variant.id },
      data: { variantStatus: "failed", errorMessage: "Variant has no media to publish." },
    });
    return;
  }

  await deps.store.postPlatformVariant.update({
    where: { id: variant.id },
    data: { variantStatus: "publishing" },
  });

  const pageAccessToken = deps.decryptToken(socialAccount.accessTokenEncrypted, deps.tokenEncryptionKey);

  try {
    const result = await deps.publishPhoto(deps.graphClient, {
      pageId: socialAccount.externalAccountId,
      pageAccessToken,
      imageUrl,
      caption: variant.captionText ?? undefined,
    });

    await deps.store.postPlatformVariant.update({
      where: { id: variant.id },
      data: { variantStatus: "published", externalPostId: result.postId ?? result.photoId },
    });
  } catch (error) {
    const isRetryable = error instanceof GraphApiError ? error.isRetryable : true;

    if (!isRetryable) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.store.postPlatformVariant.update({
        where: { id: variant.id },
        data: { variantStatus: "failed", errorMessage: message },
      });
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
        publishPhoto: publishPhotoToFacebookPage,
        decryptToken,
        tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
      },
      payload,
    );
  },
});
