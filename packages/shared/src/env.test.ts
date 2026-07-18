import { describe, expect, it } from "vitest";
import { z } from "zod";
import { baseEnvSchema, createEnv, EnvValidationError } from "./env.js";

const appEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
});

describe("createEnv", () => {
  it("parses a valid env source into a typed object", () => {
    const env = createEnv(appEnvSchema, {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@host:5432/db",
      PORT: "8080",
    });

    expect(env).toEqual({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@host:5432/db",
      PORT: 8080,
    });
  });

  it("applies defaults for optional vars", () => {
    const env = createEnv(appEnvSchema, {
      DATABASE_URL: "postgres://user:pass@host:5432/db",
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
  });

  it("throws an EnvValidationError listing every missing/invalid var", () => {
    let thrown: unknown;
    try {
      createEnv(appEnvSchema, {
        DATABASE_URL: "not-a-url",
        PORT: "not-a-number",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EnvValidationError);
    const message = (thrown as Error).message;
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("PORT");
  });

  it("reports a clear error when a required var is missing entirely", () => {
    expect(() => createEnv(appEnvSchema, { NODE_ENV: "test" })).toThrowError(
      /DATABASE_URL/,
    );
  });

  it("rejects an unrecognized NODE_ENV value", () => {
    expect(() =>
      createEnv(appEnvSchema, {
        NODE_ENV: "staging",
        DATABASE_URL: "postgres://user:pass@host:5432/db",
      }),
    ).toThrowError(EnvValidationError);
  });
});
