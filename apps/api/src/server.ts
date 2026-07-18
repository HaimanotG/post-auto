import { prisma } from "@postauto/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({
    prisma,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    jwtSecret: env.JWT_SECRET,
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
