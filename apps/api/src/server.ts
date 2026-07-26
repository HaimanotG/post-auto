import { prisma } from "@postauto/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { buildObjectStorage } from "./lib/object-storage.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({
    prisma,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    jwtSecret: env.JWT_SECRET,
    metaAppId: env.META_APP_ID,
    metaAppSecret: env.META_APP_SECRET,
    threadsAppId: env.THREADS_APP_ID,
    threadsAppSecret: env.THREADS_APP_SECRET,
    metaWebhookVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
    tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
    baseUrl: env.API_BASE_URL,
    telegramBotUsername: env.TELEGRAM_BOT_USERNAME,
    corsOrigin: env.MINIAPP_ORIGIN?.split(",").map((origin) => origin.trim().replace(/\/+$/, "")),
    storage: buildObjectStorage(env),
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
