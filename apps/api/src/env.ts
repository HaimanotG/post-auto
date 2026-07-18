import { baseEnvSchema, createEnv } from "@postauto/shared";
import { z } from "zod";

export const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3000),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  JWT_SECRET: z.string().min(1),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadEnv(source?: Record<string, string | undefined>): ApiEnv {
  return createEnv(apiEnvSchema, source);
}
