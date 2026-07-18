import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphApiError } from "../errors.js";
import { GraphClient } from "../graph-client.js";
import { publishPhotoToInstagram } from "./publish-photo.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("publishPhotoToInstagram", () => {
  it("creates a media container then publishes it, returning the media id", async () => {
    let containerBody: unknown;
    let containerUrl: URL | undefined;
    let publishBody: unknown;
    let publishUrl: URL | undefined;

    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-123/media`, async ({ request }) => {
        containerUrl = new URL(request.url);
        containerBody = await request.json();
        return HttpResponse.json({ id: "container-1" });
      }),
      http.post(`${BASE_URL}/v21.0/ig-user-123/media_publish`, async ({ request }) => {
        publishUrl = new URL(request.url);
        publishBody = await request.json();
        return HttpResponse.json({ id: "media-1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await publishPhotoToInstagram(client, {
      igUserId: "ig-user-123",
      pageAccessToken: "page-token",
      imageUrl: "https://img.test/product.png",
      caption: "New arrivals!",
    });

    expect(containerBody).toEqual({ image_url: "https://img.test/product.png", caption: "New arrivals!" });
    expect(containerUrl?.searchParams.get("access_token")).toBe("page-token");
    expect(publishBody).toEqual({ creation_id: "container-1" });
    expect(publishUrl?.searchParams.get("access_token")).toBe("page-token");
    expect(result).toEqual({ mediaId: "media-1" });
  });

  it("omits the caption field entirely when none is provided", async () => {
    let containerBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-123/media`, async ({ request }) => {
        containerBody = await request.json();
        return HttpResponse.json({ id: "container-2" });
      }),
      http.post(`${BASE_URL}/v21.0/ig-user-123/media_publish`, () => HttpResponse.json({ id: "media-2" })),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await publishPhotoToInstagram(client, {
      igUserId: "ig-user-123",
      pageAccessToken: "page-token",
      imageUrl: "https://img.test/product.png",
    });

    expect(containerBody).toEqual({ image_url: "https://img.test/product.png" });
    expect(result).toEqual({ mediaId: "media-2" });
  });

  it("propagates a non-retryable auth error and never calls media_publish when the container step fails", async () => {
    let publishCalled = false;
    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-123/media`, () =>
        HttpResponse.json(
          { error: { message: "Error validating access token", type: "OAuthException", code: 190 } },
          { status: 401 },
        ),
      ),
      http.post(`${BASE_URL}/v21.0/ig-user-123/media_publish`, () => {
        publishCalled = true;
        return HttpResponse.json({ id: "media-3" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await publishPhotoToInstagram(client, {
      igUserId: "ig-user-123",
      pageAccessToken: "expired-token",
      imageUrl: "https://img.test/product.png",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("auth_error");
    expect(graphError.isRetryable).toBe(false);
    expect(publishCalled).toBe(false);
  });

  it("propagates a non-retryable permanent error when the publish step fails", async () => {
    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-123/media`, () => HttpResponse.json({ id: "container-4" })),
      http.post(`${BASE_URL}/v21.0/ig-user-123/media_publish`, () =>
        HttpResponse.json(
          { error: { message: "Media ID is not available", type: "OAuthException", code: 100 } },
          { status: 400 },
        ),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await publishPhotoToInstagram(client, {
      igUserId: "ig-user-123",
      pageAccessToken: "page-token",
      imageUrl: "https://img.test/product.png",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    const graphError = error as GraphApiError;
    expect(graphError.category).toBe("permanent");
    expect(graphError.isRetryable).toBe(false);
  });
});
