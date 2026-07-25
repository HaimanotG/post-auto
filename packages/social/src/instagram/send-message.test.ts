import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "../graph-client.js";
import { sendInstagramMessage } from "./send-message.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("sendInstagramMessage", () => {
  it("sends an IG Direct reply via the ig-user-id messages endpoint", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-1/messages`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ recipient_id: "igsid-1", message_id: "mid.1" });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await sendInstagramMessage(client, {
      igUserId: "ig-user-1",
      pageAccessToken: "page-token",
      recipientId: "igsid-1",
      text: "Thanks for reaching out!",
    });

    expect(capturedBody).toEqual({ recipient: { id: "igsid-1" }, message: { text: "Thanks for reaching out!" } });
    expect(result).toEqual({ messageId: "mid.1" });
  });
});
