import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface UploadResult {
  key: string;
  url: string;
}

/**
 * Object storage boundary used by render.ts. A local-filesystem
 * implementation is enough for now (PLAN.md's m2-04 scope); swapping to
 * real object storage (S3/R2/etc.) later means implementing this interface,
 * not touching render.ts's callers.
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
