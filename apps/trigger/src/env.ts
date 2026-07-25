import { baseEnvSchema, createEnv } from "@postauto/shared";
import { z } from "zod";

export const triggerEnvSchema = baseEnvSchema.extend({
  /** Decrypts `social_accounts.access_token_encrypted` before Graph API calls. See packages/shared/src/crypto.ts. */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "must be 32 raw bytes hex-encoded (64 hex chars) — generate with `openssl rand -hex 32`"),
  /** Sends seller notifications (reconnect-needed, publish failures, AI escalations) via Telegram's sendMessage API. See packages/social/src/telegram/send-message.ts. */
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  /**
   * Rendered-slide object storage (see tasks/render-slides.ts). When
   * RENDER_STORAGE_BUCKET is set, slides upload to that S3-compatible bucket
   * (AWS S3, Cloudflare R2, MinIO, ...) and RENDER_STORAGE_PUBLIC_URL_BASE
   * becomes required -- Meta's Graph API fetches `imageUrl` over HTTPS
   * server-side, so the URL must be publicly reachable. When unset, falls
   * back to RENDER_STORAGE_DIR (or /tmp/postauto-render) on local disk,
   * which is only useful for local dev -- a Trigger.dev Cloud worker's
   * filesystem isn't publicly reachable or persistent across runs.
   */
  RENDER_STORAGE_BUCKET: z.string().min(1).optional(),
  RENDER_STORAGE_REGION: z.string().min(1).optional(),
  RENDER_STORAGE_ENDPOINT: z.string().url().optional(),
  RENDER_STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
  RENDER_STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  RENDER_STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  RENDER_STORAGE_PUBLIC_URL_BASE: z.string().url().optional(),
  RENDER_STORAGE_DIR: z.string().min(1).optional(),
}).refine((env) => !env.RENDER_STORAGE_BUCKET || Boolean(env.RENDER_STORAGE_PUBLIC_URL_BASE), {
  message: "RENDER_STORAGE_PUBLIC_URL_BASE is required when RENDER_STORAGE_BUCKET is set",
  path: ["RENDER_STORAGE_PUBLIC_URL_BASE"],
});

export type TriggerEnv = z.infer<typeof triggerEnvSchema>;

export function loadEnv(source?: Record<string, string | undefined>): TriggerEnv {
  return createEnv(triggerEnvSchema, source);
}
