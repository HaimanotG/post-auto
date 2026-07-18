import type { FastifyInstance } from "fastify";
import {
  createTelegramInitDataPreHandler,
  type TelegramUserStore,
} from "../middleware/telegram-init-data.js";

export interface AuthRoutesOptions {
  prisma: TelegramUserStore;
  telegramBotToken: string;
}

/**
 * POST /auth/telegram: verifies the Telegram initData header via the m1-02
 * preHandler (which also upserts the user), then mints a short-lived JWT
 * carrying the user's id so subsequent requests can authenticate with
 * `Authorization: Bearer <token>` instead of re-sending initData.
 */
export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const preHandler = createTelegramInitDataPreHandler(options.prisma, options.telegramBotToken);

  app.post("/auth/telegram", { preHandler }, async (request, reply) => {
    const user = request.telegramUser;
    if (!user) {
      await reply.code(401).send({ error: "Missing Telegram initData" });
      return;
    }

    const token = await reply.jwtSign(
      { sub: user.id, telegramUserId: user.telegramUserId.toString() },
      { expiresIn: "1h" },
    );

    return {
      token,
      user: {
        id: user.id,
        telegramUserId: user.telegramUserId.toString(),
        username: user.username,
        firstName: user.firstName,
        photoUrl: user.photoUrl,
      },
    };
  });
}
