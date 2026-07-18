import { baseEnvSchema, createEnv } from "@postauto/shared";
import { z } from "zod";

export const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3000),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadEnv(source?: Record<string, string | undefined>): ApiEnv {
  return createEnv(apiEnvSchema, source);
}
