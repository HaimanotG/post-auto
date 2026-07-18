import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFilesystemStorage } from "./storage.js";

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
