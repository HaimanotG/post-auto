import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "../graph-client.js";
import { fetchInstagramMediaEngagement } from "./fetch-engagement.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchInstagramMediaEngagement", () => {
  it("maps like_count/comments_count/insights into EngagementMetrics with sharesCount always 0", async () => {
    server.use(
      http.get(`${BASE_URL}/v21.0/media-1`, () =>
        HttpResponse.json({
          like_count: 20,
          comments_count: 4,
          insights: {
            data: [
              { name: "impressions", values: [{ value: 900 }] },
              { name: "reach", values: [{ value: 600 }] },
            ],
          },
        }),
      ),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await fetchInstagramMediaEngagement(client, {
      mediaId: "media-1",
      pageAccessToken: "page-token",
    });

    expect(result).toEqual({ likesCount: 20, commentsCount: 4, sharesCount: 0, impressions: 900, reach: 600 });
  });

  it("defaults every field to 0 when the response is empty", async () => {
    server.use(http.get(`${BASE_URL}/v21.0/media-2`, () => HttpResponse.json({})));

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await fetchInstagramMediaEngagement(client, {
      mediaId: "media-2",
      pageAccessToken: "page-token",
    });

    expect(result).toEqual({ likesCount: 0, commentsCount: 0, sharesCount: 0, impressions: 0, reach: 0 });
  });
});
