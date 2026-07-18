import { prisma } from "@postauto/db";
import {
  CarouselCoverSlide,
  CarouselDetailSlide,
  LocalFilesystemStorage,
  PriceHighlightSlide,
  SingleProductSlide,
  listPlatformDimensions,
  loadDefaultFonts,
  renderSlide,
  type ObjectStorage,
  type Platform as RenderPlatform,
  type RenderedSlide as RenderResult,
  type SatoriFont,
  type SatoriTree,
  type SlideBusiness,
} from "@postauto/render";
import type { Platform as DbPlatform } from "@postauto/shared";
import { task } from "@trigger.dev/sdk/v3";

export type SlideTemplateId = "single-product" | "price-highlight" | "carousel";

/** The concrete satori template used for a given rendered_slides row. */
export type SlideComponentId =
  | "single-product-slide"
  | "price-highlight-slide"
  | "carousel-cover-slide"
  | "carousel-detail-slide";

export interface RenderSlidesPayload {
  postId: string;
  templateId: SlideTemplateId;
  /** Defaults to all three platforms (facebook_page/instagram_business/threads) when omitted. */
  platforms?: DbPlatform[];
}

const DEFAULT_PLATFORMS: DbPlatform[] = ["facebook_page", "instagram_business", "threads"];

const DB_TO_RENDER_PLATFORM: Record<DbPlatform, RenderPlatform> = {
  facebook_page: "facebook",
  instagram_business: "instagram",
  threads: "threads",
};

const DEFAULT_PRIMARY_COLOR = "#111827";

export interface RenderSlidesSourceAsset {
  id: string;
  rawUrl: string;
  productName: string | null;
  price: number | null;
  description: string | null;
  orderIndex: number;
}

export interface RenderSlidesPost {
  id: string;
  captionMaster: string | null;
  business: {
    name: string;
    brandColors: unknown;
    logoAssetUrl: string | null;
  };
  sourceAssets: RenderSlidesSourceAsset[];
}

/** One row this task produces, shaped for the future `rendered_slides` table (see m2-08). */
export interface RenderedSlideRow {
  postId: string;
  slideIndex: number;
  templateId: SlideComponentId;
  platform: DbPlatform;
  width: number;
  height: number;
  fileUrl: string;
}

/**
 * Structural subset of what this task needs to load a post and persist
 * rendered_slides rows, mirroring the narrow-interface pattern used by
 * apps/trigger's publish-post.ts (PublishPostStore) and apps/api's routes.
 * `renderedSlide` intentionally isn't typed against `@postauto/db`'s Prisma
 * client: the `rendered_slides` table/model doesn't exist yet (that's
 * m2-08's migration, not a dependency of this task per prd.json) so there is
 * no real delegate to mirror yet.
 */
export interface RenderSlidesStore {
  post: {
    findUnique(args: {
      where: { id: string };
      include: { business: true; sourceAssets: true };
    }): Promise<RenderSlidesPost | null>;
  };
  renderedSlide: {
    createMany(args: { data: RenderedSlideRow[] }): Promise<unknown>;
  };
}

export interface RenderSlidesDeps {
  store: RenderSlidesStore;
  storage: ObjectStorage;
  fonts: SatoriFont[];
  /** Injectable for tests; defaults to packages/render's renderSlide. */
  render: (params: {
    tree: SatoriTree;
    dimensions: { width: number; height: number };
    fonts: SatoriFont[];
    storage: ObjectStorage;
    key: string;
  }) => Promise<RenderResult>;
}

function resolvePrimaryColor(brandColors: unknown): string {
  if (
    brandColors &&
    typeof brandColors === "object" &&
    "primary" in brandColors &&
    typeof (brandColors as { primary?: unknown }).primary === "string"
  ) {
    return (brandColors as { primary: string }).primary;
  }
  return DEFAULT_PRIMARY_COLOR;
}

function formatPrice(price: number | null): string | undefined {
  if (price === null || !Number.isFinite(price)) {
    return undefined;
  }
  return `ETB ${price.toLocaleString("en-US")}`;
}

interface Slide {
  slideIndex: number;
  componentId: SlideComponentId;
  tree: SatoriTree;
}

/**
 * Builds the ordered list of satori trees for a template choice, one per
 * source asset for "carousel" and one (from the first source asset) for the
 * single-slide templates. Pure and rendering-free so it's trivial to test on
 * its own in addition to through runRenderSlides.
 */
export function buildSlides(
  templateId: SlideTemplateId,
  post: RenderSlidesPost,
  sourceAssets: RenderSlidesSourceAsset[],
  business: SlideBusiness,
): Slide[] {
  switch (templateId) {
    case "single-product": {
      const asset = sourceAssets[0]!;
      return [
        {
          slideIndex: 0,
          componentId: "single-product-slide",
          tree: SingleProductSlide({
            imageUrl: asset.rawUrl,
            productName: asset.productName ?? post.captionMaster ?? "Product",
            price: formatPrice(asset.price),
            business,
          }),
        },
      ];
    }
    case "price-highlight": {
      const asset = sourceAssets[0]!;
      const price = formatPrice(asset.price);
      if (!price) {
        throw new Error("price-highlight template requires the first source asset to have a price.");
      }
      return [
        {
          slideIndex: 0,
          componentId: "price-highlight-slide",
          tree: PriceHighlightSlide({
            price,
            productName: asset.productName ?? post.captionMaster ?? "Product",
            imageUrl: asset.rawUrl,
            business,
          }),
        },
      ];
    }
    case "carousel": {
      return sourceAssets.map((asset, index) =>
        index === 0
          ? {
              slideIndex: 0,
              componentId: "carousel-cover-slide" as const,
              tree: CarouselCoverSlide({
                imageUrl: asset.rawUrl,
                title: post.captionMaster ?? asset.productName ?? "New arrivals",
                slideCount: sourceAssets.length,
                business,
              }),
            }
          : {
              slideIndex: index,
              componentId: "carousel-detail-slide" as const,
              tree: CarouselDetailSlide({
                imageUrl: asset.rawUrl,
                slideIndex: index + 1,
                slideCount: sourceAssets.length,
                business,
                caption: asset.description ?? asset.productName ?? undefined,
              }),
            },
      );
    }
  }
}

/**
 * Pure orchestration for render-slides: loads the post + its source assets,
 * builds the template tree(s) for the chosen template, then re-renders each
 * tree at every target platform+aspect-ratio dimension (PLAN.md's "Carousel/
 * slide rendering" section -- re-rendering per dimension keeps output crisp
 * instead of cropping one raster), uploads each PNG through the injected
 * ObjectStorage, and persists the resulting rendered_slides rows.
 */
export async function runRenderSlides(
  deps: RenderSlidesDeps,
  payload: RenderSlidesPayload,
): Promise<RenderedSlideRow[]> {
  const post = await deps.store.post.findUnique({
    where: { id: payload.postId },
    include: { business: true, sourceAssets: true },
  });
  if (!post) {
    throw new Error(`Post ${payload.postId} not found`);
  }

  const sourceAssets = [...post.sourceAssets].sort((a, b) => a.orderIndex - b.orderIndex);
  if (sourceAssets.length === 0) {
    throw new Error(`Post ${payload.postId} has no source assets to render slides from.`);
  }

  const business: SlideBusiness = {
    name: post.business.name,
    primaryColor: resolvePrimaryColor(post.business.brandColors),
    ...(post.business.logoAssetUrl ? { logoUrl: post.business.logoAssetUrl } : {}),
  };

  const slides = buildSlides(payload.templateId, post, sourceAssets, business);
  const platforms = payload.platforms ?? DEFAULT_PLATFORMS;

  const rows: RenderedSlideRow[] = [];
  for (const slide of slides) {
    for (const platform of platforms) {
      const renderPlatform = DB_TO_RENDER_PLATFORM[platform];
      for (const dimension of listPlatformDimensions(renderPlatform)) {
        const key = `posts/${post.id}/slides/${slide.slideIndex}/${platform}-${dimension.aspectRatio}.png`;
        const rendered = await deps.render({
          tree: slide.tree,
          dimensions: { width: dimension.width, height: dimension.height },
          fonts: deps.fonts,
          storage: deps.storage,
          key,
        });
        rows.push({
          postId: post.id,
          slideIndex: slide.slideIndex,
          templateId: slide.componentId,
          platform,
          width: rendered.width,
          height: rendered.height,
          fileUrl: rendered.url,
        });
      }
    }
  }

  await deps.store.renderedSlide.createMany({ data: rows });

  return rows;
}

/**
 * `rendered_slides` doesn't have a Prisma model yet -- that's m2-08's
 * migration, and it isn't a dependency of this task per prd.json. This
 * default throws loudly instead of silently doing nothing, so a real run
 * fails fast with a clear pointer rather than looking like it succeeded.
 * Swap it for a real `prisma.renderedSlide`-backed implementation once
 * m2-08 lands.
 */
const notYetPersistedRenderedSlideStore: RenderSlidesStore["renderedSlide"] = {
  createMany() {
    return Promise.reject(
      new Error(
        "rendered_slides persistence isn't wired yet: the RenderedSlide Prisma model doesn't exist until " +
          "m2-08's migration lands. See progress.txt (m2-06) for details.",
      ),
    );
  },
};

const prismaPostStore: RenderSlidesStore["post"] = {
  async findUnique(args) {
    const post = await prisma.post.findUnique({
      where: args.where,
      include: { business: true, sourceAssets: true },
    });
    if (!post) {
      return null;
    }
    return {
      id: post.id,
      captionMaster: post.captionMaster,
      business: {
        name: post.business.name,
        brandColors: post.business.brandColors,
        logoAssetUrl: post.business.logoAssetUrl,
      },
      sourceAssets: post.sourceAssets.map((asset) => ({
        id: asset.id,
        rawUrl: asset.rawUrl,
        productName: asset.productName,
        price: asset.price === null ? null : Number(asset.price),
        description: asset.description,
        orderIndex: asset.orderIndex,
      })),
    };
  },
};

export const renderSlidesTask = task({
  id: "render-slides",
  run: async (payload: RenderSlidesPayload) => {
    const fonts = await loadDefaultFonts();
    const storage = new LocalFilesystemStorage({
      baseDir: process.env.RENDER_STORAGE_DIR ?? "/tmp/postauto-render",
    });

    return runRenderSlides(
      {
        store: { post: prismaPostStore, renderedSlide: notYetPersistedRenderedSlideStore },
        storage,
        fonts,
        render: renderSlide,
      },
      payload,
    );
  },
});
