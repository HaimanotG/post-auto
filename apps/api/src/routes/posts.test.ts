import { GraphClient } from "@postauto/social";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "../test-utils/fixture-prisma.js";

const FIXTURE_JWT_SECRET = "fixture-jwt-secret-for-posts-tests";
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
      include: { sourceAssets: true },
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
    });
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
