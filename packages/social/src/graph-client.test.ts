import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GraphApiError, GraphClient } from "./graph-client.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("GraphClient", () => {
  it("returns parsed data on success", async () => {
    server.use(http.get(`${BASE_URL}/v21.0/me`, () => HttpResponse.json({ id: "123", name: "Test Page" })));

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await client.get<{ id: string; name: string }>("/me", undefined, "token-abc");

    expect(result.data).toEqual({ id: "123", name: "Test Page" });
  });

  it("sends the access token and extra params as query string params", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${BASE_URL}/v21.0/me/accounts`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ data: [] });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    await client.get("/me/accounts", { fields: "id,name" }, "token-xyz");

    expect(capturedUrl?.searchParams.get("access_token")).toBe("token-xyz");
    expect(capturedUrl?.searchParams.get("fields")).toBe("id,name");
  });

  it("sends a JSON body on POST", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/123/photos`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "post-1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await client.post<{ id: string }>("/123/photos", { url: "https://img.test/a.png" }, "token");

    expect(capturedBody).toEqual({ url: "https://img.test/a.png" });
    expect(result.data).toEqual({ id: "post-1" });
  });

  it("classifies an invalid-token error (code 190) as a non-retryable auth_error", async () => {
    server.use(
      http.get(`${BASE_URL}/v21.0/me`, () =>
        HttpResponse.json(
          {
            error: {
              message: "Invalid OAuth access token.",
              type: "OAuthException",
              code: 190,
              fbtrace_id: "trace-abc",
            },
          },
          { status: 401 },
        ),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await client.get("/me", undefined, "bad-token").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("auth_error");
    expect(graphError.code).toBe(190);
    expect(graphError.fbtraceId).toBe("trace-abc");
    expect(graphError.isRetryable).toBe(false);
  });

  it("classifies a rate-limit error (code 4) as a retryable rate_limited error", async () => {
    server.use(
      http.get(`${BASE_URL}/v21.0/me`, () =>
        HttpResponse.json(
          { error: { message: "Application request limit reached", type: "OAuthException", code: 4 } },
          { status: 429 },
        ),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await client.get("/me", undefined, "token").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("rate_limited");
    expect(graphError.isRetryable).toBe(true);
  });

  it("classifies a validation error (code 100) as a non-retryable permanent error", async () => {
    server.use(
      http.post(`${BASE_URL}/v21.0/123/photos`, () =>
        HttpResponse.json(
          { error: { message: "Invalid parameter", type: "OAuthException", code: 100, error_subcode: 2069010 } },
          { status: 400 },
        ),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await client.post("/123/photos", { url: "bad" }, "token").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("permanent");
    expect(graphError.subcode).toBe(2069010);
    expect(graphError.isRetryable).toBe(false);
  });

  it("classifies a 5xx with no Graph error envelope as a retryable transient error", async () => {
    server.use(http.get(`${BASE_URL}/v21.0/me`, () => new HttpResponse("Service Unavailable", { status: 503 })));

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await client.get("/me", undefined, "token").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("transient");
    expect(graphError.isRetryable).toBe(true);
  });

  it("reads the X-Business-Use-Case-Usage header and backs off before the next request once near cap", async () => {
    let requestCount = 0;
    server.use(
      http.get(`${BASE_URL}/v21.0/me`, () => {
        requestCount += 1;
        return HttpResponse.json(
          { id: "123" },
          {
            headers: {
              "X-Business-Use-Case-Usage": JSON.stringify({
                biz_1: [{ type: "pages", call_count: 95, total_cputime: 10, total_time: 10 }],
              }),
            },
          },
        );
      }),
    );

    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const client = new GraphClient({
      baseUrl: BASE_URL,
      sleepImpl,
      rateLimitThresholdPercent: 90,
      maxBackoffMs: 10_000,
    });

    await client.get("/me", undefined, "token");
    expect(sleepImpl).not.toHaveBeenCalled();

    await client.get("/me", undefined, "token");
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).toHaveBeenCalledWith(5000);
    expect(requestCount).toBe(2);
  });

  it("does not back off when usage is comfortably below the threshold", async () => {
    server.use(
      http.get(`${BASE_URL}/v21.0/me`, () =>
        HttpResponse.json(
          { id: "123" },
          {
            headers: {
              "X-Business-Use-Case-Usage": JSON.stringify({
                biz_1: [{ type: "pages", call_count: 20, total_cputime: 5, total_time: 5 }],
              }),
            },
          },
        ),
      ),
    );

    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const client = new GraphClient({ baseUrl: BASE_URL, sleepImpl, rateLimitThresholdPercent: 90 });

    await client.get("/me", undefined, "token");
    await client.get("/me", undefined, "token");

    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("exchanges a short-lived token for a long-lived one via GET /oauth/access_token", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${BASE_URL}/v21.0/oauth/access_token`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ access_token: "long-token", token_type: "bearer", expires_in: 5_184_000 });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await client.exchangeForLongLivedToken({
      appId: "app-id",
      appSecret: "app-secret",
      shortLivedToken: "short-token",
    });

    expect(capturedUrl?.searchParams.get("grant_type")).toBe("fb_exchange_token");
    expect(capturedUrl?.searchParams.get("client_id")).toBe("app-id");
    expect(capturedUrl?.searchParams.get("client_secret")).toBe("app-secret");
    expect(capturedUrl?.searchParams.get("fb_exchange_token")).toBe("short-token");
    expect(result).toEqual({ access_token: "long-token", token_type: "bearer", expires_in: 5_184_000 });
  });
});
