import { LocalFilesystemStorage, S3ObjectStorage, type ObjectStorage } from "@postauto/storage";
import type { ApiEnv } from "../env.js";

/**
 * Chooses the phone-upload object storage backend from env: S3-compatible
 * (AWS S3, Cloudflare R2, MinIO, ...) when UPLOAD_STORAGE_BUCKET is
 * configured, else local disk (dev-only -- unsuitable in production since
 * Meta's Graph API needs the resulting URL to be publicly reachable over
 * HTTPS, which a local server's filesystem isn't). Mirrors apps/trigger's
 * tasks/render-slides.ts buildObjectStorage for RENDER_STORAGE_* -- kept
 * separate rather than shared since apps/api and apps/trigger don't
 * otherwise share env vars or a bucket.
 */
export function buildObjectStorage(env: ApiEnv): ObjectStorage {
  if (env.UPLOAD_STORAGE_BUCKET) {
    // env.ts's schema-level refine already guarantees UPLOAD_STORAGE_PUBLIC_URL_BASE
    // is set whenever UPLOAD_STORAGE_BUCKET is, so this is just narrowing the type.
    if (!env.UPLOAD_STORAGE_PUBLIC_URL_BASE) {
      throw new Error("UPLOAD_STORAGE_PUBLIC_URL_BASE is required when UPLOAD_STORAGE_BUCKET is set");
    }
    return new S3ObjectStorage({
      bucket: env.UPLOAD_STORAGE_BUCKET,
      region: env.UPLOAD_STORAGE_REGION,
      endpoint: env.UPLOAD_STORAGE_ENDPOINT,
      forcePathStyle: env.UPLOAD_STORAGE_FORCE_PATH_STYLE === "true",
      publicUrlBase: env.UPLOAD_STORAGE_PUBLIC_URL_BASE,
      credentials:
        env.UPLOAD_STORAGE_ACCESS_KEY_ID && env.UPLOAD_STORAGE_SECRET_ACCESS_KEY
          ? { accessKeyId: env.UPLOAD_STORAGE_ACCESS_KEY_ID, secretAccessKey: env.UPLOAD_STORAGE_SECRET_ACCESS_KEY }
          : undefined,
    });
  }
  return new LocalFilesystemStorage({ baseDir: env.UPLOAD_STORAGE_DIR ?? "/tmp/postauto-uploads" });
}
