import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GraphClient } from "./graph-client.js";
import { GraphApiError } from "./errors.js";
import {
  buildFacebookAuthorizationUrl,
  buildThreadsAuthorizationUrl,
  exchangeFacebookCodeForToken,
  exchangeThreadsCodeForToken,
  exchangeThreadsForLongLivedToken,
  fetchFacebookPageAccounts,
  FACEBOOK_OAUTH_SCOPES,
  THREADS_OAUTH_SCOPES,
} from "./oauth.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("buildFacebookAuthorizationUrl", () => {
  it("builds an authorize URL with the default scopes", () => {
    const url = new URL(
      buildFacebookAuthorizationUrl({
        appId: "app-id",
        redirectUri: "https://api.test/oauth/facebook_page/callback",
        state: "state-token",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("app-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.test/oauth/facebook_page/callback");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(FACEBOOK_OAUTH_SCOPES.join(","));
  });
});

describe("buildThreadsAuthorizationUrl", () => {
  it("builds an authorize URL with the default scopes", () => {
    const url = new URL(
      buildThreadsAuthorizationUrl({
        appId: "app-id",
        redirectUri: "https://api.test/oauth/threads/callback",
        state: "state-token",
      }),
    );

    expect(url.searchParams.get("scope")).toBe(THREADS_OAUTH_SCOPES.join(","));
    expect(url.searchParams.get("state")).toBe("state-token");
  });
});

describe("exchangeFacebookCodeForToken", () => {
  it("exchanges a code for a short-lived access token", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${BASE_URL}/v21.0/oauth/access_token`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ access_token: "short-token", token_type: "bearer", expires_in: 3600 });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await exchangeFacebookCodeForToken(client, {
      appId: "app-id",
      appSecret: "app-secret",
      redirectUri: "https://api.test/oauth/facebook_page/callback",
      code: "auth-code",
    });

    expect(capturedUrl?.searchParams.get("client_id")).toBe("app-id");
    expect(capturedUrl?.searchParams.get("client_secret")).toBe("app-secret");
    expect(capturedUrl?.searchParams.get("code")).toBe("auth-code");
    expect(result).toEqual({ accessToken: "short-token", expiresIn: 3600 });
  });

  it("throws a GraphApiError when the code exchange fails", async () => {
    server.use(
      http.get(`${BASE_URL}/v21.0/oauth/access_token`, () =>
        HttpResponse.json(
          { error: { message: "Invalid authorization code", type: "OAuthException", code: 100 } },
          { status: 400 },
        ),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await exchangeFacebookCodeForToken(client, {
      appId: "app-id",
      appSecret: "app-secret",
      redirectUri: "https://api.test/oauth/facebook_page/callback",
      code: "bad-code",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    expect((error as GraphApiError).category).toBe("permanent");
  });
});

describe("fetchFacebookPageAccounts", () => {
  it("maps /me/accounts into pages, including the linked IG Business account when present", async () => {
    server.use(
      http.get(`${BASE_URL}/v21.0/me/accounts`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("access_token")).toBe("user-token");
        expect(url.searchParams.get("fields")).toBe("id,name,access_token,instagram_business_account{id,username}");
        return HttpResponse.json({
          data: [
            {
              id: "page-1",
              name: "Page One",
              access_token: "page-1-token",
              instagram_business_account: { id: "ig-1", username: "page_one_ig" },
            },
            { id: "page-2", name: "Page Two", access_token: "page-2-token" },
          ],
        });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const pages = await fetchFacebookPageAccounts(client, "user-token");

    expect(pages).toEqual([
      {
        id: "page-1",
        name: "Page One",
        accessToken: "page-1-token",
        instagramBusinessAccountId: "ig-1",
        instagramBusinessAccountUsername: "page_one_ig",
      },
      {
        id: "page-2",
        name: "Page Two",
        accessToken: "page-2-token",
        instagramBusinessAccountId: undefined,
        instagramBusinessAccountUsername: undefined,
      },
    ]);
  });
});

describe("exchangeThreadsCodeForToken", () => {
  it("posts form-encoded params and returns the short-lived token + user id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "threads-short-token", user_id: 999 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await exchangeThreadsCodeForToken(
      {
        appId: "app-id",
        appSecret: "app-secret",
        redirectUri: "https://api.test/oauth/threads/callback",
        code: "auth-code",
      },
      fetchImpl,
    );

    expect(result).toEqual({ accessToken: "threads-short-token", userId: "999" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.threads.net/oauth/access_token");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("client_id")).toBe("app-id");
    expect(body.get("client_secret")).toBe("app-secret");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
  });

  it("throws a GraphApiError when the response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error_message: "Invalid code" }), { status: 400 }),
    );

    const error = await exchangeThreadsCodeForToken(
      {
        appId: "app-id",
        appSecret: "app-secret",
        redirectUri: "https://api.test/oauth/threads/callback",
        code: "bad-code",
      },
      fetchImpl,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
  });
});

describe("exchangeThreadsForLongLivedToken", () => {
  it("gets a long-lived token via th_exchange_token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "threads-long-token", token_type: "bearer", expires_in: 5_184_000 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await exchangeThreadsForLongLivedToken(
      { appSecret: "app-secret", shortLivedToken: "threads-short-token" },
      fetchImpl,
    );

    expect(result).toEqual({ accessToken: "threads-long-token", expiresIn: 5_184_000 });
    const [url] = fetchImpl.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://graph.threads.net/access_token");
    expect(parsed.searchParams.get("grant_type")).toBe("th_exchange_token");
    expect(parsed.searchParams.get("client_secret")).toBe("app-secret");
    expect(parsed.searchParams.get("access_token")).toBe("threads-short-token");
  });
});
