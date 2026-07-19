import { describe, expect, it } from "vitest";
import { PrismaClient } from "./client";

describe("PrismaClient", () => {
  it("can be instantiated from the generated client without a live DATABASE_URL", () => {
    const client = new PrismaClient();
    expect(client).toBeInstanceOf(PrismaClient);
  });

  it("exposes model delegates for every M1 core table", () => {
    const client = new PrismaClient();
    expect(client.business).toBeDefined();
    expect(client.user).toBeDefined();
    expect(client.businessMember).toBeDefined();
    expect(client.socialAccount).toBeDefined();
    expect(client.oAuthState).toBeDefined();
    expect(client.post).toBeDefined();
    expect(client.postSourceAsset).toBeDefined();
    expect(client.postPlatformVariant).toBeDefined();
  });

  it("exposes the renderedSlide model delegate (m2-08)", () => {
    const client = new PrismaClient();
    expect(client.renderedSlide).toBeDefined();
  });

  it("exposes the inboxMessage, aiReplyDecision, and webhookEvent model delegates (m3-01)", () => {
    const client = new PrismaClient();
    expect(client.inboxMessage).toBeDefined();
    expect(client.aiReplyDecision).toBeDefined();
    expect(client.webhookEvent).toBeDefined();
  });
});
