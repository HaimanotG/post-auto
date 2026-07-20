import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "../graph-client.js";
import { fetchFacebookPostEngagement } from "./fetch-engagement.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchFacebookPostEngagement", () => {
  it("maps likes/comments/shares/insights into EngagementMetrics", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${BASE_URL}/v21.0/page-123_post-1`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({
          likes: { summary: { total_count: 12 } },
          comments: { summary: { total_count: 3 } },
          shares: { count: 2 },
          insights: {
            data: [
              { name: "post_impressions", values: [{ value: 500 }] },
              { name: "post_impressions_unique", values: [{ value: 300 }] },
            ],
          },
        });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await fetchFacebookPostEngagement(client, {
      postId: "page-123_post-1",
      pageAccessToken: "page-token",
    });

    expect(capturedUrl?.searchParams.get("access_token")).toBe("page-token");
    expect(result).toEqual({
      likesCount: 12,
      commentsCount: 3,
      sharesCount: 2,
      impressions: 500,
      reach: 300,
    });
  });

  it("defaults every field to 0 when the post has no engagement yet", async () => {
    server.use(http.get(`${BASE_URL}/v21.0/page-123_post-2`, () => HttpResponse.json({})));

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await fetchFacebookPostEngagement(client, {
      postId: "page-123_post-2",
      pageAccessToken: "page-token",
    });

    expect(result).toEqual({ likesCount: 0, commentsCount: 0, sharesCount: 0, impressions: 0, reach: 0 });
  });

  it("treats a missing shares field (Graph API omits it at zero shares) as 0", async () => {
    server.use(
      http.get(`${BASE_URL}/v21.0/page-123_post-3`, () =>
        HttpResponse.json({ likes: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } } }),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await fetchFacebookPostEngagement(client, {
      postId: "page-123_post-3",
      pageAccessToken: "page-token",
    });

    expect(result.sharesCount).toBe(0);
  });
});
