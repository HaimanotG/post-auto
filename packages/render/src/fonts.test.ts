import { describe, expect, it } from "vitest";
import { loadDefaultFonts } from "./fonts.js";

describe("loadDefaultFonts", () => {
  it("loads a real bundled WOFF font satori can use", async () => {
    const fonts = await loadDefaultFonts();

    expect(fonts).toHaveLength(1);
    expect(fonts[0]?.name).toBe("Inter");
    expect(fonts[0]?.weight).toBe(400);
    expect(fonts[0]?.style).toBe("normal");
    const data = fonts[0]?.data as Buffer;
    expect(data.byteLength).toBeGreaterThan(0);
    // WOFF magic bytes ("wOFF").
    expect(data.subarray(0, 4).toString("ascii")).toBe("wOFF");
  });
});
