import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphApiError } from "../errors.js";
import { GraphClient } from "../graph-client.js";
import { publishCarouselToInstagram } from "./publish-carousel.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("publishCarouselToInstagram", () => {
  it("creates an item container per image, a CAROUSEL container, then publishes it", async () => {
    const mediaBodies: unknown[] = [];
    let mediaCallCount = 0;
    let publishBody: unknown;
    let publishUrl: URL | undefined;

    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-123/media`, async ({ request }) => {
        mediaCallCount += 1;
        const body = await request.json();
        mediaBodies.push(body);
        // 4th call is the parent CAROUSEL container; the first 3 are items.
        return HttpResponse.json({ id: mediaCallCount <= 3 ? `item-${mediaCallCount}` : "carousel-1" });
      }),
      http.post(`${BASE_URL}/v21.0/ig-user-123/media_publish`, async ({ request }) => {
        publishUrl = new URL(request.url);
        publishBody = await request.json();
        return HttpResponse.json({ id: "media-1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await publishCarouselToInstagram(client, {
      igUserId: "ig-user-123",
      pageAccessToken: "page-token",
      imageUrls: ["https://img.test/1.png", "https://img.test/2.png", "https://img.test/3.png"],
      caption: "New arrivals!",
    });

    expect(mediaBodies.slice(0, 3)).toEqual([
      { image_url: "https://img.test/1.png", is_carousel_item: true },
      { image_url: "https://img.test/2.png", is_carousel_item: true },
      { image_url: "https://img.test/3.png", is_carousel_item: true },
    ]);
    expect(mediaBodies[3]).toEqual({
      media_type: "CAROUSEL",
      children: "item-1,item-2,item-3",
      caption: "New arrivals!",
    });
    expect(publishBody).toEqual({ creation_id: "carousel-1" });
    expect(publishUrl?.searchParams.get("access_token")).toBe("page-token");
    expect(result).toEqual({ mediaId: "media-1" });
  });

  it("omits the caption field entirely when none is provided", async () => {
    let mediaCallCount = 0;
    const mediaBodies: unknown[] = [];
    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-123/media`, async ({ request }) => {
        mediaCallCount += 1;
        mediaBodies.push(await request.json());
        return HttpResponse.json({ id: mediaCallCount <= 2 ? `item-${mediaCallCount}` : "carousel-2" });
      }),
      http.post(`${BASE_URL}/v21.0/ig-user-123/media_publish`, () => HttpResponse.json({ id: "media-2" })),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    await publishCarouselToInstagram(client, {
      igUserId: "ig-user-123",
      pageAccessToken: "page-token",
      imageUrls: ["https://img.test/1.png", "https://img.test/2.png"],
    });

    expect(mediaBodies[2]).toEqual({ media_type: "CAROUSEL", children: "item-1,item-2" });
  });

  it("rejects fewer than 2 imageUrls without making any request", async () => {
    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-123/media`, () => {
        throw new Error("should not create a media container for a single-image carousel call");
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    await expect(
      publishCarouselToInstagram(client, {
        igUserId: "ig-user-123",
        pageAccessToken: "page-token",
        imageUrls: ["https://img.test/1.png"],
      }),
    ).rejects.toThrow(/at least 2/);
  });

  it("stops and never publishes when an item container fails partway through", async () => {
    let mediaCallCount = 0;
    let publishCalled = false;
    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-123/media`, () => {
        mediaCallCount += 1;
        if (mediaCallCount === 2) {
          return HttpResponse.json(
            { error: { message: "Invalid parameter", type: "OAuthException", code: 100 } },
            { status: 400 },
          );
        }
        return HttpResponse.json({ id: `item-${mediaCallCount}` });
      }),
      http.post(`${BASE_URL}/v21.0/ig-user-123/media_publish`, () => {
        publishCalled = true;
        return HttpResponse.json({ id: "media-3" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const error = await publishCarouselToInstagram(client, {
      igUserId: "ig-user-123",
      pageAccessToken: "page-token",
      imageUrls: ["https://img.test/1.png", "https://img.test/2.png", "https://img.test/3.png"],
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    expect(mediaCallCount).toBe(2);
    expect(publishCalled).toBe(false);
  });
});
