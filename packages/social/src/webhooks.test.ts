import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaWebhookSignature } from "./webhooks.js";

const APP_SECRET = "fixture-app-secret";

function signPayload(rawBody: string, appSecret = APP_SECRET): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

describe("verifyMetaWebhookSignature", () => {
  it("accepts a correctly signed payload", () => {
    const rawBody = JSON.stringify({ object: "page", entry: [] });
    const signature = signPayload(rawBody);

    expect(verifyMetaWebhookSignature(rawBody, signature, APP_SECRET)).toBe(true);
  });

  it("rejects a payload signed with the wrong app secret", () => {
    const rawBody = JSON.stringify({ object: "page", entry: [] });
    const signature = signPayload(rawBody, "some-other-secret");

    expect(verifyMetaWebhookSignature(rawBody, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a tampered body whose signature no longer matches", () => {
    const rawBody = JSON.stringify({ object: "page", entry: [] });
    const signature = signPayload(rawBody);
    const tamperedBody = JSON.stringify({ object: "page", entry: [{ injected: true }] });

    expect(verifyMetaWebhookSignature(tamperedBody, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const rawBody = JSON.stringify({ object: "page", entry: [] });

    expect(verifyMetaWebhookSignature(rawBody, undefined, APP_SECRET)).toBe(false);
  });

  it("rejects a signature header missing the sha256= prefix", () => {
    const rawBody = JSON.stringify({ object: "page", entry: [] });
    const signature = signPayload(rawBody).replace("sha256=", "");

    expect(verifyMetaWebhookSignature(rawBody, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a malformed (non-hex) signature without throwing", () => {
    const rawBody = JSON.stringify({ object: "page", entry: [] });

    expect(verifyMetaWebhookSignature(rawBody, "sha256=not-hex-data!!", APP_SECRET)).toBe(false);
  });
});
