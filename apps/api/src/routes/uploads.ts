import { randomUUID } from "node:crypto";
import type { ObjectStorage } from "@postauto/storage";
import type { FastifyInstance } from "fastify";
import { requireAuthenticatedUser, resolveOwnedBusiness, type BusinessContextStore } from "../lib/business-context.js";

/** Maps accepted image MIME types to the file extension their storage key gets. */
const ALLOWED_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export interface UploadsRoutesOptions {
  prisma: BusinessContextStore;
  storage: ObjectStorage;
}

/**
 * POST /uploads: lets the composer attach a phone photo directly (see
 * PostComposer.tsx) instead of requiring a pasted image URL, which was a
 * real adoption barrier for the target user -- a small retailer posting from
 * a phone, not a desktop with somewhere to host an image first. Multipart
 * parsing is registered globally in app.ts via @fastify/multipart (with a
 * file-size limit); this route just pulls the single file off the request
 * and hands it to the same ObjectStorage boundary apps/trigger's
 * render-slides task uses (see packages/storage), keyed under
 * uploads/<businessId>/<uuid>.<ext> so uploads are namespaced per business.
 * Returns the resulting public URL, which the composer submits as the
 * asset's rawUrl exactly as if it had been pasted.
 */
export function registerUploadsRoutes(app: FastifyInstance, options: UploadsRoutesOptions): void {
  app.post("/uploads", async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply);
    if (!user) return;

    const file = await request.file();
    if (!file) {
      await reply.code(400).send({ error: "No file provided" });
      return;
    }

    // file.mimetype is the client-declared multipart Content-Type, not
    // content-sniffed -- a mismatched upload (non-image bytes labeled
    // image/jpeg) passes this check. Accepted risk: the allow-list (no svg)
    // already rules out the stored-XSS-via-SVG vector, and a bogus image
    // will simply fail Meta's Graph API fetch at publish time.
    const extension = ALLOWED_IMAGE_EXTENSIONS[file.mimetype];
    if (!extension) {
      await reply.code(400).send({ error: `Unsupported image type "${file.mimetype}"` });
      return;
    }

    // Throws (413, handled by Fastify's default error handler) if the file
    // exceeds the fileSize limit configured on the multipart plugin.
    const buffer = await file.toBuffer();

    const business = await resolveOwnedBusiness(options.prisma, user);
    const key = `uploads/${business.id}/${randomUUID()}.${extension}`;
    const result = await options.storage.upload(key, buffer, file.mimetype);

    await reply.code(201).send({ url: result.url });
  });
}
