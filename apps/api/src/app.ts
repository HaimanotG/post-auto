import rawBody from "fastify-raw-body";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * Global raw-body capture: needed later so the Meta webhook route
 * (POST /webhooks/meta) can verify X-Hub-Signature-256 against the exact
 * bytes received, since JSON.stringify(parsed body) is not guaranteed to
 * byte-match what Meta signed.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  await app.register(rawBody, {
    field: "rawBody",
    global: true,
    encoding: "utf8",
    runFirst: true,
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
