import type { FastifyInstance } from "fastify";
import type { Platform } from "@postauto/shared";
import { requireAuthenticatedUser, resolveOwnedBusiness, type BusinessContextStore } from "../lib/business-context.js";

interface StoredEngagementSnapshot {
  capturedAt: Date;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  reach: number;
  impressions: number;
}

interface StoredVariantWithLatestSnapshot {
  id: string;
  platform: Platform;
  variantStatus: string;
  externalPermalink: string | null;
  post: {
    id: string;
    captionMaster: string | null;
  };
  engagementSnapshots: StoredEngagementSnapshot[];
}

/**
 * Structural subset of PrismaClient this route needs, mirroring the narrow
 * interface pattern used by routes/posts.ts's PostStore. Only the latest
 * snapshot per variant is fetched (`take: 1`) since engagement_snapshots
 * rows are cumulative point-in-time captures (see
 * apps/trigger/tasks/collect-engagement-snapshots.ts), not deltas — summing
 * every historical row would double-count engagement.
 */
export interface AnalyticsStore extends BusinessContextStore {
  postPlatformVariant: {
    findMany(args: {
      where: { post: { businessId: string } };
      include: {
        post: { select: { id: true; captionMaster: true } };
        engagementSnapshots: { orderBy: { capturedAt: "desc" }; take: 1 };
      };
    }): Promise<StoredVariantWithLatestSnapshot[]>;
  };
}

export interface AnalyticsRoutesOptions {
  prisma: AnalyticsStore;
}

interface EngagementTotals {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
}

const ZERO_TOTALS: EngagementTotals = { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 };

function addTotals(a: EngagementTotals, b: EngagementTotals): EngagementTotals {
  return {
    likes: a.likes + b.likes,
    comments: a.comments + b.comments,
    shares: a.shares + b.shares,
    reach: a.reach + b.reach,
    impressions: a.impressions + b.impressions,
  };
}

function totalsFromSnapshot(snapshot: StoredEngagementSnapshot | undefined): EngagementTotals {
  if (!snapshot) return ZERO_TOTALS;
  return {
    likes: snapshot.likesCount,
    comments: snapshot.commentsCount,
    shares: snapshot.sharesCount,
    reach: snapshot.reach,
    impressions: snapshot.impressions,
  };
}

/**
 * Registers GET /analytics per PLAN.md's M4 analytics milestone: aggregates
 * each of the business's post_platform_variants down to its latest
 * engagement_snapshot, then rolls those up into business-wide totals and a
 * per-platform breakdown alongside the per-post detail. Variants with no
 * snapshot yet (not published, or not swept by the cron yet) contribute zero
 * rather than being excluded, so post lists stay stable as data arrives.
 */
export function registerAnalyticsRoutes(app: FastifyInstance, options: AnalyticsRoutesOptions): void {
  app.get("/analytics", async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply);
    if (!user) return;

    const business = await resolveOwnedBusiness(options.prisma, user);

    const variants = await options.prisma.postPlatformVariant.findMany({
      where: { post: { businessId: business.id } },
      include: {
        post: { select: { id: true, captionMaster: true } },
        engagementSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      },
    });

    let totals = ZERO_TOTALS;
    const byPlatform = new Map<Platform, EngagementTotals>();
    const postsById = new Map<
      string,
      { postId: string; captionMaster: string | null; variants: Array<{ platform: Platform; variantStatus: string; externalPermalink: string | null; capturedAt: string | null } & EngagementTotals> }
    >();

    for (const variant of variants) {
      const latestSnapshot = variant.engagementSnapshots[0];
      const variantTotals = totalsFromSnapshot(latestSnapshot);

      totals = addTotals(totals, variantTotals);
      byPlatform.set(variant.platform, addTotals(byPlatform.get(variant.platform) ?? ZERO_TOTALS, variantTotals));

      const postEntry = postsById.get(variant.post.id) ?? {
        postId: variant.post.id,
        captionMaster: variant.post.captionMaster,
        variants: [],
      };
      postEntry.variants.push({
        platform: variant.platform,
        variantStatus: variant.variantStatus,
        externalPermalink: variant.externalPermalink,
        capturedAt: latestSnapshot ? latestSnapshot.capturedAt.toISOString() : null,
        ...variantTotals,
      });
      postsById.set(variant.post.id, postEntry);
    }

    await reply.code(200).send({
      totals,
      byPlatform: [...byPlatform.entries()].map(([platform, platformTotals]) => ({ platform, ...platformTotals })),
      posts: [...postsById.values()],
    });
  });
}
