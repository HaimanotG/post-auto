import fastifyJwt from "@fastify/jwt";
import rawBody from "fastify-raw-body";
import Fastify, { type FastifyInstance } from "fastify";
import type { TelegramUserStore } from "./middleware/telegram-init-data.js";
import { registerAnalyticsRoutes, type AnalyticsStore } from "./routes/analytics.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerInboxRoutes, type InboxStore } from "./routes/inbox.js";
import { registerOAuthRoutes, type OAuthRoutesOptions, type OAuthStore } from "./routes/oauth.js";
import { registerPostsRoutes, type PostStore } from "./routes/posts.js";
import { registerWebhooksMetaRoutes, type WebhookEventStore, type WebhooksMetaRoutesOptions } from "./routes/webhooks-meta.js";

export interface BuildAppOptions {
  prisma: TelegramUserStore & OAuthStore & PostStore & WebhookEventStore & AnalyticsStore & InboxStore;
  telegramBotToken: string;
  jwtSecret: string;
  metaAppId: string;
  metaAppSecret: string;
  metaWebhookVerifyToken: string;
  tokenEncryptionKey: string;
  baseUrl: string;
  /** Used to build the t.me/<bot>?startapp=oauth_success deep link on the OAuth callback's "return to Telegram" screen. */
  telegramBotUsername?: string;
  /** Injectable for tests; forwarded to registerOAuthRoutes. */
  graphClient?: OAuthRoutesOptions["graphClient"];
  threadsFetchImpl?: OAuthRoutesOptions["threadsFetchImpl"];
  now?: OAuthRoutesOptions["now"];
  /** Injectable for tests; forwarded to registerWebhooksMetaRoutes. */
  enqueueProcessMetaWebhook?: WebhooksMetaRoutesOptions["enqueueProcessMetaWebhook"];
}

/**
 * Global raw-body capture: the Meta webhook route (POST /webhooks/meta) uses
 * this to verify X-Hub-Signature-256 against the exact bytes received, since
 * JSON.stringify(parsed body) is not guaranteed to byte-match what Meta
 * signed.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  await app.register(rawBody, {
    field: "rawBody",
    global: true,
    encoding: "utf8",
    runFirst: true,
  });

  await app.register(fastifyJwt, { secret: options.jwtSecret });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  registerAuthRoutes(app, {
    prisma: options.prisma,
    telegramBotToken: options.telegramBotToken,
  });

  registerOAuthRoutes(app, {
    prisma: options.prisma,
    metaAppId: options.metaAppId,
    metaAppSecret: options.metaAppSecret,
    tokenEncryptionKey: options.tokenEncryptionKey,
    baseUrl: options.baseUrl,
    telegramBotUsername: options.telegramBotUsername,
    graphClient: options.graphClient,
    threadsFetchImpl: options.threadsFetchImpl,
    now: options.now,
  });

  registerPostsRoutes(app, { prisma: options.prisma });

  registerAnalyticsRoutes(app, { prisma: options.prisma });

  registerInboxRoutes(app, { prisma: options.prisma });

  registerWebhooksMetaRoutes(app, {
    prisma: options.prisma,
    metaAppSecret: options.metaAppSecret,
    webhookVerifyToken: options.metaWebhookVerifyToken,
    enqueueProcessMetaWebhook: options.enqueueProcessMetaWebhook,
  });

  return app;
}
