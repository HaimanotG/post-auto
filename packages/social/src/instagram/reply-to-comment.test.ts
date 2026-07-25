import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "../graph-client.js";
import { replyToInstagramComment } from "./reply-to-comment.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("replyToInstagramComment", () => {
  it("posts a reply and returns the new comment id", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/ig-comment-1/replies`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "ig-reply-1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await replyToInstagramComment(client, {
      commentId: "ig-comment-1",
      pageAccessToken: "page-token",
      message: "It's ETB 500!",
    });

    expect(capturedBody).toEqual({ message: "It's ETB 500!" });
    expect(result).toEqual({ commentId: "ig-reply-1" });
  });
});
