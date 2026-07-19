import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "../test-utils/fixture-prisma.js";

const FIXTURE_JWT_SECRET = "fixture-jwt-secret-for-webhooks-tests";
const FIXTURE_BASE_URL = "https://api.fixture.test";
const META_APP_SECRET = "meta-app-secret";
const META_WEBHOOK_VERIFY_TOKEN = "meta-webhook-verify-token";

function signPayload(rawBody: string): string {
  return `sha256=${createHmac("sha256", META_APP_SECRET).update(rawBody, "utf8").digest("hex")}`;
}

async function buildFixtureApp(
  options: {
    prismaOverrides?: Parameters<typeof createFixturePrismaStore>[0];
    enqueueProcessMetaWebhook?: (webhookEventId: string) => Promise<unknown>;
  } = {},
) {
  const prisma = createFixturePrismaStore(options.prismaOverrides);
  const app = await buildApp({
    prisma,
    telegramBotToken: "fixture-bot-token",
    jwtSecret: FIXTURE_JWT_SECRET,
    metaAppId: "meta-app-id",
    metaAppSecret: META_APP_SECRET,
    metaWebhookVerifyToken: META_WEBHOOK_VERIFY_TOKEN,
    tokenEncryptionKey: FIXTURE_TOKEN_ENCRYPTION_KEY,
    baseUrl: FIXTURE_BASE_URL,
    // Always injected (even when a test doesn't care about it) so no test
    // ever falls through to the default implementation, which would make a
    // real network call to Trigger.dev Cloud.
    enqueueProcessMetaWebhook: options.enqueueProcessMetaWebhook ?? vi.fn().mockResolvedValue(undefined),
  });

  return { app, prisma };
}

describe("GET /webhooks/meta", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("echoes hub.challenge when mode + verify_token match", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/meta?hub.mode=subscribe&hub.verify_token=${META_WEBHOOK_VERIFY_TOKEN}&hub.challenge=12345`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("12345");
  });

  it("returns 403 when the verify_token does not match", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({
      method: "GET",
      url: "/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=12345",
    });

    expect(response.statusCode).toBe(403);
  });

  it("returns 403 when hub.mode is not subscribe", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({
      method: "GET",
      url: `/webhooks/meta?hub.mode=unsubscribe&hub.verify_token=${META_WEBHOOK_VERIFY_TOKEN}&hub.challenge=12345`,
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("POST /webhooks/meta", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("accepts a validly signed Page event, persists it, and enqueues process-meta-webhook", async () => {
    const webhookEventCreate = vi.fn().mockResolvedValue({ id: "webhook_event_1" });
    const enqueueProcessMetaWebhook = vi.fn().mockResolvedValue(undefined);
    ({ app } = await buildFixtureApp({
      prismaOverrides: { webhookEvent: { create: webhookEventCreate } },
      enqueueProcessMetaWebhook,
    }));

    const rawBody = JSON.stringify({
      object: "page",
      entry: [{ id: "page_1", changes: [{ field: "feed", value: { item: "comment" } }] }],
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta",
      headers: { "content-type": "application/json", "x-hub-signature-256": signPayload(rawBody) },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(webhookEventCreate).toHaveBeenCalledWith({
      data: { platform: "facebook_page", externalObjectType: "page", rawPayload: JSON.parse(rawBody) },
    });
    expect(enqueueProcessMetaWebhook).toHaveBeenCalledWith("webhook_event_1");
  });

  it.each([
    ["instagram", "instagram_business"],
    ["threads", "threads"],
  ])("maps object=%s to platform=%s", async (objectType, platform) => {
    const webhookEventCreate = vi.fn().mockResolvedValue({ id: "webhook_event_1" });
    ({ app } = await buildFixtureApp({ prismaOverrides: { webhookEvent: { create: webhookEventCreate } } }));

    const rawBody = JSON.stringify({ object: objectType, entry: [] });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta",
      headers: { "content-type": "application/json", "x-hub-signature-256": signPayload(rawBody) },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(webhookEventCreate).toHaveBeenCalledWith({
      data: { platform, externalObjectType: objectType, rawPayload: JSON.parse(rawBody) },
    });
  });

  it("rejects a missing signature header", async () => {
    const webhookEventCreate = vi.fn();
    ({ app } = await buildFixtureApp({ prismaOverrides: { webhookEvent: { create: webhookEventCreate } } }));

    const rawBody = JSON.stringify({ object: "page", entry: [] });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta",
      headers: { "content-type": "application/json" },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(401);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const webhookEventCreate = vi.fn();
    ({ app } = await buildFixtureApp({ prismaOverrides: { webhookEvent: { create: webhookEventCreate } } }));

    const rawBody = JSON.stringify({ object: "page", entry: [] });
    const wrongSignature = `sha256=${createHmac("sha256", "not-the-app-secret").update(rawBody, "utf8").digest("hex")}`;

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta",
      headers: { "content-type": "application/json", "x-hub-signature-256": wrongSignature },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(401);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("rejects a tampered payload whose body no longer matches its signature", async () => {
    const webhookEventCreate = vi.fn();
    ({ app } = await buildFixtureApp({ prismaOverrides: { webhookEvent: { create: webhookEventCreate } } }));

    const originalBody = JSON.stringify({ object: "page", entry: [] });
    const signature = signPayload(originalBody);
    const tamperedBody = JSON.stringify({ object: "page", entry: [{ injected: true }] });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: tamperedBody,
    });

    expect(response.statusCode).toBe(401);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("acks 200 without persisting for an unrecognized object type", async () => {
    const webhookEventCreate = vi.fn();
    ({ app } = await buildFixtureApp({ prismaOverrides: { webhookEvent: { create: webhookEventCreate } } }));

    const rawBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta",
      headers: { "content-type": "application/json", "x-hub-signature-256": signPayload(rawBody) },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("still acks 200 when persisted but the enqueue call fails", async () => {
    const webhookEventCreate = vi.fn().mockResolvedValue({ id: "webhook_event_1" });
    const enqueueProcessMetaWebhook = vi.fn().mockRejectedValue(new Error("trigger.dev unreachable"));
    ({ app } = await buildFixtureApp({
      prismaOverrides: { webhookEvent: { create: webhookEventCreate } },
      enqueueProcessMetaWebhook,
    }));

    const rawBody = JSON.stringify({ object: "page", entry: [] });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta",
      headers: { "content-type": "application/json", "x-hub-signature-256": signPayload(rawBody) },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(webhookEventCreate).toHaveBeenCalledTimes(1);
    expect(enqueueProcessMetaWebhook).toHaveBeenCalledTimes(1);
  });
});
