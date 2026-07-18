import { describe, expect, it } from "vitest";
import { PrismaClient } from "./client";

describe("PrismaClient", () => {
  it("can be instantiated from the generated client without a live DATABASE_URL", () => {
    const client = new PrismaClient();
    expect(client).toBeInstanceOf(PrismaClient);
  });
});
