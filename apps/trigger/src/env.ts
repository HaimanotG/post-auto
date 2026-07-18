import { baseEnvSchema, createEnv } from "@postauto/shared";
import { z } from "zod";

export const triggerEnvSchema = baseEnvSchema.extend({
  /** Decrypts `social_accounts.access_token_encrypted` before Graph API calls. See packages/shared/src/crypto.ts. */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "must be 32 raw bytes hex-encoded (64 hex chars) — generate with `openssl rand -hex 32`"),
});

export type TriggerEnv = z.infer<typeof triggerEnvSchema>;

export function loadEnv(source?: Record<string, string | undefined>): TriggerEnv {
  return createEnv(triggerEnvSchema, source);
}
