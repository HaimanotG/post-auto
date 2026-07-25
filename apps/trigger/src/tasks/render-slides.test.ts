import { describe, expect, it, vi } from "vitest";
import {
  buildSlides,
  runRenderSlides,
  type RenderSlidesDeps,
  type RenderSlidesPost,
  type RenderSlidesSourceAsset,
} from "./render-slides.js";

function buildPost(overrides: Partial<RenderSlidesPost> = {}): RenderSlidesPost {
  return {
    id: "post_1",
    captionMaster: "New arrivals this week",
    business: {
      name: "Selam Boutique",
      brandColors: { primary: "#d1495b" },
      logoAssetUrl: "https://cdn.test/logo.png",
    },
    sourceAssets: [
      { id: "asset_1", rawUrl: "https://cdn.test/1.jpg", productName: "Scarf", price: 850, description: null, orderIndex: 0 },
    ],
    ...overrides,
  };
}

function buildDeps(overrides: Partial<{ post: RenderSlidesPost | null }> = {}): {
  deps: RenderSlidesDeps;
  findUnique: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  updateManyVariants: ReturnType<typeof vi.fn>;
} {
  const post = "post" in overrides ? overrides.post : buildPost();
  const findUnique = vi.fn().mockResolvedValue(post);
  const createMany = vi.fn().mockResolvedValue(undefined);
  const updateManyVariants = vi.fn().mockResolvedValue(undefined);
  let renderCallIndex = 0;

  const deps: RenderSlidesDeps = {
    store: {
      post: { findUnique },
      renderedSlide: { createMany },
      postPlatformVariant: { updateMany: updateManyVariants },
    },
    storage: { upload: vi.fn() },
    fonts: [],
    render: vi.fn(async (params) => {
      renderCallIndex += 1;
      return {
        key: params.key,
        url: `https://cdn.test/rendered/${renderCallIndex}.png`,
        width: params.dimensions.width,
        height: params.dimensions.height,
      };
    }),
  };

  return { deps, findUnique, createMany, updateManyVariants };
}

describe("buildSlides", () => {
  const business = { name: "Selam Boutique", primaryColor: "#d1495b" };

  it("single-product: one slide from the first source asset, price formatted", () => {
    const post = buildPost();
    const slides = buildSlides("single-product", post, post.sourceAssets, business);

    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({ slideIndex: 0, componentId: "single-product-slide" });
  });

  it("price-highlight: throws when the first source asset has no price", () => {
    const post = buildPost({
      sourceAssets: [{ id: "a", rawUrl: "https://cdn.test/1.jpg", productName: "Scarf", price: null, description: null, orderIndex: 0 }],
    });

    expect(() => buildSlides("price-highlight", post, post.sourceAssets, business)).toThrow(
      "price-highlight template requires the first source asset to have a price.",
    );
  });

  it("carousel: first asset becomes the cover slide, the rest become detail slides in order", () => {
    const sourceAssets: RenderSlidesSourceAsset[] = [
      { id: "a", rawUrl: "https://cdn.test/1.jpg", productName: "Scarf", price: 850, description: null, orderIndex: 0 },
      { id: "b", rawUrl: "https://cdn.test/2.jpg", productName: "Shawl", price: 950, description: "Available in blue", orderIndex: 1 },
      { id: "c", rawUrl: "https://cdn.test/3.jpg", productName: "Wrap", price: 700, description: null, orderIndex: 2 },
    ];
    const post = buildPost({ sourceAssets });

    const slides = buildSlides("carousel", post, sourceAssets, business);

    expect(slides.map((s) => ({ slideIndex: s.slideIndex, componentId: s.componentId }))).toEqual([
      { slideIndex: 0, componentId: "carousel-cover-slide" },
      { slideIndex: 1, componentId: "carousel-detail-slide" },
      { slideIndex: 2, componentId: "carousel-detail-slide" },
    ]);
  });
});

describe("runRenderSlides", () => {
  it("renders the single-product template at every platform's every dimension and persists one row per render", async () => {
    const { deps, createMany } = buildDeps();

    const rows = await runRenderSlides(deps, { postId: "post_1", templateId: "single-product" });

    // 3 platforms (facebook_page, instagram_business, threads) x 2 dimensions each = 6.
    expect(deps.render).toHaveBeenCalledTimes(6);
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.postId === "post_1" && row.templateId === "single-product-slide")).toBe(true);
    expect(rows.map((row) => row.platform).sort()).toEqual(
      ["facebook_page", "facebook_page", "instagram_business", "instagram_business", "threads", "threads"].sort(),
    );
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({ data: rows });
  });

  it("restricts rendering to the requested platforms only", async () => {
    const { deps } = buildDeps();

    const rows = await runRenderSlides(deps, {
      postId: "post_1",
      templateId: "single-product",
      platforms: ["facebook_page"],
    });

    expect(deps.render).toHaveBeenCalledTimes(2); // facebook_page's landscape + square
    expect(rows.every((row) => row.platform === "facebook_page")).toBe(true);
  });

  it("renders one slide per source asset for the carousel template, across all platforms/dimensions", async () => {
    const post = buildPost({
      sourceAssets: [
        { id: "a", rawUrl: "https://cdn.test/1.jpg", productName: "Scarf", price: 850, description: null, orderIndex: 0 },
        { id: "b", rawUrl: "https://cdn.test/2.jpg", productName: "Shawl", price: 950, description: null, orderIndex: 1 },
      ],
    });
    const { deps } = buildDeps({ post });

    const rows = await runRenderSlides(deps, { postId: "post_1", templateId: "carousel", platforms: ["threads"] });

    // 2 slides x 1 platform x 2 dimensions (threads portrait + square) = 4.
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.slideIndex === 0).every((r) => r.templateId === "carousel-cover-slide")).toBe(true);
    expect(rows.filter((r) => r.slideIndex === 1).every((r) => r.templateId === "carousel-detail-slide")).toBe(true);
  });

  it("sorts source assets by orderIndex before building slides, regardless of array order", async () => {
    const post = buildPost({
      sourceAssets: [
        { id: "b", rawUrl: "https://cdn.test/2.jpg", productName: "Shawl", price: 950, description: null, orderIndex: 1 },
        { id: "a", rawUrl: "https://cdn.test/1.jpg", productName: "Scarf", price: 850, description: null, orderIndex: 0 },
      ],
    });
    const { deps } = buildDeps({ post });

    const rows = await runRenderSlides(deps, { postId: "post_1", templateId: "carousel", platforms: ["threads"] });

    const coverRow = rows.find((r) => r.templateId === "carousel-cover-slide");
    expect(coverRow?.slideIndex).toBe(0);
  });

  it("throws when the post does not exist, without rendering or persisting anything", async () => {
    const { deps, createMany } = buildDeps({ post: null });

    await expect(runRenderSlides(deps, { postId: "missing", templateId: "single-product" })).rejects.toThrow(
      "Post missing not found",
    );
    expect(deps.render).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("throws when the post has no source assets", async () => {
    const { deps } = buildDeps({ post: buildPost({ sourceAssets: [] }) });

    await expect(runRenderSlides(deps, { postId: "post_1", templateId: "single-product" })).rejects.toThrow(
      "Post post_1 has no source assets to render slides from.",
    );
  });

  it("passes the business's brandColors.primary through to the tree handed to render()", async () => {
    const { deps } = buildDeps();

    await runRenderSlides(deps, { postId: "post_1", templateId: "single-product", platforms: ["facebook_page"] });

    const renderMock = deps.render as ReturnType<typeof vi.fn>;
    const treePassedToRender = renderMock.mock.calls[0]?.[0].tree;
    expect(JSON.stringify(treePassedToRender)).toContain("#d1495b");
  });

  it("updates each platform's pending variants with the rendered slide urls at that platform's primary dimension", async () => {
    const { deps, updateManyVariants } = buildDeps();

    const rows = await runRenderSlides(deps, { postId: "post_1", templateId: "single-product" });

    expect(updateManyVariants).toHaveBeenCalledTimes(3);
    for (const platform of ["facebook_page", "instagram_business", "threads"] as const) {
      // facebook_page's primary dimension is landscape (1200x628, first in listPlatformDimensions);
      // instagram_business/threads' is portrait (1080x1350) -- see platform-dimensions.ts.
      const primaryWidth = platform === "facebook_page" ? 1200 : 1080;
      const primaryHeight = platform === "facebook_page" ? 628 : 1350;
      const expectedUrl = rows.find(
        (row) => row.platform === platform && row.width === primaryWidth && row.height === primaryHeight,
      )!.fileUrl;
      expect(updateManyVariants).toHaveBeenCalledWith({
        where: { postId: "post_1", platform, variantStatus: "pending" },
        data: { mediaUrls: [expectedUrl] },
      });
    }
  });

  it("orders a carousel's mediaUrls by slideIndex (cover first, then details)", async () => {
    const post = buildPost({
      sourceAssets: [
        { id: "a", rawUrl: "https://cdn.test/1.jpg", productName: "Scarf", price: 850, description: null, orderIndex: 0 },
        { id: "b", rawUrl: "https://cdn.test/2.jpg", productName: "Shawl", price: 950, description: null, orderIndex: 1 },
      ],
    });
    const { deps, updateManyVariants } = buildDeps({ post });

    const rows = await runRenderSlides(deps, { postId: "post_1", templateId: "carousel", platforms: ["threads"] });

    const coverUrl = rows.find((row) => row.slideIndex === 0 && row.width === 1080 && row.height === 1350)!.fileUrl;
    const detailUrl = rows.find((row) => row.slideIndex === 1 && row.width === 1080 && row.height === 1350)!.fileUrl;
    expect(updateManyVariants).toHaveBeenCalledWith({
      where: { postId: "post_1", platform: "threads", variantStatus: "pending" },
      data: { mediaUrls: [coverUrl, detailUrl] },
    });
  });

  it("does not touch post_platform_variants for platforms that weren't rendered", async () => {
    const { deps, updateManyVariants } = buildDeps();

    await runRenderSlides(deps, { postId: "post_1", templateId: "single-product", platforms: ["facebook_page"] });

    expect(updateManyVariants).toHaveBeenCalledTimes(1);
    expect(updateManyVariants).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ platform: "facebook_page" }) }),
    );
  });

  it("falls back to a default primary color when brandColors is missing or malformed", async () => {
    const { deps } = buildDeps({
      post: buildPost({ business: { name: "Selam Boutique", brandColors: null, logoAssetUrl: null } }),
    });

    await runRenderSlides(deps, { postId: "post_1", templateId: "single-product", platforms: ["facebook_page"] });

    const renderMock = deps.render as ReturnType<typeof vi.fn>;
    const treePassedToRender = renderMock.mock.calls[0]?.[0].tree;
    expect(JSON.stringify(treePassedToRender)).toContain("#111827");
  });
});
