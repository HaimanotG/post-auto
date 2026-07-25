import type { FastifyInstance } from "fastify";
import { formatMarketplaceListing } from "@postauto/social";
import { requireAuthenticatedUser, resolveOwnedBusiness, type BusinessContextStore } from "../lib/business-context.js";

interface StoredPostSourceAsset {
  rawUrl: string;
  productName: string | null;
  price: unknown;
  description: string | null;
  orderIndex: number;
}

interface StoredPostForListing {
  captionMaster: string | null;
  sourceAssets: StoredPostSourceAsset[];
}

/**
 * Structural subset of PrismaClient this route needs, mirroring the narrow
 * interface pattern used by routes/posts.ts's PostStore.
 */
export interface MarketplaceStore extends BusinessContextStore {
  post: {
    findMany(args: {
      where: { businessId: string };
      orderBy: { createdAt: "desc" };
      include: { sourceAssets: true };
      take: number;
    }): Promise<StoredPostForListing[]>;
  };
}

export interface MarketplaceRoutesOptions {
  prisma: MarketplaceStore;
}

/** How many of the business's most recent posts to scan for one with enough content to prepare a listing from. */
const RECENT_POSTS_SCAN_LIMIT = 20;

function findEligiblePost(posts: StoredPostForListing[]): { post: StoredPostForListing; cover: StoredPostSourceAsset } | null {
  for (const post of posts) {
    const cover = [...post.sourceAssets].sort((a, b) => a.orderIndex - b.orderIndex)[0];
    if (!cover) continue;
    const hasTitleSource = Boolean(cover.productName?.trim()) || Boolean(post.captionMaster?.trim());
    if (hasTitleSource) {
      return { post, cover };
    }
  }
  return null;
}

/**
 * Registers GET /marketplace/listing: the mini app's PrepareListing.tsx
 * (m5-03) has had no data source since M5 shipped format-listing.ts and
 * MarketplacePhoto.tsx -- nothing ever wired a post's photo + product data
 * into listing content for it to render (see routes.tsx's
 * MarketplaceRouteStub). Reuses the post's own raw uploaded photo as
 * `photoUrl` rather than rendering a fresh unbranded MarketplacePhoto slide
 * (no trigger task produces one), since PLAN.md's Marketplace assist flow
 * only requires "prepare, don't auto-post" content, not a polished render.
 * Picks the business's most recent post that has both a source photo and
 * enough text (a product name or caption) to build a listing from.
 */
export function registerMarketplaceRoutes(app: FastifyInstance, options: MarketplaceRoutesOptions): void {
  app.get("/marketplace/listing", async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply);
    if (!user) return;

    const business = await resolveOwnedBusiness(options.prisma, user);
    const posts = await options.prisma.post.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      include: { sourceAssets: true },
      take: RECENT_POSTS_SCAN_LIMIT,
    });

    const eligible = findEligiblePost(posts);
    if (!eligible) {
      return { available: false };
    }

    const listing = formatMarketplaceListing({
      captionMaster: eligible.post.captionMaster ?? "",
      productName: eligible.cover.productName,
      price: eligible.cover.price === null || eligible.cover.price === undefined ? null : Number(eligible.cover.price),
      description: eligible.cover.description,
    });

    return { available: true, photoUrl: eligible.cover.rawUrl, listing };
  });
}
