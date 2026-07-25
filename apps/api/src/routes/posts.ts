import type { Platform, PostStatus } from "@postauto/shared";
import { tasks } from "@trigger.dev/sdk/v3";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuthenticatedUser, resolveOwnedBusiness, type BusinessContextStore } from "../lib/business-context.js";

// Kept as a literal union (not imported from apps/trigger's SlideTemplateId)
// so apps/api doesn't depend on apps/trigger -- same reasoning as
// enqueuePublishPost triggering by task-id string below.
const SLIDE_TEMPLATE_IDS = ["single-product", "price-highlight", "carousel"] as const;

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
  // Ids of the caller's social_accounts to publish this post to. Optional so
  // the composer can still save a plain draft before deciding where to post;
  // POST /posts/:id/publish enqueues the actual publish once targets exist.
  targetAccountIds: z.array(z.string()).optional(),
  // When provided alongside targetAccountIds, best-effort enqueues
  // apps/trigger's render-slides task to replace the targeted variants' raw
  // pasted asset URLs with branded rendered slides (see render-slides.ts).
  templateId: z.enum(SLIDE_TEMPLATE_IDS).optional(),
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

interface StoredPostPlatformVariant {
  id: string;
  socialAccountId: string;
  platform: Platform;
  variantStatus: string;
  errorMessage: string | null;
  externalPostId: string | null;
}

interface StoredPost {
  id: string;
  businessId: string;
  status: string;
  captionMaster: string | null;
  createdAt: Date;
  sourceAssets: StoredPostSourceAsset[];
  platformVariants: StoredPostPlatformVariant[];
}

interface StoredSocialAccountForTargeting {
  id: string;
  platform: Platform;
  status: string;
}

/**
 * Structural subset of PrismaClient this route needs, mirroring the narrow
 * interface pattern used by routes/oauth.ts's OAuthStore. `socialAccount` and
 * the `post` lookup/update methods were added alongside `targetAccountIds` so
 * a draft can be created with (or later assigned) specific accounts to
 * publish to, rather than the M1 behaviour of implicitly picking "whichever
 * Facebook Page comes back first".
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
        platformVariants?: {
          create: Array<{
            socialAccountId: string;
            platform: Platform;
            captionText: string | null;
            mediaUrls: string[];
          }>;
        };
      };
      include: { sourceAssets: true; platformVariants: true };
    }): Promise<StoredPost>;
    findFirst(args: {
      where: { id: string; businessId: string };
      include: { platformVariants: true };
    }): Promise<{ id: string; platformVariants: StoredPostPlatformVariant[] } | null>;
    update(args: { where: { id: string }; data: { status: PostStatus } }): Promise<unknown>;
  };
  socialAccount: {
    findMany(args: { where: { businessId: string } }): Promise<StoredSocialAccountForTargeting[]>;
  };
  postPlatformVariant: {
    update(args: {
      where: { id: string };
      data: { variantStatus: "failed"; errorMessage: string };
    }): Promise<unknown>;
  };
}

export interface PostsRoutesOptions {
  prisma: PostStore;
  /**
   * Injectable for tests; defaults to enqueuing apps/trigger's "publish-post"
   * task (m1-09 onward) via @trigger.dev/sdk, one per targeted variant.
   * Triggering by task-id string keeps apps/api from depending on
   * apps/trigger, matching routes/webhooks-meta.ts's enqueue pattern.
   */
  enqueuePublishPost?: (postPlatformVariantId: string) => Promise<unknown>;
  /**
   * Injectable for tests; defaults to enqueuing apps/trigger's
   * "render-slides" task. Best-effort -- a failed enqueue is logged and
   * swallowed, leaving the newly created variants targeting their raw
   * pasted asset URLs (still publishable) rather than failing the draft save.
   */
  enqueueRenderSlides?: (payload: { postId: string; templateId: string; platforms: Platform[] }) => Promise<unknown>;
}

async function defaultEnqueuePublishPost(postPlatformVariantId: string): Promise<unknown> {
  return tasks.trigger("publish-post", { postPlatformVariantId });
}

async function defaultEnqueueRenderSlides(payload: {
  postId: string;
  templateId: string;
  platforms: Platform[];
}): Promise<unknown> {
  return tasks.trigger("render-slides", payload);
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
    platformVariants: post.platformVariants.map((variant) => ({
      id: variant.id,
      socialAccountId: variant.socialAccountId,
      platform: variant.platform,
      variantStatus: variant.variantStatus,
      errorMessage: variant.errorMessage,
      externalPostId: variant.externalPostId,
    })),
  };
}

const PUBLISHABLE_VARIANT_STATUSES = new Set(["pending", "failed"]);

/**
 * Registers the composer's post lifecycle: POST /posts persists a `draft`
 * post plus its `post_source_assets`, optionally creating one
 * `post_platform_variant` per requested `targetAccountIds` entry (each tied
 * to a specific social_account, not just a platform, so a business with two
 * Facebook Pages can target either one independently). POST
 * /posts/:id/publish then enqueues publish-post for whichever of those
 * variants haven't published yet -- actual Graph API calls happen in
 * apps/trigger/src/tasks/publish-post.ts.
 */
export function registerPostsRoutes(app: FastifyInstance, options: PostsRoutesOptions): void {
  const enqueuePublishPost = options.enqueuePublishPost ?? defaultEnqueuePublishPost;
  const enqueueRenderSlides = options.enqueueRenderSlides ?? defaultEnqueueRenderSlides;

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

    let platformVariants: NonNullable<Parameters<PostStore["post"]["create"]>[0]["data"]["platformVariants"]>["create"] =
      [];
    if (body.targetAccountIds && body.targetAccountIds.length > 0) {
      if (new Set(body.targetAccountIds).size !== body.targetAccountIds.length) {
        await reply.code(400).send({ error: "targetAccountIds must not contain duplicates" });
        return;
      }

      const accounts = await options.prisma.socialAccount.findMany({ where: { businessId: business.id } });
      const accountsById = new Map(accounts.map((account) => [account.id, account]));

      const targets = body.targetAccountIds.map((id) => accountsById.get(id));
      const invalid = targets.some((account) => !account || account.status !== "active");
      if (invalid) {
        await reply.code(400).send({ error: "One or more targetAccountIds are not connected active accounts" });
        return;
      }

      const mediaUrls = body.assets.map((asset) => asset.rawUrl);
      platformVariants = targets.map((account) => ({
        socialAccountId: account!.id,
        platform: account!.platform,
        captionText: body.captionMaster ?? null,
        mediaUrls,
      }));
    }

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
        ...(platformVariants.length > 0 ? { platformVariants: { create: platformVariants } } : {}),
      },
      include: { sourceAssets: true, platformVariants: true },
    });

    if (body.templateId && platformVariants.length > 0) {
      const targetPlatforms = [...new Set(platformVariants.map((variant) => variant.platform))];
      try {
        await enqueueRenderSlides({ postId: post.id, templateId: body.templateId, platforms: targetPlatforms });
      } catch (error) {
        request.log.error(error, `Failed to enqueue render-slides for post ${post.id}`);
      }
    }

    await reply.code(201).send(serializePost(post));
  });

  app.post("/posts/:id/publish", async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply);
    if (!user) return;

    const business = await resolveOwnedBusiness(options.prisma, user);
    const { id } = request.params as { id: string };

    const post = await options.prisma.post.findFirst({
      where: { id, businessId: business.id },
      include: { platformVariants: true },
    });

    if (!post) {
      await reply.code(404).send({ error: "Post not found" });
      return;
    }

    const publishableVariants = post.platformVariants.filter((variant) =>
      PUBLISHABLE_VARIANT_STATUSES.has(variant.variantStatus),
    );
    if (publishableVariants.length === 0) {
      await reply.code(400).send({
        error: "This post has no target accounts left to publish -- add a target when creating the post first.",
      });
      return;
    }

    // Enqueue every target independently (allSettled, not all) -- if the
    // trigger.dev API rejects one call, the rest should still queue rather
    // than leaving the whole post stuck at "publishing" with nothing enqueued
    // to ever roll it back out of that state.
    const enqueueOutcomes = await Promise.all(
      publishableVariants.map(async (variant) => {
        try {
          await enqueuePublishPost(variant.id);
          return { variant, queued: true } as const;
        } catch {
          return { variant, queued: false } as const;
        }
      }),
    );

    const queued: Array<{ variantId: string; platform: Platform }> = [];
    const failedToQueue: StoredPostPlatformVariant[] = [];
    for (const outcome of enqueueOutcomes) {
      if (outcome.queued) {
        queued.push({ variantId: outcome.variant.id, platform: outcome.variant.platform });
      } else {
        failedToQueue.push(outcome.variant);
      }
    }

    if (failedToQueue.length > 0) {
      await Promise.all(
        failedToQueue.map((variant) =>
          options.prisma.postPlatformVariant.update({
            where: { id: variant.id },
            data: { variantStatus: "failed", errorMessage: "Failed to queue for publishing. Try again." },
          }),
        ),
      );
    }

    // If at least one variant queued, the post stays "publishing" -- that
    // task (and any siblings still in flight) will roll the post up to its
    // final status once every variant reaches a terminal state. Otherwise
    // nothing will ever run to unstick it, so resolve the final status here
    // from the variants' now-known outcomes.
    let postStatus: PostStatus;
    if (queued.length > 0) {
      postStatus = "publishing";
    } else {
      const failedIds = new Set(failedToQueue.map((variant) => variant.id));
      const finalStatuses = post.platformVariants.map((variant) =>
        failedIds.has(variant.id) ? "failed" : variant.variantStatus,
      );
      if (finalStatuses.every((status) => status === "published")) {
        postStatus = "published";
      } else if (finalStatuses.every((status) => status === "failed")) {
        postStatus = "failed";
      } else {
        postStatus = "partial";
      }
    }

    await options.prisma.post.update({ where: { id: post.id }, data: { status: postStatus } });

    if (queued.length === 0) {
      await reply.code(502).send({
        error: "Failed to queue any target for publishing. Try again.",
        postId: post.id,
        status: postStatus,
      });
      return;
    }

    await reply.code(202).send({ postId: post.id, status: "publishing", queued });
  });
}
