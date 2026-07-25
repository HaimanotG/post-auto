import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphClient } from "./graph-client.js";
import { FACEBOOK_PAGE_WEBHOOK_FIELDS, INSTAGRAM_WEBHOOK_FIELDS, subscribeToWebhooks } from "./subscribe-webhooks.js";

const BASE_URL = "https://graph.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("subscribeToWebhooks", () => {
  it("subscribes a Page to its default webhook fields", async () => {
    let capturedBody: unknown;
    let capturedUrl: URL | undefined;
    server.use(
      http.post(`${BASE_URL}/v21.0/page-123/subscribed_apps`, async ({ request }) => {
        capturedUrl = new URL(request.url);
        capturedBody = await request.json();
        return HttpResponse.json({ success: true });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await subscribeToWebhooks(client, {
      accountId: "page-123",
      accessToken: "page-token",
      subscribedFields: FACEBOOK_PAGE_WEBHOOK_FIELDS,
    });

    expect(capturedBody).toEqual({ subscribed_fields: "feed,mention,messages" });
    expect(capturedUrl?.searchParams.get("access_token")).toBe("page-token");
    expect(result).toEqual({ success: true });
  });

  it("subscribes an IG Business account to its default webhook fields", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE_URL}/v21.0/ig-user-1/subscribed_apps`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ success: true });
      }),
    );

    const client = new GraphClient({ baseUrl: BASE_URL });
    const result = await subscribeToWebhooks(client, {
      accountId: "ig-user-1",
      accessToken: "page-token",
      subscribedFields: INSTAGRAM_WEBHOOK_FIELDS,
    });

    expect(capturedBody).toEqual({ subscribed_fields: "comments,mentions,messages" });
    expect(result).toEqual({ success: true });
  });
});
