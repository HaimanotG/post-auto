import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "../graph-client.js";
import { sendFacebookMessage } from "./send-message.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("sendFacebookMessage", () => {
  it("sends a Messenger DM via the Send API", async () => {
    let capturedBody: unknown;
    let capturedUrl: URL | undefined;
    server.use(
      http.post(`${BASE_URL}/v21.0/me/messages`, async ({ request }) => {
        capturedUrl = new URL(request.url);
        capturedBody = await request.json();
        return HttpResponse.json({ recipient_id: "psid-1", message_id: "mid.1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await sendFacebookMessage(client, {
      pageAccessToken: "page-token",
      recipientId: "psid-1",
      text: "Thanks for reaching out!",
    });

    expect(capturedBody).toEqual({ recipient: { id: "psid-1" }, message: { text: "Thanks for reaching out!" } });
    expect(capturedUrl?.searchParams.get("access_token")).toBe("page-token");
    expect(result).toEqual({ messageId: "mid.1" });
  });
});
