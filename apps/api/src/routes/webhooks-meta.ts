import type { Platform } from "@postauto/shared";
import { verifyMetaWebhookSignature } from "@postauto/social";
import { tasks } from "@trigger.dev/sdk/v3";
import type { FastifyInstance } from "fastify";

const SIGNATURE_HEADER = "x-hub-signature-256";

/**
 * Maps the top-level `object` field Meta's webhook payload envelope always
 * carries (https://developers.facebook.com/docs/graph-api/webhooks/getting-started)
 * to the `Platform` enum `webhook_events.platform` requires. Page comments/
 * mentions/messages arrive under "page", IG under "instagram", Threads
 * replies under "threads". Any other/unrecognized object type is ack'd
 * (200) without being persisted, since Meta disables subscriptions that
 * don't get a fast 200 regardless of whether we understood the payload.
 */
const META_OBJECT_TYPE_TO_PLATFORM: Record<string, Platform> = {
  page: "facebook_page",
  instagram: "instagram_business",
  threads: "threads",
};

interface StoredWebhookEvent {
  id: string;
}

/**
 * Structural subset of PrismaClient this route needs, mirroring the narrow
 * interface pattern used by routes/oauth.ts's OAuthStore / routes/posts.ts's
 * PostStore.
 */
export interface WebhookEventStore {
  webhookEvent: {
    create(args: {
      data: { platform: Platform; externalObjectType: string; rawPayload: unknown };
    }): Promise<StoredWebhookEvent>;
  };
}

export interface WebhooksMetaRoutesOptions {
  prisma: WebhookEventStore;
  metaAppSecret: string;
  /** Arbitrary string configured in the Meta App Dashboard's webhook subscription, echoed back on the GET verification handshake. */
  webhookVerifyToken: string;
  /**
   * Injectable for tests; defaults to enqueuing apps/trigger's
   * "process-meta-webhook" task (m3-03) via @trigger.dev/sdk. Triggering by
   * task-id string (rather than importing the task definition) keeps apps/api
   * from depending on apps/trigger.
   */
  enqueueProcessMetaWebhook?: (webhookEventId: string) => Promise<unknown>;
}

async function defaultEnqueueProcessMetaWebhook(webhookEventId: string): Promise<unknown> {
  return tasks.trigger("process-meta-webhook", { webhookEventId });
}

/**
 * Registers the single Meta webhook receiver per PLAN.md: GET handles the
 * one-time subscription verification handshake, POST validates
 * `X-Hub-Signature-256` against the raw request body, persists the raw
 * payload to `webhook_events` immediately (idempotent store, ack-speed), and
 * enqueues process-meta-webhook (m3-03) to normalize it into inbox_messages
 * asynchronously. Always acks quickly per Meta's requirements: an
 * unrecognized object type or a failed enqueue still returns 200 once the
 * raw payload is durably persisted, since webhook_events.processing_status
 * is the retry/reconciliation source of truth, not the HTTP response.
 */
export function registerWebhooksMetaRoutes(app: FastifyInstance, options: WebhooksMetaRoutesOptions): void {
  const enqueue = options.enqueueProcessMetaWebhook ?? defaultEnqueueProcessMetaWebhook;

  app.get("/webhooks/meta", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const mode = query["hub.mode"];
    const verifyToken = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode === "subscribe" && verifyToken === options.webhookVerifyToken && challenge) {
      await reply.type("text/plain").send(challenge);
      return;
    }

    await reply.code(403).send({ error: "Webhook verification failed" });
  });

  app.post("/webhooks/meta", async (request, reply) => {
    const rawBody = request.rawBody;
    if (typeof rawBody !== "string") {
      await reply.code(400).send({ error: "Missing raw request body" });
      return;
    }

    const signatureHeader = request.headers[SIGNATURE_HEADER];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!verifyMetaWebhookSignature(rawBody, signature, options.metaAppSecret)) {
      await reply.code(401).send({ error: "Invalid webhook signature" });
      return;
    }

    const body = request.body as { object?: string } | undefined;
    const objectType = body?.object;
    const platform = objectType ? META_OBJECT_TYPE_TO_PLATFORM[objectType] : undefined;

    if (!objectType || !platform) {
      request.log.warn({ objectType }, "Ignoring Meta webhook payload with unrecognized object type");
      await reply.code(200).send({ received: true });
      return;
    }

    const event = await options.prisma.webhookEvent.create({
      data: { platform, externalObjectType: objectType, rawPayload: body },
    });

    try {
      await enqueue(event.id);
    } catch (error) {
      request.log.error(error, "Failed to enqueue process-meta-webhook; webhook_events row persisted for retry");
    }

    await reply.code(200).send({ received: true });
  });
}
