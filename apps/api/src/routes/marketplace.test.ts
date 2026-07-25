import { GraphClient } from "@postauto/social";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "../test-utils/fixture-prisma.js";

const FIXTURE_JWT_SECRET = "fixture-jwt-secret-for-marketplace-tests";
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

describe("GET /marketplace/listing", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without a valid bearer token", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({ method: "GET", url: "/marketplace/listing" });

    expect(response.statusCode).toBe(401);
  });

  it("returns available: false when the business has no posts with a source photo", async () => {
    const businessFindFirst = vi.fn().mockResolvedValue({ id: "biz_1" });
    const findMany = vi.fn().mockResolvedValue([]);

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: vi.fn() },
      post: { findMany },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/marketplace/listing",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ available: false });
  });

  it("builds a listing from the most recent eligible post's cover asset", async () => {
    const businessFindFirst = vi.fn().mockResolvedValue({ id: "biz_1" });
    const findMany = vi.fn().mockResolvedValue([
      {
        captionMaster: "New arrivals, ETB 500",
        sourceAssets: [
          {
            rawUrl: "https://cdn.test/photo-1.jpg",
            productName: "Handwoven scarf",
            price: "500",
            description: "Soft cotton scarf",
            orderIndex: 0,
          },
          {
            rawUrl: "https://cdn.test/photo-2.jpg",
            productName: null,
            price: null,
            description: null,
            orderIndex: 1,
          },
        ],
      },
    ]);

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: vi.fn() },
      post: { findMany },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/marketplace/listing",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      orderBy: { createdAt: "desc" },
      include: { sourceAssets: true },
      take: 20,
    });
    expect(response.json()).toEqual({
      available: true,
      photoUrl: "https://cdn.test/photo-1.jpg",
      listing: {
        title: "Handwoven scarf",
        priceText: "500 ETB",
        description: "Soft cotton scarf",
        listingText: "Handwoven scarf\n500 ETB\n\nSoft cotton scarf",
      },
    });
  });

  it("falls back to the caption when the cover asset has no product name, and skips posts with neither", async () => {
    const businessFindFirst = vi.fn().mockResolvedValue({ id: "biz_1" });
    const findMany = vi.fn().mockResolvedValue([
      {
        captionMaster: null,
        sourceAssets: [{ rawUrl: "https://cdn.test/no-text.jpg", productName: null, price: null, description: null, orderIndex: 0 }],
      },
      {
        captionMaster: "Fresh berbere spice blend",
        sourceAssets: [{ rawUrl: "https://cdn.test/spice.jpg", productName: null, price: null, description: null, orderIndex: 0 }],
      },
    ]);

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: vi.fn() },
      post: { findMany },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/marketplace/listing",
      headers: { authorization: `Bearer ${token}` },
    });

    const body = response.json();
    expect(body.available).toBe(true);
    expect(body.photoUrl).toBe("https://cdn.test/spice.jpg");
    expect(body.listing.title).toBe("Fresh berbere spice blend");
  });
});
