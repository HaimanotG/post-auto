import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFilesystemStorage, S3ObjectStorage } from "./index.js";

describe("LocalFilesystemStorage", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "postauto-render-storage-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("writes the file under baseDir and returns a file:// url by default", async () => {
    const storage = new LocalFilesystemStorage({ baseDir });
    const data = Buffer.from("fake-png-bytes");

    const result = await storage.upload("slides/post-1/slide-0.png", data, "image/png");

    expect(result.key).toBe("slides/post-1/slide-0.png");
    expect(result.url).toBe(`file://${join(baseDir, "slides/post-1/slide-0.png")}`);
    await expect(readFile(join(baseDir, "slides/post-1/slide-0.png"))).resolves.toEqual(data);
  });

  it("creates nested directories that don't exist yet", async () => {
    const storage = new LocalFilesystemStorage({ baseDir });
    await storage.upload("a/b/c/slide.png", Buffer.from("x"), "image/png");
    await expect(readFile(join(baseDir, "a/b/c/slide.png"))).resolves.toEqual(Buffer.from("x"));
  });

  it("builds urls from publicUrlBase when provided", async () => {
    const storage = new LocalFilesystemStorage({ baseDir, publicUrlBase: "https://cdn.example.com/renders/" });
    const result = await storage.upload("slide.png", Buffer.from("x"), "image/png");
    expect(result.url).toBe("https://cdn.example.com/renders/slide.png");
  });
});

describe("S3ObjectStorage", () => {
  function buildClient(): { client: S3Client; send: ReturnType<typeof vi.fn> } {
    const send = vi.fn().mockResolvedValue({});
    return { client: { send } as unknown as S3Client, send };
  }

  it("PUTs the object to the configured bucket/key and returns a publicUrlBase-prefixed url", async () => {
    const { client, send } = buildClient();
    const storage = new S3ObjectStorage({
      bucket: "postauto-renders",
      publicUrlBase: "https://cdn.example.com/renders",
      client,
    });
    const data = Buffer.from("fake-png-bytes");

    const result = await storage.upload("posts/post-1/slides/0/facebook-landscape.png", data, "image/png");

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(command.input).toEqual({
      Bucket: "postauto-renders",
      Key: "posts/post-1/slides/0/facebook-landscape.png",
      Body: data,
      ContentType: "image/png",
    });
    expect(result).toEqual({
      key: "posts/post-1/slides/0/facebook-landscape.png",
      url: "https://cdn.example.com/renders/posts/post-1/slides/0/facebook-landscape.png",
    });
  });

  it("strips trailing slashes from publicUrlBase before joining the key", async () => {
    const { client } = buildClient();
    const storage = new S3ObjectStorage({
      bucket: "postauto-renders",
      publicUrlBase: "https://cdn.example.com/renders/",
      client,
    });

    const result = await storage.upload("slide.png", Buffer.from("x"), "image/png");

    expect(result.url).toBe("https://cdn.example.com/renders/slide.png");
  });

  it("propagates a rejected upload without swallowing the error", async () => {
    const { client, send } = buildClient();
    send.mockRejectedValueOnce(new Error("access denied"));
    const storage = new S3ObjectStorage({
      bucket: "postauto-renders",
      publicUrlBase: "https://cdn.example.com/renders",
      client,
    });

    await expect(storage.upload("slide.png", Buffer.from("x"), "image/png")).rejects.toThrow("access denied");
  });
});
