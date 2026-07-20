import { decryptToken } from "@postauto/shared";
import type { Platform } from "@postauto/shared";
import {
  GraphClient,
  fetchFacebookPostEngagement,
  fetchInstagramMediaEngagement,
  fetchThreadsMediaEngagement,
  type EngagementMetrics,
} from "@postauto/social";
import { prisma } from "@postauto/db";
import { schedules } from "@trigger.dev/sdk/v3";
import { loadEnv } from "../env.js";

/** Threads' Graph API lives on a different host than Facebook/Instagram (see packages/social/src/oauth.ts and threads/publish-post.ts). */
const THREADS_GRAPH_BASE_URL = "https://graph.threads.net";

export interface CollectEngagementSnapshotsPayload {
  /** Restricts the run to one business's variants; omit to sweep every business (the cron's default). */
  businessId?: string;
}

interface CollectEngagementSnapshotsSocialAccount {
  platform: Platform;
  externalAccountId: string;
  accessTokenEncrypted: string;
  status: string;
}

export interface CollectEngagementSnapshotsVariant {
  id: string;
  platform: Platform;
  externalPostId: string;
  post: {
    business: {
      socialAccounts: CollectEngagementSnapshotsSocialAccount[];
    };
  };
}

export interface EngagementSnapshotWriteData {
  postPlatformVariantId: string;
  capturedAt: Date;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  reach: number;
  impressions: number;
}

/**
 * Structural subset of PrismaClient this task needs, mirroring the narrow-
 * interface pattern used by publish-post.ts's PublishPostStore and
 * render-slides.ts's RenderSlidesStore.
 */
export interface CollectEngagementSnapshotsStore {
  postPlatformVariant: {
    findMany(args: {
      where: {
        variantStatus: "published";
        externalPostId: { not: null };
        post?: { businessId: string };
      };
      include: { post: { include: { business: { include: { socialAccounts: true } } } } };
    }): Promise<CollectEngagementSnapshotsVariant[]>;
  };
  engagementSnapshot: {
    createMany(args: { data: EngagementSnapshotWriteData[] }): Promise<unknown>;
  };
}

export type FetchEngagementFn = (
  platform: Platform,
  client: GraphClient,
  params: { externalPostId: string; accessToken: string },
) => Promise<EngagementMetrics>;

/** Dispatches to the right packages/social fetcher per platform, normalizing each one's differently-named params. */
export const defaultFetchEngagement: FetchEngagementFn = (platform, client, params) => {
  switch (platform) {
    case "facebook_page":
      return fetchFacebookPostEngagement(client, { postId: params.externalPostId, pageAccessToken: params.accessToken });
    case "instagram_business":
      return fetchInstagramMediaEngagement(client, { mediaId: params.externalPostId, pageAccessToken: params.accessToken });
    case "threads":
      return fetchThreadsMediaEngagement(client, { mediaId: params.externalPostId, accessToken: params.accessToken });
  }
};

export interface CollectEngagementSnapshotsDeps {
  store: CollectEngagementSnapshotsStore;
  /** Injectable for tests; defaults to a real GraphClient (Threads pointed at graph.threads.net). */
  graphClientFactory: (platform: Platform) => GraphClient;
  /** Injectable for tests; defaults to defaultFetchEngagement. */
  fetchEngagement: FetchEngagementFn;
  /** Injectable for tests; defaults to decryptToken. */
  decryptToken: (payload: string, hexKey: string) => string;
  tokenEncryptionKey: string;
  /** Injectable for tests; defaults to `() => new Date()`. */
  now: () => Date;
}

export interface CollectEngagementSnapshotsResult {
  captured: number;
  skipped: number;
  errors: { variantId: string; message: string }[];
}

/**
 * Pure orchestration for collect-engagement-snapshots: loads every published
 * post_platform_variant (optionally scoped to one business), resolves each
 * one's active social_account for its platform, fetches fresh engagement
 * metrics via packages/social's per-platform fetch-engagement helpers, and
 * persists one engagement_snapshots row per variant (see PLAN.md's M4
 * Analytics phase). A variant with no active social_account, or a failed
 * fetch (revoked token, deleted post, transient Graph API error, etc.), is
 * skipped/recorded rather than aborting the whole sweep -- a single business's
 * broken connection shouldn't block every other business's snapshot for this
 * run.
 */
export async function runCollectEngagementSnapshots(
  deps: CollectEngagementSnapshotsDeps,
  payload: CollectEngagementSnapshotsPayload = {},
): Promise<CollectEngagementSnapshotsResult> {
  const variants = await deps.store.postPlatformVariant.findMany({
    where: {
      variantStatus: "published",
      externalPostId: { not: null },
      ...(payload.businessId ? { post: { businessId: payload.businessId } } : {}),
    },
    include: { post: { include: { business: { include: { socialAccounts: true } } } } },
  });

  const rows: EngagementSnapshotWriteData[] = [];
  const errors: { variantId: string; message: string }[] = [];
  let skipped = 0;

  for (const variant of variants) {
    const socialAccount = variant.post.business.socialAccounts.find(
      (account) => account.platform === variant.platform && account.status === "active",
    );
    if (!socialAccount) {
      skipped += 1;
      continue;
    }

    try {
      const accessToken = deps.decryptToken(socialAccount.accessTokenEncrypted, deps.tokenEncryptionKey);
      const client = deps.graphClientFactory(variant.platform);
      const metrics = await deps.fetchEngagement(variant.platform, client, {
        externalPostId: variant.externalPostId,
        accessToken,
      });

      rows.push({
        postPlatformVariantId: variant.id,
        capturedAt: deps.now(),
        likesCount: metrics.likesCount,
        commentsCount: metrics.commentsCount,
        sharesCount: metrics.sharesCount,
        reach: metrics.reach,
        impressions: metrics.impressions,
      });
    } catch (error) {
      errors.push({ variantId: variant.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (rows.length > 0) {
    await deps.store.engagementSnapshot.createMany({ data: rows });
  }

  return { captured: rows.length, skipped, errors };
}

const prismaStore: CollectEngagementSnapshotsStore = {
  postPlatformVariant: {
    findMany: (args) =>
      prisma.postPlatformVariant.findMany({
        where: args.where,
        include: { post: { include: { business: { include: { socialAccounts: true } } } } },
      }) as unknown as Promise<CollectEngagementSnapshotsVariant[]>,
  },
  engagementSnapshot: {
    createMany: (args) => prisma.engagementSnapshot.createMany({ data: args.data }),
  },
};

function defaultGraphClientFactory(platform: Platform): GraphClient {
  return platform === "threads" ? new GraphClient({ baseUrl: THREADS_GRAPH_BASE_URL }) : new GraphClient();
}

/**
 * Runs hourly by default -- frequent enough for a seller to see engagement
 * trend within a business day without hammering Meta's rate limits (one
 * insights read per published variant per hour). Adjust via the Trigger.dev
 * dashboard/SDK (see schedules.create) without a code change if a different
 * cadence is needed later.
 */
export const collectEngagementSnapshotsTask = schedules.task({
  id: "collect-engagement-snapshots",
  cron: "0 * * * *",
  run: async () => {
    const env = loadEnv();
    return runCollectEngagementSnapshots({
      store: prismaStore,
      graphClientFactory: defaultGraphClientFactory,
      fetchEngagement: defaultFetchEngagement,
      decryptToken,
      tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
      now: () => new Date(),
    });
  },
});
