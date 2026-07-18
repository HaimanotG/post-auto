import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphApiError } from "../errors.js";
import { GraphClient } from "../graph-client.js";
import { publishPhotoToFacebookPage } from "./publish-photo.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("publishPhotoToFacebookPage", () => {
  it("publishes a single image and returns the photo + post ids", async () => {
    let capturedBody: unknown;
    let capturedUrl: URL | undefined;
    server.use(
      http.post(`${BASE_URL}/v21.0/page-123/photos`, async ({ request }) => {
        capturedUrl = new URL(request.url);
        capturedBody = await request.json();
        return HttpResponse.json({ id: "photo-1", post_id: "page-123_post-1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await publishPhotoToFacebookPage(client, {
      pageId: "page-123",
      pageAccessToken: "page-token",
      imageUrl: "https://img.test/product.png",
      caption: "New arrivals!",
    });

    expect(capturedBody).toEqual({ url: "https://img.test/product.png", caption: "New arrivals!" });
    expect(capturedUrl?.searchParams.get("access_token")).toBe("page-token");
    expect(result).toEqual({ photoId: "photo-1", postId: "page-123_post-1" });
  });

  it("omits the caption field entirely when none is provided", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/page-123/photos`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "photo-2" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await publishPhotoToFacebookPage(client, {
      pageId: "page-123",
      pageAccessToken: "page-token",
      imageUrl: "https://img.test/product.png",
    });

    expect(capturedBody).toEqual({ url: "https://img.test/product.png" });
    expect(result).toEqual({ photoId: "photo-2", postId: null });
  });

  it("propagates a non-retryable auth error for an expired page token", async () => {
    server.use(
      http.post(`${BASE_URL}/v21.0/page-123/photos`, () =>
        HttpResponse.json(
          { error: { message: "Error validating access token", type: "OAuthException", code: 190 } },
          { status: 401 },
        ),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await publishPhotoToFacebookPage(client, {
      pageId: "page-123",
      pageAccessToken: "expired-token",
      imageUrl: "https://img.test/product.png",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("auth_error");
    expect(graphError.isRetryable).toBe(false);
  });

  it("propagates a non-retryable permanent error for an unfetchable image URL", async () => {
    server.use(
      http.post(`${BASE_URL}/v21.0/page-123/photos`, () =>
        HttpResponse.json(
          { error: { message: "Invalid parameter", type: "OAuthException", code: 100, error_subcode: 2069010 } },
          { status: 400 },
        ),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await publishPhotoToFacebookPage(client, {
      pageId: "page-123",
      pageAccessToken: "page-token",
      imageUrl: "https://img.test/does-not-exist.png",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("permanent");
    expect(graphError.isRetryable).toBe(false);
  });
});
