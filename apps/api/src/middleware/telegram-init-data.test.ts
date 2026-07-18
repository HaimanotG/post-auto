import { createHmac } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  createTelegramInitDataPreHandler,
  TelegramInitDataError,
  upsertTelegramUser,
  verifyTelegramInitData,
  type TelegramWebAppUser,
} from "./telegram-init-data.js";

const FIXTURE_BOT_TOKEN = "123456:fixture-bot-token-for-tests";

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

describe("verifyTelegramInitData", () => {
  it("accepts a validly signed payload and returns the parsed user", () => {
    const initData = signInitData(buildFixtureParams());

    const result = verifyTelegramInitData(initData, FIXTURE_BOT_TOKEN);

    expect(result.user).toEqual({ id: 42, username: "haile", first_name: "Haile" });
  });

  it("rejects a tampered payload whose fields don't match the signed hash", () => {
    const initData = signInitData(buildFixtureParams());
    const tampered = initData.replace("Haile", "Mallory");

    expect(() => verifyTelegramInitData(tampered, FIXTURE_BOT_TOKEN)).toThrow(
      TelegramInitDataError,
    );
  });

  it("rejects a payload signed with a different bot token", () => {
    const initData = signInitData(buildFixtureParams(), "999999:some-other-bot-token");

    expect(() => verifyTelegramInitData(initData, FIXTURE_BOT_TOKEN)).toThrow(
      TelegramInitDataError,
    );
  });

  it("rejects a payload with an auth_date older than 24h", () => {
    const staleAuthDate = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    const initData = signInitData(buildFixtureParams({ auth_date: String(staleAuthDate) }));

    expect(() => verifyTelegramInitData(initData, FIXTURE_BOT_TOKEN)).toThrow(
      /stale/i,
    );
  });

  it("accepts a payload with an auth_date just under 24h old", () => {
    const almostStale = Math.floor(Date.now() / 1000) - 23 * 60 * 60;
    const initData = signInitData(buildFixtureParams({ auth_date: String(almostStale) }));

    expect(() => verifyTelegramInitData(initData, FIXTURE_BOT_TOKEN)).not.toThrow();
  });

  it("rejects a payload missing the hash field", () => {
    const params = buildFixtureParams();
    const search = new URLSearchParams(params);

    expect(() => verifyTelegramInitData(search.toString(), FIXTURE_BOT_TOKEN)).toThrow(
      /hash/i,
    );
  });

  it("rejects a payload missing the user field", () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const dataCheckString = [`auth_date=${authDate}`, "query_id=AAEfoo"].join("\n");
    const secretKey = createHmac("sha256", "WebAppData").update(FIXTURE_BOT_TOKEN).digest();
    const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    const initData = new URLSearchParams({
      auth_date: authDate,
      query_id: "AAEfoo",
      hash,
    }).toString();

    expect(() => verifyTelegramInitData(initData, FIXTURE_BOT_TOKEN)).toThrow(/user/i);
  });
});

describe("upsertTelegramUser", () => {
  it("upserts by telegramUserId, mapping snake_case Telegram fields to the Prisma shape", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "user_1", telegramUserId: 42n });
    const prisma = { user: { upsert } };

    const user: TelegramWebAppUser = {
      id: 42,
      username: "haile",
      first_name: "Haile",
      photo_url: "https://example.com/p.jpg",
    };

    const result = await upsertTelegramUser(prisma, user);

    expect(upsert).toHaveBeenCalledWith({
      where: { telegramUserId: 42n },
      update: { username: "haile", firstName: "Haile", photoUrl: "https://example.com/p.jpg" },
      create: {
        telegramUserId: 42n,
        username: "haile",
        firstName: "Haile",
        photoUrl: "https://example.com/p.jpg",
      },
    });
    expect(result).toEqual({ id: "user_1", telegramUserId: 42n });
  });
});

describe("createTelegramInitDataPreHandler", () => {
  async function buildTestApp(upsert = vi.fn().mockResolvedValue({ id: "user_1", telegramUserId: "42" })) {
    const app: FastifyInstance = Fastify();
    const prisma = { user: { upsert } };
    const preHandler = createTelegramInitDataPreHandler(prisma, FIXTURE_BOT_TOKEN);

    app.get("/me", { preHandler }, async (request) => {
      return { user: request.telegramUser, authDate: request.telegramInitData?.authDate };
    });

    return { app, upsert };
  }

  it("returns 401 when the initData header is missing", async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/me" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 when the initData signature is invalid", async () => {
    const { app } = await buildTestApp();
    const initData = signInitData(buildFixtureParams()).replace("Haile", "Mallory");

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-telegram-init-data": initData },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("upserts the user and attaches it to the request on a valid payload", async () => {
    const { app, upsert } = await buildTestApp();
    const initData = signInitData(buildFixtureParams());

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-telegram-init-data": initData },
    });

    expect(response.statusCode).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    expect(response.json().user).toEqual({ id: "user_1", telegramUserId: "42" });
    await app.close();
  });
});
