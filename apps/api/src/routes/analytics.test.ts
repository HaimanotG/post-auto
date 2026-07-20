import { GraphClient } from "@postauto/social";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "../test-utils/fixture-prisma.js";

const FIXTURE_JWT_SECRET = "fixture-jwt-secret-for-analytics-tests";
const FIXTURE_BASE_URL = "https://api.fixture.test";

async function buildFixtureApp(prismaOverrides: Parameters<typeof createFixturePrismaStore>[0] = {}) {
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
  });

  return { app, prisma };
}

async function signJwt(app: FastifyInstance, payload: { sub: string; telegramUserId: string }): Promise<string> {
  return app.jwt.sign(payload, { expiresIn: "1h" });
}

describe("GET /analytics", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without a valid bearer token", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({ method: "GET", url: "/analytics" });

    expect(response.statusCode).toBe(401);
  });

  it("resolves the owner's business and aggregates seeded engagement_snapshots fixture data", async () => {
    const businessFindFirst = vi.fn().mockResolvedValue({ id: "biz_1" });
    const capturedAtFb = new Date("2026-07-19T09:00:00.000Z");
    const capturedAtIg = new Date("2026-07-19T09:05:00.000Z");
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "variant_fb",
        platform: "facebook_page",
        variantStatus: "published",
        externalPermalink: "https://facebook.com/p/1",
        post: { id: "post_1", captionMaster: "Fresh tomatoes, 50 ETB/kg" },
        engagementSnapshots: [
          {
            capturedAt: capturedAtFb,
            likesCount: 10,
            commentsCount: 2,
            sharesCount: 1,
            reach: 100,
            impressions: 150,
          },
        ],
      },
      {
        id: "variant_ig",
        platform: "instagram_business",
        variantStatus: "published",
        externalPermalink: "https://instagram.com/p/1",
        post: { id: "post_1", captionMaster: "Fresh tomatoes, 50 ETB/kg" },
        engagementSnapshots: [
          {
            capturedAt: capturedAtIg,
            likesCount: 25,
            commentsCount: 5,
            sharesCount: 0,
            reach: 300,
            impressions: 400,
          },
        ],
      },
      {
        id: "variant_threads_pending",
        platform: "threads",
        variantStatus: "pending",
        externalPermalink: null,
        post: { id: "post_2", captionMaster: null },
        engagementSnapshots: [],
      },
    ]);

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: vi.fn() },
      postPlatformVariant: { findMany },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/analytics",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith({
      where: { post: { businessId: "biz_1" } },
      include: {
        post: { select: { id: true, captionMaster: true } },
        engagementSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      },
    });

    const body = response.json();

    expect(body.totals).toEqual({ likes: 35, comments: 7, shares: 1, reach: 400, impressions: 550 });

    expect(body.byPlatform).toEqual(
      expect.arrayContaining([
        { platform: "facebook_page", likes: 10, comments: 2, shares: 1, reach: 100, impressions: 150 },
        { platform: "instagram_business", likes: 25, comments: 5, shares: 0, reach: 300, impressions: 400 },
        { platform: "threads", likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 },
      ]),
    );
    expect(body.byPlatform).toHaveLength(3);

    expect(body.posts).toHaveLength(2);
    const post1 = body.posts.find((p: { postId: string }) => p.postId === "post_1");
    expect(post1.captionMaster).toBe("Fresh tomatoes, 50 ETB/kg");
    expect(post1.variants).toEqual(
      expect.arrayContaining([
        {
          platform: "facebook_page",
          variantStatus: "published",
          externalPermalink: "https://facebook.com/p/1",
          capturedAt: capturedAtFb.toISOString(),
          likes: 10,
          comments: 2,
          shares: 1,
          reach: 100,
          impressions: 150,
        },
        {
          platform: "instagram_business",
          variantStatus: "published",
          externalPermalink: "https://instagram.com/p/1",
          capturedAt: capturedAtIg.toISOString(),
          likes: 25,
          comments: 5,
          shares: 0,
          reach: 300,
          impressions: 400,
        },
      ]),
    );

    const post2 = body.posts.find((p: { postId: string }) => p.postId === "post_2");
    expect(post2.variants).toEqual([
      {
        platform: "threads",
        variantStatus: "pending",
        externalPermalink: null,
        capturedAt: null,
        likes: 0,
        comments: 0,
        shares: 0,
        reach: 0,
        impressions: 0,
      },
    ]);
  });

  it("returns all-zero totals when the business has no post_platform_variants yet", async () => {
    const businessFindFirst = vi.fn().mockResolvedValue({ id: "biz_empty" });
    const findMany = vi.fn().mockResolvedValue([]);

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: vi.fn() },
      postPlatformVariant: { findMany },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/analytics",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.totals).toEqual({ likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 });
    expect(body.byPlatform).toEqual([]);
    expect(body.posts).toEqual([]);
  });
});
