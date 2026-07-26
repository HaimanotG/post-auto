import { GraphClient } from "@postauto/social";
import type { FastifyInstance } from "fastify";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "../test-utils/fixture-prisma.js";

const GRAPH_BASE_URL = "https://graph.test";
const FIXTURE_JWT_SECRET = "fixture-jwt-secret-for-oauth-tests";
const FIXTURE_BASE_URL = "https://api.fixture.test";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function buildFixtureApp(prismaOverrides: Parameters<typeof createFixturePrismaStore>[0] = {}) {
  const prisma = createFixturePrismaStore(prismaOverrides);
  const graphClient = new GraphClient({ baseUrl: GRAPH_BASE_URL });
  const threadsFetchImpl = vi.fn();

  const app = await buildApp({
    prisma,
    telegramBotToken: "fixture-bot-token",
    jwtSecret: FIXTURE_JWT_SECRET,
    metaAppId: "meta-app-id",
    metaAppSecret: "meta-app-secret",
    threadsAppId: "threads-app-id",
    threadsAppSecret: "threads-app-secret",
    metaWebhookVerifyToken: "meta-webhook-verify-token",
    tokenEncryptionKey: FIXTURE_TOKEN_ENCRYPTION_KEY,
    baseUrl: FIXTURE_BASE_URL,
    telegramBotUsername: "postauto_bot",
    graphClient,
    threadsFetchImpl,
  });

  return { app, prisma, threadsFetchImpl };
}

async function signJwt(app: FastifyInstance, payload: { sub: string; telegramUserId: string }): Promise<string> {
  return app.jwt.sign(payload, { expiresIn: "1h" });
}

describe("GET /oauth/:platform/start", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without a valid bearer token", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({ method: "GET", url: "/oauth/facebook_page/start" });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 for an unsupported platform", async () => {
    ({ app } = await buildFixtureApp());
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/oauth/tiktok/start",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("creates a business + owner membership on first use, persists an oauth_states row, and returns the Facebook authorization URL", async () => {
    const businessCreate = vi.fn().mockResolvedValue({ id: "biz_1" });
    const businessFindFirst = vi.fn().mockResolvedValue(null);
    const businessMemberUpsert = vi.fn().mockResolvedValue(undefined);
    const oAuthStateCreate = vi.fn().mockResolvedValue(undefined);

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: businessCreate },
      businessMember: { upsert: businessMemberUpsert },
      oAuthState: { create: oAuthStateCreate },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/start",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(businessFindFirst).toHaveBeenCalledWith({ where: { telegramOwnerUserId: 42n } });
    expect(businessCreate).toHaveBeenCalledWith({
      data: { name: "Business 42", telegramOwnerUserId: 42n, timezone: "Africa/Addis_Ababa" },
    });
    expect(businessMemberUpsert).toHaveBeenCalledWith({
      where: { businessId_userId: { businessId: "biz_1", userId: "user_1" } },
      update: {},
      create: { businessId: "biz_1", userId: "user_1", role: "owner" },
    });
    expect(oAuthStateCreate).toHaveBeenCalledTimes(1);
    const createArgs = oAuthStateCreate.mock.calls[0]?.[0];
    expect(createArgs.data.businessId).toBe("biz_1");
    expect(createArgs.data.userId).toBe("user_1");
    expect(createArgs.data.platform).toBe("facebook_page");
    expect(typeof createArgs.data.stateToken).toBe("string");
    expect(createArgs.data.stateToken.length).toBeGreaterThan(20);

    const body = response.json();
    const url = new URL(body.authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url.searchParams.get("redirect_uri")).toBe(`${FIXTURE_BASE_URL}/oauth/facebook_page/callback`);
    expect(url.searchParams.get("state")).toBe(createArgs.data.stateToken);
  });

  it("reuses an existing business rather than creating a new one", async () => {
    const businessCreate = vi.fn();
    const businessFindFirst = vi.fn().mockResolvedValue({ id: "biz_existing" });

    ({ app } = await buildFixtureApp({
      business: { findFirst: businessFindFirst, create: businessCreate },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/oauth/threads/start",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(businessCreate).not.toHaveBeenCalled();
  });

  it("uses the Threads-specific app ID (not the Meta App ID) for the Threads authorization URL", async () => {
    ({ app } = await buildFixtureApp({
      business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/oauth/threads/start",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const url = new URL(body.authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://threads.net/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("threads-app-id");
  });

  it("returns 500 when Threads OAuth is requested but THREADS_APP_ID/THREADS_APP_SECRET aren't configured", async () => {
    const prisma = createFixturePrismaStore({
      business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
    });
    app = await buildApp({
      prisma,
      telegramBotToken: "fixture-bot-token",
      jwtSecret: FIXTURE_JWT_SECRET,
      metaAppId: "meta-app-id",
      metaAppSecret: "meta-app-secret",
      metaWebhookVerifyToken: "meta-webhook-verify-token",
      tokenEncryptionKey: FIXTURE_TOKEN_ENCRYPTION_KEY,
      baseUrl: FIXTURE_BASE_URL,
    });
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/oauth/threads/start",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(500);
  });
});

describe("GET /oauth/:platform/callback", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 400 when the state token is unknown", async () => {
    ({ app } = await buildFixtureApp({ oAuthState: { findUnique: vi.fn().mockResolvedValue(null) } }));

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?code=abc&state=unknown",
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when the state token was already consumed", async () => {
    ({ app } = await buildFixtureApp({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "facebook_page",
          consumedAt: new Date(),
          createdAt: new Date(),
        }),
      },
    }));

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?code=abc&state=used-token",
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when the state token is stale (older than 15 minutes)", async () => {
    const staleCreatedAt = new Date(Date.now() - 20 * 60 * 1000);
    ({ app } = await buildFixtureApp({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "facebook_page",
          consumedAt: null,
          createdAt: staleCreatedAt,
        }),
      },
    }));

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?code=abc&state=stale-token",
    });
    expect(response.statusCode).toBe(400);
  });

  it("records the denial when Meta redirects back with an error and consumes the state", async () => {
    const oAuthStateUpdate = vi.fn().mockResolvedValue(undefined);
    ({ app } = await buildFixtureApp({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "facebook_page",
          consumedAt: null,
          createdAt: new Date(),
        }),
        update: oAuthStateUpdate,
      },
    }));

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?state=valid-token&error=access_denied&error_description=User+denied",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ connected: false, error: "User denied" });
    expect(oAuthStateUpdate).toHaveBeenCalledWith({ where: { id: "state_1" }, data: { consumedAt: expect.any(Date) } });
  });

  it("exchanges the code, upgrades to a long-lived token, and upserts facebook_page + instagram_business social_accounts", async () => {
    server.use(
      http.get(`${GRAPH_BASE_URL}/v21.0/oauth/access_token`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("grant_type") === "fb_exchange_token") {
          return HttpResponse.json({ access_token: "long-lived-user-token", token_type: "bearer", expires_in: 5_184_000 });
        }
        return HttpResponse.json({ access_token: "short-lived-user-token", token_type: "bearer", expires_in: 3600 });
      }),
      http.get(`${GRAPH_BASE_URL}/v21.0/me/accounts`, () =>
        HttpResponse.json({
          data: [
            {
              id: "page-1",
              name: "Page One",
              access_token: "page-1-access-token",
              instagram_business_account: { id: "ig-1", username: "page_one_ig" },
            },
          ],
        }),
      ),
      http.post(`${GRAPH_BASE_URL}/v21.0/page-1/subscribed_apps`, () => HttpResponse.json({ success: true })),
      http.post(`${GRAPH_BASE_URL}/v21.0/ig-1/subscribed_apps`, () => HttpResponse.json({ success: true })),
    );

    const socialAccountUpsert = vi.fn().mockResolvedValue(undefined);
    const oAuthStateUpdate = vi.fn().mockResolvedValue(undefined);

    ({ app } = await buildFixtureApp({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "facebook_page",
          consumedAt: null,
          createdAt: new Date(),
        }),
        update: oAuthStateUpdate,
      },
      socialAccount: { upsert: socialAccountUpsert },
    }));

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?code=auth-code&state=valid-token",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ connected: true, platform: "facebook_page", pageCount: 1 });
    expect(oAuthStateUpdate).toHaveBeenCalledTimes(1);
    expect(socialAccountUpsert).toHaveBeenCalledTimes(2);

    const pageCall = socialAccountUpsert.mock.calls.find(
      (call) => call[0].where.businessId_platform_externalAccountId.platform === "facebook_page",
    );
    expect(pageCall).toBeDefined();
    expect(pageCall![0].where.businessId_platform_externalAccountId).toEqual({
      businessId: "biz_1",
      platform: "facebook_page",
      externalAccountId: "page-1",
    });
    expect(pageCall![0].create.accessTokenEncrypted).not.toContain("page-1-access-token");
    expect(pageCall![0].create.displayName).toBe("Page One");

    const igCall = socialAccountUpsert.mock.calls.find(
      (call) => call[0].where.businessId_platform_externalAccountId.platform === "instagram_business",
    );
    expect(igCall).toBeDefined();
    expect(igCall![0].where.businessId_platform_externalAccountId).toEqual({
      businessId: "biz_1",
      platform: "instagram_business",
      externalAccountId: "ig-1",
    });
    expect(igCall![0].create.displayName).toBe("@page_one_ig");
  });

  it("exchanges the code and upserts a threads social_account for the threads grant", async () => {
    const socialAccountUpsert = vi.fn().mockResolvedValue(undefined);
    const oAuthStateUpdate = vi.fn().mockResolvedValue(undefined);

    const prisma = createFixturePrismaStore({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "threads",
          consumedAt: null,
          createdAt: new Date(),
        }),
        update: oAuthStateUpdate,
      },
      socialAccount: { upsert: socialAccountUpsert },
    });

    // exchangeThreadsCodeForToken posts to .../oauth/access_token (short-lived);
    // exchangeThreadsForLongLivedToken GETs .../access_token (long-lived, no /oauth/ prefix).
    const threadsFetchImpl = vi.fn().mockImplementation((url: string) => {
      const isLongLivedExchange = new URL(url).pathname === "/access_token";
      const payload = isLongLivedExchange
        ? { access_token: "threads-long-token", token_type: "bearer", expires_in: 5_184_000 }
        : { access_token: "threads-short-token", user_id: 777 };
      return Promise.resolve(
        new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    });

    app = await buildApp({
      prisma,
      telegramBotToken: "fixture-bot-token",
      jwtSecret: FIXTURE_JWT_SECRET,
      metaAppId: "meta-app-id",
      metaAppSecret: "meta-app-secret",
      threadsAppId: "threads-app-id",
      threadsAppSecret: "threads-app-secret",
      metaWebhookVerifyToken: "meta-webhook-verify-token",
      tokenEncryptionKey: FIXTURE_TOKEN_ENCRYPTION_KEY,
      baseUrl: FIXTURE_BASE_URL,
      threadsFetchImpl,
    });

    const response = await app.inject({
      method: "GET",
      url: "/oauth/threads/callback?code=auth-code&state=valid-token",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ connected: true, platform: "threads" });
    expect(socialAccountUpsert).toHaveBeenCalledTimes(1);

    const codeExchangeCall = threadsFetchImpl.mock.calls.find(
      (call) => new URL(String(call[0])).pathname === "/oauth/access_token",
    );
    expect(codeExchangeCall).toBeDefined();
    const requestBody = new URLSearchParams((codeExchangeCall![1] as RequestInit).body as string);
    expect(requestBody.get("client_id")).toBe("threads-app-id");
    expect(requestBody.get("client_secret")).toBe("threads-app-secret");
    const call = socialAccountUpsert.mock.calls[0]?.[0];
    expect(call.where.businessId_platform_externalAccountId).toEqual({
      businessId: "biz_1",
      platform: "threads",
      externalAccountId: "777",
    });
    expect(call.create.tokenExpiresAt).toBeInstanceOf(Date);
  });

  it("returns 502 and does not persist a social_account when the Graph API code exchange fails", async () => {
    server.use(
      http.get(`${GRAPH_BASE_URL}/v21.0/oauth/access_token`, () =>
        HttpResponse.json(
          { error: { message: "Invalid authorization code", type: "OAuthException", code: 100 } },
          { status: 400 },
        ),
      ),
    );

    const socialAccountUpsert = vi.fn();
    ({ app } = await buildFixtureApp({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "facebook_page",
          consumedAt: null,
          createdAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      socialAccount: { upsert: socialAccountUpsert },
    }));

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?code=bad-code&state=valid-token",
    });

    expect(response.statusCode).toBe(502);
    expect(socialAccountUpsert).not.toHaveBeenCalled();
  });
});

describe("GET /oauth/:platform/callback (return-to-Telegram HTML screen)", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("renders an HTML success screen with a t.me deep link when the request accepts text/html", async () => {
    server.use(
      http.get(`${GRAPH_BASE_URL}/v21.0/oauth/access_token`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("grant_type") === "fb_exchange_token") {
          return HttpResponse.json({ access_token: "long-lived-user-token", token_type: "bearer", expires_in: 5_184_000 });
        }
        return HttpResponse.json({ access_token: "short-lived-user-token", token_type: "bearer", expires_in: 3600 });
      }),
      http.get(`${GRAPH_BASE_URL}/v21.0/me/accounts`, () =>
        HttpResponse.json({ data: [{ id: "page-1", name: "Page One", access_token: "page-1-access-token" }] }),
      ),
      http.post(`${GRAPH_BASE_URL}/v21.0/page-1/subscribed_apps`, () => HttpResponse.json({ success: true })),
    );

    ({ app } = await buildFixtureApp({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "facebook_page",
          consumedAt: null,
          createdAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      socialAccount: { upsert: vi.fn().mockResolvedValue(undefined) },
    }));

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?code=auth-code&state=valid-token",
      headers: { accept: "text/html" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("https://t.me/postauto_bot?startapp=oauth_success");
    expect(response.body).toContain("You're connected!");
  });

  it("renders an HTML denial screen when Meta redirects back with an error", async () => {
    ({ app } = await buildFixtureApp({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "facebook_page",
          consumedAt: null,
          createdAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    }));

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?state=valid-token&error=access_denied&error_description=User+denied",
      headers: { accept: "text/html" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Connection failed");
    expect(response.body).toContain("User denied");
    expect(response.body).toContain("https://t.me/postauto_bot?startapp=oauth_success");
  });

  it("falls back to a generic return-to-Telegram message when no bot username is configured", async () => {
    const prisma = createFixturePrismaStore({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "facebook_page",
          consumedAt: null,
          createdAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    });

    app = await buildApp({
      prisma,
      telegramBotToken: "fixture-bot-token",
      jwtSecret: FIXTURE_JWT_SECRET,
      metaAppId: "meta-app-id",
      metaAppSecret: "meta-app-secret",
      metaWebhookVerifyToken: "meta-webhook-verify-token",
      tokenEncryptionKey: FIXTURE_TOKEN_ENCRYPTION_KEY,
      baseUrl: FIXTURE_BASE_URL,
    });

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?state=valid-token&error=access_denied",
      headers: { accept: "text/html" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("t.me/");
    expect(response.body).toContain("Return to Telegram and reopen PostAuto.");
  });

  it("still returns JSON when the request does not accept text/html", async () => {
    ({ app } = await buildFixtureApp({
      oAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: "state_1",
          businessId: "biz_1",
          userId: "user_1",
          platform: "facebook_page",
          consumedAt: null,
          createdAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    }));

    const response = await app.inject({
      method: "GET",
      url: "/oauth/facebook_page/callback?state=valid-token&error=access_denied&error_description=User+denied",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ connected: false, error: "User denied" });
  });
});

describe("GET /oauth/status", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without a valid bearer token", async () => {
    ({ app } = await buildFixtureApp());
    const response = await app.inject({ method: "GET", url: "/oauth/status" });
    expect(response.statusCode).toBe(401);
  });

  it("returns an empty list when the user has no business yet", async () => {
    ({ app } = await buildFixtureApp({ business: { findFirst: vi.fn().mockResolvedValue(null) } }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/oauth/status",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ connected: [] });
  });

  it("returns the connected social accounts for the caller's business", async () => {
    ({ app } = await buildFixtureApp({
      business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) },
      socialAccount: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "account_1",
            platform: "facebook_page",
            externalAccountId: "page-1",
            displayName: "My Shop",
            status: "active",
          },
        ]),
      },
    }));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "GET",
      url: "/oauth/status",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      connected: [
        {
          id: "account_1",
          platform: "facebook_page",
          externalAccountId: "page-1",
          displayName: "My Shop",
          status: "active",
        },
      ],
    });
  });
});
