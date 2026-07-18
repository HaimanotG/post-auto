import { PLATFORM_CAPTION_LIMITS, PLATFORMS, type Platform } from "@postauto/shared";
import { describe, expect, it } from "vitest";
import { adaptPostToPlatformVariant, adaptPostToPlatformVariants, PLATFORM_HASHTAG_LIMITS } from "./adapt-post.js";

const MEDIA_URLS = ["https://cdn.example.com/slide-1.png"];

describe("adaptPostToPlatformVariant", () => {
  it.each(PLATFORMS)("keeps a short caption untouched for %s", (platform) => {
    const variant = adaptPostToPlatformVariant(
      { captionMaster: "Fresh injera, made daily.", hashtags: ["freshfood", "addis"], mediaUrls: MEDIA_URLS },
      platform,
    );

    expect(variant.platform).toBe(platform);
    expect(variant.captionText.length).toBeLessThanOrEqual(PLATFORM_CAPTION_LIMITS[platform]);
    expect(variant.captionText.startsWith("Fresh injera, made daily.")).toBe(true);
    expect(variant.mediaUrls).toEqual(MEDIA_URLS);
  });

  it.each(PLATFORMS)("caps hashtags per platform convention for %s", (platform) => {
    const hashtags = ["one", "two", "three", "four", "five"];
    const variant = adaptPostToPlatformVariant({ captionMaster: "Caption", hashtags, mediaUrls: MEDIA_URLS }, platform);

    expect(variant.hashtags.length).toBe(Math.min(hashtags.length, PLATFORM_HASHTAG_LIMITS[platform]));
    for (const tag of variant.hashtags) {
      expect(tag.startsWith("#")).toBe(true);
    }
  });

  it("threads keeps only a single hashtag", () => {
    const variant = adaptPostToPlatformVariant(
      { captionMaster: "New menu today", hashtags: ["food", "addisababa", "ethiopianfood"], mediaUrls: MEDIA_URLS },
      "threads",
    );

    expect(variant.hashtags).toEqual(["#food"]);
  });

  it("normalizes hashtags by stripping existing # prefixes and blanks", () => {
    const variant = adaptPostToPlatformVariant(
      { captionMaster: "Caption", hashtags: ["#food", "  ", "##addis"], mediaUrls: MEDIA_URLS },
      "facebook_page",
    );

    expect(variant.hashtags).toEqual(["#food", "#addis"]);
  });

  it("truncates an over-limit caption for threads (binding 500-char constraint)", () => {
    const longCaption = "x".repeat(600);
    const variant = adaptPostToPlatformVariant(
      { captionMaster: longCaption, hashtags: ["deal"], mediaUrls: MEDIA_URLS },
      "threads",
    );

    expect(variant.captionText.length).toBeLessThanOrEqual(PLATFORM_CAPTION_LIMITS.threads);
    expect(variant.captionText).toContain("…");
    expect(variant.captionText.endsWith("#deal")).toBe(true);
  });

  it("truncates an over-limit caption for instagram (2200-char constraint)", () => {
    const longCaption = "y".repeat(2300);
    const variant = adaptPostToPlatformVariant(
      { captionMaster: longCaption, hashtags: [], mediaUrls: MEDIA_URLS },
      "instagram_business",
    );

    expect(variant.captionText.length).toBeLessThanOrEqual(PLATFORM_CAPTION_LIMITS.instagram_business);
    expect(variant.captionText.endsWith("…")).toBe(true);
  });

  it("does not truncate facebook's much larger 63206-char limit for a normal-length caption", () => {
    const caption = "z".repeat(1000);
    const variant = adaptPostToPlatformVariant(
      { captionMaster: caption, hashtags: ["sale"], mediaUrls: MEDIA_URLS },
      "facebook_page",
    );

    expect(variant.captionText).not.toContain("…");
    expect(variant.captionText.endsWith("#sale")).toBe(true);
  });

  it("falls back to hard truncation when hashtags alone can't fit the limit", () => {
    const platform: Platform = "threads";
    const hugeHashtag = "h".repeat(600);
    const variant = adaptPostToPlatformVariant(
      { captionMaster: "short", hashtags: [hugeHashtag], mediaUrls: MEDIA_URLS },
      platform,
    );

    expect(variant.captionText.length).toBeLessThanOrEqual(PLATFORM_CAPTION_LIMITS[platform]);
    expect(variant.captionText.endsWith("…")).toBe(true);
  });

  it("omits the hashtag separator entirely when there are no hashtags", () => {
    const variant = adaptPostToPlatformVariant(
      { captionMaster: "No tags here", hashtags: [], mediaUrls: MEDIA_URLS },
      "facebook_page",
    );

    expect(variant.captionText).toBe("No tags here");
  });
});

describe("adaptPostToPlatformVariants", () => {
  it("builds one variant per requested platform, preserving order", () => {
    const variants = adaptPostToPlatformVariants(
      { captionMaster: "Grand opening!", hashtags: ["grandopening"], mediaUrls: MEDIA_URLS },
      ["threads", "facebook_page", "instagram_business"],
    );

    expect(variants.map((v) => v.platform)).toEqual(["threads", "facebook_page", "instagram_business"]);
    expect(variants).toHaveLength(3);
  });
});
