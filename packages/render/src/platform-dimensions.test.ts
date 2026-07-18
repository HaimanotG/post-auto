import { describe, expect, it } from "vitest";
import { getPlatformDimension, listPlatformDimensions, supportsAspectRatio } from "./platform-dimensions.js";

describe("getPlatformDimension", () => {
  it("returns facebook's 1.91:1 landscape size", () => {
    expect(getPlatformDimension("facebook", "landscape")).toEqual({
      platform: "facebook",
      aspectRatio: "landscape",
      width: 1200,
      height: 628,
    });
  });

  it("returns facebook's 1:1 square size", () => {
    expect(getPlatformDimension("facebook", "square")).toEqual({
      platform: "facebook",
      aspectRatio: "square",
      width: 1080,
      height: 1080,
    });
  });

  it("returns instagram's 4:5 portrait size", () => {
    expect(getPlatformDimension("instagram", "portrait")).toEqual({
      platform: "instagram",
      aspectRatio: "portrait",
      width: 1080,
      height: 1350,
    });
  });

  it("mirrors instagram's sizes for threads", () => {
    const { width, height } = getPlatformDimension("instagram", "portrait");
    expect(getPlatformDimension("threads", "portrait")).toEqual({ platform: "threads", aspectRatio: "portrait", width, height });
    expect(getPlatformDimension("threads", "square")).toEqual({
      platform: "threads",
      aspectRatio: "square",
      width: 1080,
      height: 1080,
    });
  });

  it("throws for an aspect ratio a platform doesn't support", () => {
    expect(() => getPlatformDimension("facebook", "portrait")).toThrow(/Unsupported aspect ratio/);
    expect(() => getPlatformDimension("instagram", "landscape")).toThrow(/Unsupported aspect ratio/);
  });
});

describe("listPlatformDimensions", () => {
  it("lists both facebook aspect ratios", () => {
    const dims = listPlatformDimensions("facebook");
    expect(dims).toHaveLength(2);
    expect(dims.map((d) => d.aspectRatio).sort()).toEqual(["landscape", "square"]);
  });

  it("lists both instagram and threads aspect ratios", () => {
    expect(listPlatformDimensions("instagram")).toHaveLength(2);
    expect(listPlatformDimensions("threads")).toHaveLength(2);
  });
});

describe("supportsAspectRatio", () => {
  it("is true for supported combinations", () => {
    expect(supportsAspectRatio("facebook", "landscape")).toBe(true);
    expect(supportsAspectRatio("instagram", "portrait")).toBe(true);
  });

  it("is false for unsupported combinations", () => {
    expect(supportsAspectRatio("facebook", "portrait")).toBe(false);
    expect(supportsAspectRatio("instagram", "landscape")).toBe(false);
    expect(supportsAspectRatio("threads", "landscape")).toBe(false);
  });
});
