import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "./test-utils/fixture-prisma.js";

describe("GET /health", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      prisma: createFixturePrismaStore(),
      telegramBotToken: "fixture-bot-token",
      jwtSecret: "fixture-jwt-secret",
      metaAppId: "fixture-meta-app-id",
      metaAppSecret: "fixture-meta-app-secret",
      metaWebhookVerifyToken: "fixture-webhook-verify-token",
      tokenEncryptionKey: FIXTURE_TOKEN_ENCRYPTION_KEY,
      baseUrl: "https://api.fixture.test",
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns a 200 with an ok status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("CORS", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      prisma: createFixturePrismaStore(),
      telegramBotToken: "fixture-bot-token",
      jwtSecret: "fixture-jwt-secret",
      metaAppId: "fixture-meta-app-id",
      metaAppSecret: "fixture-meta-app-secret",
      metaWebhookVerifyToken: "fixture-webhook-verify-token",
      tokenEncryptionKey: FIXTURE_TOKEN_ENCRYPTION_KEY,
      baseUrl: "https://api.fixture.test",
      corsOrigin: ["https://miniapp.fixture.test"],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows a preflight request from an allow-listed origin, including the Telegram init-data header", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/auth/telegram",
      headers: {
        origin: "https://miniapp.fixture.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-telegram-init-data",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://miniapp.fixture.test");
  });

  it("does not reflect an origin outside the allow-list", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/auth/telegram",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-telegram-init-data",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
