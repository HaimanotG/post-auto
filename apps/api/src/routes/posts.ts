import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuthenticatedUser, resolveOwnedBusiness, type BusinessContextStore } from "../lib/business-context.js";

const createPostBodySchema = z.object({
  captionMaster: z.string().max(5000).optional(),
  assets: z
    .array(
      z.object({
        rawUrl: z.string().url(),
        productName: z.string().optional(),
        price: z.number().nonnegative().optional(),
        description: z.string().optional(),
      }),
    )
    .min(1, "At least one image is required"),
});

export type CreatePostBody = z.infer<typeof createPostBodySchema>;

interface StoredPostSourceAsset {
  id: string;
  rawUrl: string;
  productName: string | null;
  price: unknown;
  description: string | null;
  orderIndex: number;
}

interface StoredPost {
  id: string;
  businessId: string;
  status: string;
  captionMaster: string | null;
  createdAt: Date;
  sourceAssets: StoredPostSourceAsset[];
}

/**
 * Structural subset of PrismaClient this route needs, mirroring the narrow
 * interface pattern used by routes/oauth.ts's OAuthStore.
 */
export interface PostStore extends BusinessContextStore {
  post: {
    create(args: {
      data: {
        businessId: string;
        status: "draft";
        captionMaster?: string | null;
        sourceAssets: {
          create: Array<{
            rawUrl: string;
            productName?: string | null;
            price?: number | null;
            description?: string | null;
            orderIndex: number;
          }>;
        };
      };
      include: { sourceAssets: true };
    }): Promise<StoredPost>;
  };
}

export interface PostsRoutesOptions {
  prisma: PostStore;
}

function serializePost(post: StoredPost) {
  return {
    id: post.id,
    businessId: post.businessId,
    status: post.status,
    captionMaster: post.captionMaster,
    createdAt: post.createdAt.toISOString(),
    sourceAssets: [...post.sourceAssets]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((asset) => ({
        id: asset.id,
        rawUrl: asset.rawUrl,
        productName: asset.productName,
        price: asset.price === null || asset.price === undefined ? null : Number(asset.price),
        description: asset.description,
        orderIndex: asset.orderIndex,
      })),
  };
}

/**
 * Registers POST /posts per PLAN.md's M1 composer flow: creates a `draft`
 * post plus its `post_source_assets` (caption + one or more source images,
 * each optionally carrying product name/price/description) in a single
 * nested write. Rendering, platform adaptation, and publishing are later
 * milestones (M1-10 onward) — this route only persists the draft.
 */
export function registerPostsRoutes(app: FastifyInstance, options: PostsRoutesOptions): void {
  app.post("/posts", async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply);
    if (!user) return;

    const bodyResult = createPostBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      await reply.code(400).send({ error: "Invalid request body", details: bodyResult.error.flatten() });
      return;
    }
    const body = bodyResult.data;

    const business = await resolveOwnedBusiness(options.prisma, user);

    const post = await options.prisma.post.create({
      data: {
        businessId: business.id,
        status: "draft",
        captionMaster: body.captionMaster ?? null,
        sourceAssets: {
          create: body.assets.map((asset, index) => ({
            rawUrl: asset.rawUrl,
            productName: asset.productName ?? null,
            price: asset.price ?? null,
            description: asset.description ?? null,
            orderIndex: index,
          })),
        },
      },
      include: { sourceAssets: true },
    });

    await reply.code(201).send(serializePost(post));
  });
}
