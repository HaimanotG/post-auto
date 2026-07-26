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
  /** Threads API's own App ID/Secret (Meta App Dashboard > Threads API > Settings) -- distinct from META_APP_ID/META_APP_SECRET even though both live under the same Meta app; see routes/oauth.ts's OAuthRoutesOptions.threadsAppId doc comment. */
  THREADS_APP_ID: z.string().min(1),
  THREADS_APP_SECRET: z.string().min(1),
  /** Arbitrary string configured in the Meta App Dashboard's webhook subscription; echoed back during the GET /webhooks/meta verification handshake. */
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "must be 32 raw bytes hex-encoded (64 hex chars) — generate with `openssl rand -hex 32`"),
  API_BASE_URL: z.string().url(),
  /** Comma-separated list of origins allowed to call this API cross-origin, e.g. the mini app's Vercel URL(s). */
  MINIAPP_ORIGIN: z.string().min(1).optional(),
  /**
   * Object storage for phone-uploaded source photos (POST /uploads -- see
   * routes/uploads.ts). Same S3-compatible-or-local-disk shape as
   * apps/trigger's RENDER_STORAGE_* (see its env.ts) since Meta's Graph API
   * needs a publicly reachable HTTPS URL either way; kept as a separate
   * bucket config (rather than sharing RENDER_STORAGE_*) since this process
   * and apps/trigger don't otherwise share env vars.
   */
  UPLOAD_STORAGE_BUCKET: z.string().min(1).optional(),
  UPLOAD_STORAGE_REGION: z.string().min(1).optional(),
  UPLOAD_STORAGE_ENDPOINT: z.string().url().optional(),
  UPLOAD_STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
  UPLOAD_STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  UPLOAD_STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  UPLOAD_STORAGE_PUBLIC_URL_BASE: z.string().url().optional(),
  UPLOAD_STORAGE_DIR: z.string().min(1).optional(),
}).refine((env) => !env.UPLOAD_STORAGE_BUCKET || Boolean(env.UPLOAD_STORAGE_PUBLIC_URL_BASE), {
  message: "UPLOAD_STORAGE_PUBLIC_URL_BASE is required when UPLOAD_STORAGE_BUCKET is set",
  path: ["UPLOAD_STORAGE_PUBLIC_URL_BASE"],
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadEnv(source?: Record<string, string | undefined>): ApiEnv {
  return createEnv(apiEnvSchema, source);
}
