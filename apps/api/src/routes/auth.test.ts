import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import type { TelegramWebAppUser } from "../middleware/telegram-init-data.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "../test-utils/fixture-prisma.js";

const FIXTURE_BOT_TOKEN = "123456:fixture-bot-token-for-tests";
const FIXTURE_JWT_SECRET = "fixture-jwt-secret-for-tests";

function signInitData(
  params: Record<string, string>,
  botToken: string = FIXTURE_BOT_TOKEN,
): string {
  const dataCheckString = Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${params[key]}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const search = new URLSearchParams({ ...params, hash });
  return search.toString();
}

function buildFixtureParams(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  const user: TelegramWebAppUser = { id: 42, username: "haile", first_name: "Haile" };
  return {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAEfoo",
    user: JSON.stringify(user),
    ...overrides,
  };
}

describe("POST /auth/telegram", () => {
  let app: FastifyInstance;
  let upsert: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    upsert = vi.fn().mockResolvedValue({
      id: "user_1",
      telegramUserId: 42n,
      username: "haile",
      firstName: "Haile",
      photoUrl: null,
    });

    app = await buildApp({
      prisma: createFixturePrismaStore({ user: { upsert } }),
      telegramBotToken: FIXTURE_BOT_TOKEN,
      jwtSecret: FIXTURE_JWT_SECRET,
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

  it("mints a JWT and returns the upserted user for a validly signed initData payload", async () => {
    const initData = signInitData(buildFixtureParams());

    const response = await app.inject({
      method: "POST",
      url: "/auth/telegram",
      headers: { "x-telegram-init-data": initData },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toEqual({
      id: "user_1",
      telegramUserId: "42",
      username: "haile",
      firstName: "Haile",
      photoUrl: null,
    });
    expect(typeof body.token).toBe("string");

    const decoded = app.jwt.verify<{ sub: string; telegramUserId: string; exp: number; iat: number }>(
      body.token,
    );
    expect(decoded.sub).toBe("user_1");
    expect(decoded.telegramUserId).toBe("42");
    expect(decoded.exp - decoded.iat).toBe(3600);
  });

  it("returns 401 and does not mint a token when the initData header is missing", async () => {
    const response = await app.inject({ method: "POST", url: "/auth/telegram" });

    expect(response.statusCode).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 401 when the initData signature is invalid", async () => {
    const initData = signInitData(buildFixtureParams()).replace("Haile", "Mallory");

    const response = await app.inject({
      method: "POST",
      url: "/auth/telegram",
      headers: { "x-telegram-init-data": initData },
    });

    expect(response.statusCode).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 401 when auth_date is stale (>24h)", async () => {
    const staleAuthDate = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    const initData = signInitData(buildFixtureParams({ auth_date: String(staleAuthDate) }));

    const response = await app.inject({
      method: "POST",
      url: "/auth/telegram",
      headers: { "x-telegram-init-data": initData },
    });

    expect(response.statusCode).toBe(401);
  });
});
