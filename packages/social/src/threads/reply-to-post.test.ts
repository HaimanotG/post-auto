import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "../graph-client.js";
import { replyToThreadsPost } from "./reply-to-post.js";

const BASE_URL = "https://graph.threads.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("replyToThreadsPost", () => {
  it("creates a reply container with reply_to_id, then publishes it", async () => {
    let capturedContainerBody: unknown;
    let capturedPublishBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/threads-user-1/threads`, async ({ request }) => {
        capturedContainerBody = await request.json();
        return HttpResponse.json({ id: "container-1" });
      }),
      http.post(`${BASE_URL}/v21.0/threads-user-1/threads_publish`, async ({ request }) => {
        capturedPublishBody = await request.json();
        return HttpResponse.json({ id: "reply-media-1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await replyToThreadsPost(client, {
      threadsUserId: "threads-user-1",
      accessToken: "threads-token",
      replyToId: "customer-reply-1",
      text: "It's ETB 500!",
    });

    expect(capturedContainerBody).toEqual({
      media_type: "TEXT",
      text: "It's ETB 500!",
      reply_to_id: "customer-reply-1",
    });
    expect(capturedPublishBody).toEqual({ creation_id: "container-1" });
    expect(result).toEqual({ mediaId: "reply-media-1" });
  });
});
