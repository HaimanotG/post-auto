import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "../graph-client.js";
import { replyToFacebookComment } from "./reply-to-comment.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("replyToFacebookComment", () => {
  it("posts a reply comment and returns the new comment id", async () => {
    let capturedBody: unknown;
    let capturedUrl: URL | undefined;
    server.use(
      http.post(`${BASE_URL}/v21.0/comment-123/comments`, async ({ request }) => {
        capturedUrl = new URL(request.url);
        capturedBody = await request.json();
        return HttpResponse.json({ id: "reply-1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await replyToFacebookComment(client, {
      commentId: "comment-123",
      pageAccessToken: "page-token",
      message: "It's ETB 500!",
    });

    expect(capturedBody).toEqual({ message: "It's ETB 500!" });
    expect(capturedUrl?.searchParams.get("access_token")).toBe("page-token");
    expect(result).toEqual({ commentId: "reply-1" });
  });
});
