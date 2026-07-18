import { z } from "zod";

export const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");

/**
 * Base env vars every app/package shares. Apps extend this with their own
 * required vars (e.g. DATABASE_URL, TELEGRAM_BOT_TOKEN) via `createEnv`.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
});

export class EnvValidationError extends Error {
  constructor(issues: z.ZodIssue[]) {
    const details = issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    super(`Invalid environment variables:\n${details}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Parses `source` (defaults to process.env) against `schema`, throwing an
 * EnvValidationError listing every missing/invalid var on failure instead of
 * zod's default single-issue error.
 */
export function createEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined> = process.env,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}
