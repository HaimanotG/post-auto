import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface UploadResult {
  key: string;
  url: string;
}

/**
 * Object storage boundary used by render.ts. Swapping the backend (local
 * filesystem for dev, S3-compatible for production) means implementing this
 * interface, not touching render.ts's callers.
 */
export interface ObjectStorage {
  upload(key: string, data: Buffer, contentType: string): Promise<UploadResult>;
}

export interface LocalFilesystemStorageOptions {
  /** Directory files are written under. Created if it doesn't exist. */
  baseDir: string;
  /** URL prefix returned for uploaded keys; defaults to a `file://` path. */
  publicUrlBase?: string;
}

export class LocalFilesystemStorage implements ObjectStorage {
  private readonly baseDir: string;
  private readonly publicUrlBase: string | undefined;

  constructor(options: LocalFilesystemStorageOptions) {
    this.baseDir = options.baseDir;
    this.publicUrlBase = options.publicUrlBase;
  }

  async upload(key: string, data: Buffer, _contentType: string): Promise<UploadResult> {
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    const url = this.publicUrlBase ? `${this.publicUrlBase.replace(/\/+$/, "")}/${key}` : `file://${filePath}`;
    return { key, url };
  }
}

export interface S3ObjectStorageOptions {
  bucket: string;
  region?: string;
  /** Custom endpoint for S3-compatible providers (Cloudflare R2, MinIO, DigitalOcean Spaces, etc.). Omit for real AWS S3. */
  endpoint?: string;
  /** Required by most S3-compatible providers (R2, MinIO); real AWS S3 doesn't need it. */
  forcePathStyle?: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /**
   * URL prefix uploaded keys are served from (a CDN domain or the bucket's
   * public endpoint). Required -- unlike LocalFilesystemStorage there's no
   * usable default, since object URLs aren't guessable from bucket/region
   * alone across providers.
   */
  publicUrlBase: string;
  /** Injectable for tests; defaults to a real S3Client built from the other options. */
  client?: S3Client;
}

/**
 * S3-compatible object storage: rendered slides need a publicly fetchable
 * HTTPS URL (Meta's Graph API fetches `imageUrl` server-side when publishing
 * a photo), which LocalFilesystemStorage's default `file://` URL can never
 * be. Works unmodified against AWS S3, Cloudflare R2, and any other
 * S3-compatible endpoint (MinIO, DigitalOcean Spaces, ...).
 */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string;

  constructor(options: S3ObjectStorageOptions) {
    this.bucket = options.bucket;
    this.publicUrlBase = options.publicUrlBase;
    this.client =
      options.client ??
      new S3Client({
        region: options.region ?? "auto",
        endpoint: options.endpoint,
        forcePathStyle: options.forcePathStyle,
        credentials: options.credentials,
      });
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
    return { key, url: `${this.publicUrlBase.replace(/\/+$/, "")}/${key}` };
  }
}
