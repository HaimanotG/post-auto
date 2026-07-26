import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphApiError } from "../errors.js";
import { GraphClient } from "../graph-client.js";
import { publishCarouselToFacebookPage } from "./publish-carousel.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("publishCarouselToFacebookPage", () => {
  it("uploads each image unpublished, then creates one feed post referencing all of them", async () => {
    const uploadedBodies: unknown[] = [];
    let uploadCount = 0;
    let feedBody: unknown;
    let feedUrl: URL | undefined;

    server.use(
      http.post(`${BASE_URL}/v21.0/page-123/photos`, async ({ request }) => {
        uploadCount += 1;
        uploadedBodies.push(await request.json());
        return HttpResponse.json({ id: `photo-${uploadCount}` });
      }),
      http.post(`${BASE_URL}/v21.0/page-123/feed`, async ({ request }) => {
        feedUrl = new URL(request.url);
        feedBody = await request.json();
        return HttpResponse.json({ id: "page-123_post-1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await publishCarouselToFacebookPage(client, {
      pageId: "page-123",
      pageAccessToken: "page-token",
      imageUrls: ["https://img.test/1.png", "https://img.test/2.png", "https://img.test/3.png"],
      caption: "New arrivals!",
    });

    expect(uploadCount).toBe(3);
    expect(uploadedBodies).toEqual([
      { url: "https://img.test/1.png", published: false },
      { url: "https://img.test/2.png", published: false },
      { url: "https://img.test/3.png", published: false },
    ]);
    expect(feedBody).toEqual({
      attached_media: [{ media_fbid: "photo-1" }, { media_fbid: "photo-2" }, { media_fbid: "photo-3" }],
      message: "New arrivals!",
    });
    expect(feedUrl?.searchParams.get("access_token")).toBe("page-token");
    expect(result).toEqual({ postId: "page-123_post-1" });
  });

  it("omits the message field entirely when no caption is provided", async () => {
    let uploadCount = 0;
    let feedBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/page-123/photos`, () => {
        uploadCount += 1;
        return HttpResponse.json({ id: `photo-${uploadCount}` });
      }),
      http.post(`${BASE_URL}/v21.0/page-123/feed`, async ({ request }) => {
        feedBody = await request.json();
        return HttpResponse.json({ id: "page-123_post-2" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    await publishCarouselToFacebookPage(client, {
      pageId: "page-123",
      pageAccessToken: "page-token",
      imageUrls: ["https://img.test/1.png", "https://img.test/2.png"],
    });

    expect(feedBody).toEqual({ attached_media: [{ media_fbid: "photo-1" }, { media_fbid: "photo-2" }] });
  });

  it("rejects fewer than 2 imageUrls without making any request", async () => {
    server.use(
      http.post(`${BASE_URL}/v21.0/page-123/photos`, () => {
        throw new Error("should not upload a photo for a single-image carousel call");
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    await expect(
      publishCarouselToFacebookPage(client, {
        pageId: "page-123",
        pageAccessToken: "page-token",
        imageUrls: ["https://img.test/1.png"],
      }),
    ).rejects.toThrow(/at least 2/);
  });

  it("stops uploading and never creates the feed post when an upload fails partway through", async () => {
    let uploadCount = 0;
    let feedCalled = false;
    server.use(
      http.post(`${BASE_URL}/v21.0/page-123/photos`, () => {
        uploadCount += 1;
        if (uploadCount === 2) {
          return HttpResponse.json(
            { error: { message: "Invalid parameter", type: "OAuthException", code: 100 } },
            { status: 400 },
          );
        }
        return HttpResponse.json({ id: `photo-${uploadCount}` });
      }),
      http.post(`${BASE_URL}/v21.0/page-123/feed`, () => {
        feedCalled = true;
        return HttpResponse.json({ id: "page-123_post-3" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await publishCarouselToFacebookPage(client, {
      pageId: "page-123",
      pageAccessToken: "page-token",
      imageUrls: ["https://img.test/1.png", "https://img.test/2.png", "https://img.test/3.png"],
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    expect(uploadCount).toBe(2);
    expect(feedCalled).toBe(false);
  });
});
