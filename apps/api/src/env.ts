import { baseEnvSchema, createEnv } from "@postauto/shared";
import { z } from "zod";

export const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3000),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  /** Used to build the t.me/<bot>?startapp=... deep link on the OAuth "return to Telegram" screen. */
  TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(1),
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  /** Arbitrary string configured in the Meta App Dashboard's webhook subscription; echoed back during the GET /webhooks/meta verification handshake. */
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "must be 32 raw bytes hex-encoded (64 hex chars) — generate with `openssl rand -hex 32`"),
  API_BASE_URL: z.string().url(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadEnv(source?: Record<string, string | undefined>): ApiEnv {
  return createEnv(apiEnvSchema, source);
}
