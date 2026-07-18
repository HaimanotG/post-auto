import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphApiError } from "../errors.js";
import { GraphClient } from "../graph-client.js";
import { publishThreadsPost } from "./publish-post.js";

const BASE_URL = "https://graph.threads.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("publishThreadsPost", () => {
  it("creates a TEXT media container then publishes it, returning the media id", async () => {
    let containerBody: unknown;
    let containerUrl: URL | undefined;
    let publishBody: unknown;
    let publishUrl: URL | undefined;

    server.use(
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads`, async ({ request }) => {
        containerUrl = new URL(request.url);
        containerBody = await request.json();
        return HttpResponse.json({ id: "container-1" });
      }),
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads_publish`, async ({ request }) => {
        publishUrl = new URL(request.url);
        publishBody = await request.json();
        return HttpResponse.json({ id: "media-1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await publishThreadsPost(client, {
      threadsUserId: "threads-user-123",
      accessToken: "threads-token",
      text: "New arrivals!",
    });

    expect(containerBody).toEqual({ media_type: "TEXT", text: "New arrivals!" });
    expect(containerUrl?.searchParams.get("access_token")).toBe("threads-token");
    expect(publishBody).toEqual({ creation_id: "container-1" });
    expect(publishUrl?.searchParams.get("access_token")).toBe("threads-token");
    expect(result).toEqual({ mediaId: "media-1" });
  });

  it("creates an IMAGE media container when an imageUrl is provided", async () => {
    let containerBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads`, async ({ request }) => {
        containerBody = await request.json();
        return HttpResponse.json({ id: "container-2" });
      }),
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads_publish`, () => HttpResponse.json({ id: "media-2" })),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await publishThreadsPost(client, {
      threadsUserId: "threads-user-123",
      accessToken: "threads-token",
      text: "New arrivals!",
      imageUrl: "https://img.test/product.png",
    });

    expect(containerBody).toEqual({
      media_type: "IMAGE",
      text: "New arrivals!",
      image_url: "https://img.test/product.png",
    });
    expect(result).toEqual({ mediaId: "media-2" });
  });

  it("omits the text field entirely when none is provided", async () => {
    let containerBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads`, async ({ request }) => {
        containerBody = await request.json();
        return HttpResponse.json({ id: "container-3" });
      }),
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads_publish`, () => HttpResponse.json({ id: "media-3" })),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await publishThreadsPost(client, {
      threadsUserId: "threads-user-123",
      accessToken: "threads-token",
      imageUrl: "https://img.test/product.png",
    });

    expect(containerBody).toEqual({ media_type: "IMAGE", image_url: "https://img.test/product.png" });
    expect(result).toEqual({ mediaId: "media-3" });
  });

  it("propagates a non-retryable auth error and never calls threads_publish when the container step fails", async () => {
    let publishCalled = false;
    server.use(
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads`, () =>
        HttpResponse.json(
          { error: { message: "Error validating access token", type: "OAuthException", code: 190 } },
          { status: 401 },
        ),
      ),
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads_publish`, () => {
        publishCalled = true;
        return HttpResponse.json({ id: "media-4" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await publishThreadsPost(client, {
      threadsUserId: "threads-user-123",
      accessToken: "expired-token",
      text: "New arrivals!",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("auth_error");
    expect(graphError.isRetryable).toBe(false);
    expect(publishCalled).toBe(false);
  });

  it("propagates a non-retryable permanent error when the publish step fails", async () => {
    server.use(
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads`, () => HttpResponse.json({ id: "container-5" })),
      http.post(`${BASE_URL}/v21.0/threads-user-123/threads_publish`, () =>
        HttpResponse.json(
          { error: { message: "Media ID is not available", type: "OAuthException", code: 100 } },
          { status: 400 },
        ),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await publishThreadsPost(client, {
      threadsUserId: "threads-user-123",
      accessToken: "threads-token",
      text: "New arrivals!",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("permanent");
    expect(graphError.isRetryable).toBe(false);
  });
});
