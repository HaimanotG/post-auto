import fastifyJwt from "@fastify/jwt";
import rawBody from "fastify-raw-body";
import Fastify, { type FastifyInstance } from "fastify";
import type { TelegramUserStore } from "./middleware/telegram-init-data.js";
import { registerAuthRoutes } from "./routes/auth.js";

export interface BuildAppOptions {
  prisma: TelegramUserStore;
  telegramBotToken: string;
  jwtSecret: string;
}

/**
 * Global raw-body capture: needed later so the Meta webhook route
 * (POST /webhooks/meta) can verify X-Hub-Signature-256 against the exact
 * bytes received, since JSON.stringify(parsed body) is not guaranteed to
 * byte-match what Meta signed.
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

  return app;
}
