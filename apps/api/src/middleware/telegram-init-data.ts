import { createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "@postauto/db";
import type { FastifyReply, FastifyRequest } from "fastify";

const TELEGRAM_INIT_DATA_HEADER = "x-telegram-init-data";
const MAX_AUTH_DATE_AGE_MS = 24 * 60 * 60 * 1000;

export class TelegramInitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramInitDataError";
  }
}

export interface TelegramWebAppUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

export interface VerifiedTelegramInitData {
  user: TelegramWebAppUser;
  authDate: Date;
  params: Record<string, string>;
}

function buildDataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

/**
 * Verifies Telegram Mini App initData per Telegram's documented algorithm:
 * secret_key = HMAC_SHA256(key="WebAppData", data=<bot_token>), then
 * hash = hex(HMAC_SHA256(key=secret_key, data=<sorted data-check-string>)).
 * Also rejects payloads whose auth_date is older than maxAgeMs (default 24h).
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options: { now?: Date; maxAgeMs?: number } = {},
): VerifiedTelegramInitData {
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? MAX_AUTH_DATE_AGE_MS;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new TelegramInitDataError("Missing hash field in initData");
  }

  const dataCheckString = buildDataCheckString(params);
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(hash, "hex");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new TelegramInitDataError("Invalid initData signature");
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    throw new TelegramInitDataError("Missing auth_date field in initData");
  }
  const authDateSeconds = Number(authDateRaw);
  if (!Number.isFinite(authDateSeconds)) {
    throw new TelegramInitDataError("Invalid auth_date field in initData");
  }
  const authDate = new Date(authDateSeconds * 1000);
  if (now.getTime() - authDate.getTime() > maxAgeMs) {
    throw new TelegramInitDataError("initData auth_date is stale");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new TelegramInitDataError("Missing user field in initData");
  }

  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new TelegramInitDataError("Malformed user field in initData");
  }
  if (typeof user.id !== "number") {
    throw new TelegramInitDataError("Malformed user field in initData");
  }

  return {
    user,
    authDate,
    params: Object.fromEntries(params.entries()),
  };
}

/**
 * Structural subset of PrismaClient this middleware needs. Kept narrow
 * (rather than `Pick<PrismaClient, "user">`, which pulls in every
 * UserDelegate method) so tests can pass a plain `{ user: { upsert } }` mock.
 */
export interface TelegramUserStore {
  user: {
    upsert(args: {
      where: { telegramUserId: bigint };
      update: { username: string | null; firstName: string | null; photoUrl: string | null };
      create: {
        telegramUserId: bigint;
        username: string | null;
        firstName: string | null;
        photoUrl: string | null;
      };
    }): Promise<User>;
  };
}

export async function upsertTelegramUser(
  prisma: TelegramUserStore,
  user: TelegramWebAppUser,
): Promise<User> {
  return prisma.user.upsert({
    where: { telegramUserId: BigInt(user.id) },
    update: {
      username: user.username ?? null,
      firstName: user.first_name ?? null,
      photoUrl: user.photo_url ?? null,
    },
    create: {
      telegramUserId: BigInt(user.id),
      username: user.username ?? null,
      firstName: user.first_name ?? null,
      photoUrl: user.photo_url ?? null,
    },
  });
}

declare module "fastify" {
  interface FastifyRequest {
    telegramInitData?: VerifiedTelegramInitData;
    telegramUser?: User;
  }
}

/**
 * Builds a Fastify preHandler that reads the `x-telegram-init-data` header,
 * verifies it, upserts the corresponding user, and attaches the result to
 * the request. Replies 401 without calling the route handler on failure.
 */
export function createTelegramInitDataPreHandler(prisma: TelegramUserStore, botToken: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers[TELEGRAM_INIT_DATA_HEADER];
    const initData = Array.isArray(header) ? header[0] : header;

    if (!initData) {
      await reply.code(401).send({ error: "Missing Telegram initData" });
      return;
    }

    try {
      const verified = verifyTelegramInitData(initData, botToken);
      const user = await upsertTelegramUser(prisma, verified.user);
      request.telegramInitData = verified;
      request.telegramUser = user;
    } catch (error) {
      const message =
        error instanceof TelegramInitDataError ? error.message : "Invalid Telegram initData";
      await reply.code(401).send({ error: message });
    }
  };
}
