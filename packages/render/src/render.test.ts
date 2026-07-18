import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderSlide, renderTreeToPng, renderTreeToSvg, type SatoriTree } from "./render.js";
import { LocalFilesystemStorage } from "./storage.js";

// A minimal satori-compatible tree: satori accepts plain element objects
// shaped like React elements, so JSX isn't required to exercise it. The cast
// is needed because satori's own types are looser (plain objects) than the
// strict `ReactNode` union `SatoriTree` aliases.
function coloredBox(color: string): SatoriTree {
  return {
    type: "div",
    props: {
      style: { width: "100%", height: "100%", display: "flex", backgroundColor: color },
      children: [],
    },
  } as unknown as SatoriTree;
}

describe("renderTreeToSvg", () => {
  it("lays out a text-free tree into SVG markup without needing fonts", async () => {
    const svg = await renderTreeToSvg(coloredBox("#ff0000"), { width: 200, height: 100, fonts: [] });
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="100"');
  });
});

describe("renderTreeToPng", () => {
  it("rasterizes a tree to a non-empty PNG buffer with the right dimensions", async () => {
    const png = await renderTreeToPng(coloredBox("#00ff00"), { width: 300, height: 150, fonts: [] });
    expect(Buffer.isBuffer(png)).toBe(true);
    // PNG magic bytes.
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});

describe("renderSlide", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "postauto-render-slide-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("renders a tree and uploads it through the storage interface", async () => {
    const storage = new LocalFilesystemStorage({ baseDir });

    const result = await renderSlide({
      tree: coloredBox("#0000ff"),
      dimensions: { width: 1080, height: 1080 },
      fonts: [],
      storage,
      key: "posts/1/slide-0.png",
    });

    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.key).toBe("posts/1/slide-0.png");
    expect(result.url).toBe(`file://${join(baseDir, "posts/1/slide-0.png")}`);
  });
});
