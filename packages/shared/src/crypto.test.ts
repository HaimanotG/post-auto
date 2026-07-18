import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto.js";

const KEY = randomBytes(32).toString("hex");
const OTHER_KEY = randomBytes(32).toString("hex");

describe("encryptToken/decryptToken", () => {
  it("round-trips a plaintext token", () => {
    const ciphertext = encryptToken("EAAB...long-lived-page-token", KEY);
    expect(ciphertext).not.toContain("EAAB");
    expect(decryptToken(ciphertext, KEY)).toBe("EAAB...long-lived-page-token");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptToken("same-token", KEY);
    const b = encryptToken("same-token", KEY);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong key", () => {
    const ciphertext = encryptToken("secret-token", KEY);
    expect(() => decryptToken(ciphertext, OTHER_KEY)).toThrow();
  });

  it("fails to decrypt a tampered payload (auth tag mismatch)", () => {
    const ciphertext = encryptToken("secret-token", KEY);
    const [iv, body, tag] = ciphertext.split(":") as [string, string, string];
    const tampered = [iv, body.replace(/^./, body[0] === "0" ? "1" : "0"), tag].join(":");
    expect(() => decryptToken(tampered, KEY)).toThrow();
  });

  it("throws on a malformed payload", () => {
    expect(() => decryptToken("not-a-valid-payload", KEY)).toThrow(/Malformed/);
  });
});
