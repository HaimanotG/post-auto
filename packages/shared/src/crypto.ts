import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * Minimal AES-256-GCM helper for at-rest encryption of OAuth tokens before
 * they hit `social_accounts.access_token_encrypted` (see PLAN.md's data
 * model). `hexKey` must be 32 raw bytes hex-encoded (64 hex chars) — generate
 * one with `openssl rand -hex 32` and store it as TOKEN_ENCRYPTION_KEY.
 */
export function encryptToken(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), ciphertext.toString("hex"), authTag.toString("hex")].join(":");
}

export function decryptToken(payload: string, hexKey: string): string {
  const [ivHex, ciphertextHex, authTagHex] = payload.split(":");
  if (!ivHex || !ciphertextHex || !authTagHex) {
    throw new Error("Malformed encrypted token payload");
  }

  const key = Buffer.from(hexKey, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
