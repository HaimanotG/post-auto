import { GraphClient } from "@postauto/social";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "../test-utils/fixture-prisma.js";

const FIXTURE_JWT_SECRET = "fixture-jwt-secret-for-inbox-tests";
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

describe("GET /inbox", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without a valid bearer token", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({ method: "GET", url: "/inbox" });

    expect(response.statusCode).toBe(401);
  });

  it("resolves the owner's business and returns each message with its ai_reply_decisions history", async () => {
    const businessFindFirst = vi.fn().mockResolvedValue({ id: "biz_1" });
    const createdAt = new Date("2026-07-19T09:00:00.000Z");
    const decisionCreatedAt = new Date("2026-07-19T09:01:00.000Z");
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "msg_1",
        platform: "facebook_page",
        type: "comment",
        senderName: "Abebe Bikila",
        senderUsername: null,
        body: "Is this still available?",
        status: "needs_attention",
        createdAt,
        aiReplyDecisions: [
          {
            id: "decision_1",
            modelUsed: "gpt-fixture",
            intentClassified: "availability",
            confidence: 0.4,
            decision: "escalate",
            replyText: null,
            reasoningSnippet: "Below confidence threshold",
            createdAt: decisionCreatedAt,
          },
        ],
      },
    ]);

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: vi.fn() },
      inboxMessage: { findMany },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/inbox",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      orderBy: { createdAt: "desc" },
      include: { aiReplyDecisions: { orderBy: { createdAt: "asc" } } },
    });

    const body = response.json();
    expect(body.messages).toEqual([
      {
        id: "msg_1",
        platform: "facebook_page",
        type: "comment",
        senderName: "Abebe Bikila",
        senderUsername: null,
        body: "Is this still available?",
        status: "needs_attention",
        createdAt: createdAt.toISOString(),
        decisions: [
          {
            id: "decision_1",
            modelUsed: "gpt-fixture",
            intentClassified: "availability",
            confidence: 0.4,
            decision: "escalate",
            replyText: null,
            reasoningSnippet: "Below confidence threshold",
            createdAt: decisionCreatedAt.toISOString(),
          },
        ],
      },
    ]);
  });

  it("returns an empty list when the business has no inbox_messages yet", async () => {
    const businessFindFirst = vi.fn().mockResolvedValue({ id: "biz_empty" });
    const findMany = vi.fn().mockResolvedValue([]);

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: vi.fn() },
      inboxMessage: { findMany },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/inbox",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ messages: [] });
  });
});
