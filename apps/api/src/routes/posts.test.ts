import { GraphClient } from "@postauto/social";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "../test-utils/fixture-prisma.js";

const FIXTURE_JWT_SECRET = "fixture-jwt-secret-for-posts-tests";
const FIXTURE_BASE_URL = "https://api.fixture.test";

async function buildFixtureApp(
  prismaOverrides: Parameters<typeof createFixturePrismaStore>[0] = {},
  enqueuePublishPost?: (postPlatformVariantId: string) => Promise<unknown>,
) {
  const prisma = createFixturePrismaStore(prismaOverrides);
  const app = await buildApp({
    prisma,
    telegramBotToken: "fixture-bot-token",
    jwtSecret: FIXTURE_JWT_SECRET,
    metaAppId: "meta-app-id",
    metaAppSecret: "meta-app-secret",
    metaWebhookVerifyToken: "meta-webhook-verify-token",
    tokenEncryptionKey: FIXTURE_TOKEN_ENCRYPTION_KEY,
    baseUrl: FIXTURE_BASE_URL,
    graphClient: new GraphClient({ baseUrl: "https://graph.test" }),
    enqueuePublishPost,
  });

  return { app, prisma };
}

async function signJwt(app: FastifyInstance, payload: { sub: string; telegramUserId: string }): Promise<string> {
  return app.jwt.sign(payload, { expiresIn: "1h" });
}

describe("POST /posts", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without a valid bearer token", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({
      method: "POST",
      url: "/posts",
      payload: { assets: [{ rawUrl: "https://cdn.test/photo.jpg" }] },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 400 when no assets are provided", async () => {
    ({ app } = await buildFixtureApp());
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: { captionMaster: "Fresh tomatoes!", assets: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when an asset has an invalid rawUrl", async () => {
    ({ app } = await buildFixtureApp());
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: { assets: [{ rawUrl: "not-a-url" }] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("resolves/creates the owner's business and creates a draft post with its source assets", async () => {
    const businessCreate = vi.fn().mockResolvedValue({ id: "biz_1" });
    const businessFindFirst = vi.fn().mockResolvedValue(null);
    const businessMemberUpsert = vi.fn().mockResolvedValue(undefined);
    const createdAt = new Date("2026-07-18T12:00:00.000Z");
    const postCreate = vi.fn().mockResolvedValue({
      id: "post_1",
      businessId: "biz_1",
      status: "draft",
      captionMaster: "Fresh tomatoes, 50 ETB/kg",
      createdAt,
      sourceAssets: [
        {
          id: "asset_1",
          rawUrl: "https://cdn.test/tomatoes.jpg",
          productName: "Tomatoes",
          price: "50",
          description: null,
          orderIndex: 0,
        },
        {
          id: "asset_2",
          rawUrl: "https://cdn.test/tomatoes-2.jpg",
          productName: null,
          price: null,
          description: null,
          orderIndex: 1,
        },
      ],
      platformVariants: [],
    });

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: businessCreate },
      businessMember: { upsert: businessMemberUpsert },
      post: { create: postCreate },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        captionMaster: "Fresh tomatoes, 50 ETB/kg",
        assets: [
          { rawUrl: "https://cdn.test/tomatoes.jpg", productName: "Tomatoes", price: 50 },
          { rawUrl: "https://cdn.test/tomatoes-2.jpg" },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(businessFindFirst).toHaveBeenCalledWith({ where: { telegramOwnerUserId: 42n } });
    expect(businessCreate).toHaveBeenCalledTimes(1);
    expect(businessMemberUpsert).toHaveBeenCalledWith({
      where: { businessId_userId: { businessId: "biz_1", userId: "user_1" } },
      update: {},
      create: { businessId: "biz_1", userId: "user_1", role: "owner" },
    });

    expect(postCreate).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        status: "draft",
        captionMaster: "Fresh tomatoes, 50 ETB/kg",
        sourceAssets: {
          create: [
            {
              rawUrl: "https://cdn.test/tomatoes.jpg",
              productName: "Tomatoes",
              price: 50,
              description: null,
              orderIndex: 0,
            },
            {
              rawUrl: "https://cdn.test/tomatoes-2.jpg",
              productName: null,
              price: null,
              description: null,
              orderIndex: 1,
            },
          ],
        },
      },
      include: { sourceAssets: true, platformVariants: true },
    });

    const body = response.json();
    expect(body).toEqual({
      id: "post_1",
      businessId: "biz_1",
      status: "draft",
      captionMaster: "Fresh tomatoes, 50 ETB/kg",
      createdAt: createdAt.toISOString(),
      sourceAssets: [
        {
          id: "asset_1",
          rawUrl: "https://cdn.test/tomatoes.jpg",
          productName: "Tomatoes",
          price: 50,
          description: null,
          orderIndex: 0,
        },
        {
          id: "asset_2",
          rawUrl: "https://cdn.test/tomatoes-2.jpg",
          productName: null,
          price: null,
          description: null,
          orderIndex: 1,
        },
      ],
      platformVariants: [],
    });
  });

  it("creates a post_platform_variant per targetAccountId, scoped to that specific social account", async () => {
    const socialAccountFindMany = vi.fn().mockResolvedValue([
      { id: "account_fb_1", platform: "facebook_page", status: "active" },
      { id: "account_fb_2", platform: "facebook_page", status: "active" },
      { id: "account_ig_1", platform: "instagram_business", status: "active" },
    ]);
    const postCreate = vi.fn().mockResolvedValue({
      id: "post_3",
      businessId: "biz_1",
      status: "draft",
      captionMaster: "New arrivals!",
      createdAt: new Date("2026-07-25T09:00:00.000Z"),
      sourceAssets: [
        { id: "asset_4", rawUrl: "https://cdn.test/x.jpg", productName: null, price: null, description: null, orderIndex: 0 },
      ],
      platformVariants: [
        { id: "variant_1", socialAccountId: "account_fb_1", platform: "facebook_page", variantStatus: "pending", errorMessage: null, externalPostId: null },
        { id: "variant_2", socialAccountId: "account_ig_1", platform: "instagram_business", variantStatus: "pending", errorMessage: null, externalPostId: null },
      ],
    });

    ({ app } = await buildFixtureApp({
      business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
      socialAccount: { findMany: socialAccountFindMany },
      post: { create: postCreate },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        captionMaster: "New arrivals!",
        assets: [{ rawUrl: "https://cdn.test/x.jpg" }],
        targetAccountIds: ["account_fb_1", "account_ig_1"],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(postCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platformVariants: {
          create: [
            { socialAccountId: "account_fb_1", platform: "facebook_page", captionText: "New arrivals!", mediaUrls: ["https://cdn.test/x.jpg"] },
            { socialAccountId: "account_ig_1", platform: "instagram_business", captionText: "New arrivals!", mediaUrls: ["https://cdn.test/x.jpg"] },
          ],
        },
      }),
      include: { sourceAssets: true, platformVariants: true },
    });
    expect(response.json().platformVariants).toEqual([
      { id: "variant_1", socialAccountId: "account_fb_1", platform: "facebook_page", variantStatus: "pending", errorMessage: null, externalPostId: null },
      { id: "variant_2", socialAccountId: "account_ig_1", platform: "instagram_business", variantStatus: "pending", errorMessage: null, externalPostId: null },
    ]);
  });

  it("rejects targetAccountIds that aren't active accounts on the caller's business", async () => {
    ({ app } = await buildFixtureApp({
      business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
      socialAccount: { findMany: vi.fn().mockResolvedValue([{ id: "account_1", platform: "facebook_page", status: "revoked" }]) },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: { assets: [{ rawUrl: "https://cdn.test/x.jpg" }], targetAccountIds: ["account_1"] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects duplicate targetAccountIds instead of hitting the unique constraint on create", async () => {
    ({ app } = await buildFixtureApp({
      business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
      socialAccount: {
        findMany: vi.fn().mockResolvedValue([{ id: "account_fb_1", platform: "facebook_page", status: "active" }]),
      },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        assets: [{ rawUrl: "https://cdn.test/x.jpg" }],
        targetAccountIds: ["account_fb_1", "account_fb_1"],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a targetAccountId that doesn't belong to the caller's business", async () => {
    ({ app } = await buildFixtureApp({
      business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
      socialAccount: { findMany: vi.fn().mockResolvedValue([]) },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: { assets: [{ rawUrl: "https://cdn.test/x.jpg" }], targetAccountIds: ["account_missing"] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("reuses an existing business rather than creating a new one", async () => {
    const businessCreate = vi.fn();
    const businessFindFirst = vi.fn().mockResolvedValue({ id: "biz_existing" });
    const postCreate = vi.fn().mockResolvedValue({
      id: "post_2",
      businessId: "biz_existing",
      status: "draft",
      captionMaster: null,
      createdAt: new Date(),
      sourceAssets: [
        {
          id: "asset_3",
          rawUrl: "https://cdn.test/injera.jpg",
          productName: null,
          price: null,
          description: null,
          orderIndex: 0,
        },
      ],
      platformVariants: [],
    });

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: businessCreate },
      post: { create: postCreate },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts",
      headers: { authorization: `Bearer ${token}` },
      payload: { assets: [{ rawUrl: "https://cdn.test/injera.jpg" }] },
    });

    expect(response.statusCode).toBe(201);
    expect(businessCreate).not.toHaveBeenCalled();
    expect(postCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessId: "biz_existing" }) }),
    );
  });
});

describe("POST /posts/:id/publish", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without a valid bearer token", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({ method: "POST", url: "/posts/post_1/publish" });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 when the post doesn't belong to the caller's business", async () => {
    ({ app } = await buildFixtureApp({
      business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
      post: { findFirst: vi.fn().mockResolvedValue(null) },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts/post_missing/publish",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 400 when the post has no pending or failed variants left to publish", async () => {
    ({ app } = await buildFixtureApp({
      business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
      post: {
        findFirst: vi.fn().mockResolvedValue({
          id: "post_1",
          platformVariants: [{ id: "variant_1", variantStatus: "published" }],
        }),
      },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts/post_1/publish",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
  });

  it("marks the post publishing and enqueues publish-post for each pending/failed variant", async () => {
    const postUpdate = vi.fn().mockResolvedValue(undefined);
    const enqueuePublishPost = vi.fn().mockResolvedValue(undefined);

    ({ app } = await buildFixtureApp(
      {
        business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
        post: {
          findFirst: vi.fn().mockResolvedValue({
            id: "post_1",
            platformVariants: [
              { id: "variant_1", platform: "facebook_page", variantStatus: "pending" },
              { id: "variant_2", platform: "instagram_business", variantStatus: "failed" },
              { id: "variant_3", platform: "threads", variantStatus: "published" },
            ],
          }),
          update: postUpdate,
        },
      },
      enqueuePublishPost,
    ));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts/post_1/publish",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(202);
    expect(postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { status: "publishing" } });
    expect(enqueuePublishPost).toHaveBeenCalledWith("variant_1");
    expect(enqueuePublishPost).toHaveBeenCalledWith("variant_2");
    expect(enqueuePublishPost).not.toHaveBeenCalledWith("variant_3");
    expect(enqueuePublishPost).toHaveBeenCalledTimes(2);
    expect(response.json()).toEqual({
      postId: "post_1",
      status: "publishing",
      queued: [
        { variantId: "variant_1", platform: "facebook_page" },
        { variantId: "variant_2", platform: "instagram_business" },
      ],
    });
  });

  it("marks only the variants whose enqueue call failed, keeps the post publishing when others queued", async () => {
    const postUpdate = vi.fn().mockResolvedValue(undefined);
    const variantUpdate = vi.fn().mockResolvedValue(undefined);
    const enqueuePublishPost = vi
      .fn()
      .mockImplementation((variantId: string) =>
        variantId === "variant_2" ? Promise.reject(new Error("trigger.dev unavailable")) : Promise.resolve(undefined),
      );

    ({ app } = await buildFixtureApp(
      {
        business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
        post: {
          findFirst: vi.fn().mockResolvedValue({
            id: "post_1",
            platformVariants: [
              { id: "variant_1", platform: "facebook_page", variantStatus: "pending" },
              { id: "variant_2", platform: "instagram_business", variantStatus: "pending" },
            ],
          }),
          update: postUpdate,
        },
        postPlatformVariant: { update: variantUpdate },
      },
      enqueuePublishPost,
    ));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts/post_1/publish",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(202);
    expect(variantUpdate).toHaveBeenCalledWith({
      where: { id: "variant_2" },
      data: { variantStatus: "failed", errorMessage: "Failed to queue for publishing. Try again." },
    });
    expect(postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { status: "publishing" } });
    expect(response.json()).toEqual({
      postId: "post_1",
      status: "publishing",
      queued: [{ variantId: "variant_1", platform: "facebook_page" }],
    });
  });

  it("resolves the post's final status itself when every enqueue call fails, instead of leaving it stuck publishing", async () => {
    const postUpdate = vi.fn().mockResolvedValue(undefined);
    const variantUpdate = vi.fn().mockResolvedValue(undefined);
    const enqueuePublishPost = vi.fn().mockRejectedValue(new Error("trigger.dev unavailable"));

    ({ app } = await buildFixtureApp(
      {
        business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
        post: {
          findFirst: vi.fn().mockResolvedValue({
            id: "post_1",
            platformVariants: [
              { id: "variant_1", platform: "facebook_page", variantStatus: "pending" },
              { id: "variant_2", platform: "instagram_business", variantStatus: "published" },
            ],
          }),
          update: postUpdate,
        },
        postPlatformVariant: { update: variantUpdate },
      },
      enqueuePublishPost,
    ));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/posts/post_1/publish",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(502);
    expect(variantUpdate).toHaveBeenCalledWith({
      where: { id: "variant_1" },
      data: { variantStatus: "failed", errorMessage: "Failed to queue for publishing. Try again." },
    });
    // variant_2 was already "published" and wasn't a publish target this round -- untouched.
    expect(variantUpdate).toHaveBeenCalledTimes(1);
    expect(postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { status: "partial" } });
    expect(response.json()).toEqual({
      postId: "post_1",
      status: "partial",
      error: "Failed to queue any target for publishing. Try again.",
    });
  });
});
