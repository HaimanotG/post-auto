import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_HEADER_PREFIX = "sha256=";

/**
 * Verifies Meta's `X-Hub-Signature-256` webhook signature: HMAC-SHA256 of the
 * exact raw request body bytes, keyed by the Meta App Secret
 * (https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads).
 * Must run against the raw body string as received, not a re-serialized
 * JSON.stringify(parsedBody), since Meta signs exactly the bytes it sent over
 * the wire and re-serialization is not guaranteed to byte-match.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_HEADER_PREFIX)) {
    return false;
  }

  const providedHex = signatureHeader.slice(SIGNATURE_HEADER_PREFIX.length);
  const expectedHex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const providedBuffer = Buffer.from(providedHex, "hex");
  const expectedBuffer = Buffer.from(expectedHex, "hex");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
