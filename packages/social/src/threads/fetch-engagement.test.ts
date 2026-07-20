import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "../graph-client.js";
import { fetchThreadsMediaEngagement } from "./fetch-engagement.js";

const BASE_URL = "https://graph.threads.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchThreadsMediaEngagement", () => {
  it("maps the flat metric array into EngagementMetrics, reposts->sharesCount, views->impressions, reach always 0", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${BASE_URL}/v21.0/thread-1/insights`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({
          data: [
            { name: "likes", values: [{ value: 15 }] },
            { name: "replies", values: [{ value: 5 }] },
            { name: "reposts", values: [{ value: 2 }] },
            { name: "views", values: [{ value: 800 }] },
          ],
        });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await fetchThreadsMediaEngagement(client, {
      mediaId: "thread-1",
      accessToken: "threads-token",
    });

    expect(capturedUrl?.searchParams.get("metric")).toBe("likes,replies,reposts,views");
    expect(capturedUrl?.searchParams.get("access_token")).toBe("threads-token");
    expect(result).toEqual({ likesCount: 15, commentsCount: 5, sharesCount: 2, impressions: 800, reach: 0 });
  });

  it("defaults every field to 0 when the metric array is empty", async () => {
    server.use(http.get(`${BASE_URL}/v21.0/thread-2/insights`, () => HttpResponse.json({ data: [] })));

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await fetchThreadsMediaEngagement(client, {
      mediaId: "thread-2",
      accessToken: "threads-token",
    });

    expect(result).toEqual({ likesCount: 0, commentsCount: 0, sharesCount: 0, impressions: 0, reach: 0 });
  });
});
