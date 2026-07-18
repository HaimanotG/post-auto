import { PLATFORM_CAPTION_LIMITS, type Platform } from "@postauto/shared";

/**
 * Builds `post_platform_variants` rows from one master caption + hashtag list
 * + media set (see PLAN.md's M2 scope). Threads' 500-char cap is the binding
 * caption constraint; hashtag counts also vary per platform (Threads only
 * renders a single hashtag as a link, so extras are dropped rather than sent).
 */
export const PLATFORM_HASHTAG_LIMITS: Record<Platform, number> = {
  facebook_page: 3,
  instagram_business: 30,
  threads: 1,
};

const TRUNCATION_SUFFIX = "…";

export interface AdaptPostInput {
  captionMaster: string;
  hashtags?: string[];
  mediaUrls: string[];
}

export interface AdaptedPostVariant {
  platform: Platform;
  captionText: string;
  hashtags: string[];
  mediaUrls: string[];
}

function normalizeHashtag(tag: string): string {
  const trimmed = tag.trim().replace(/^#+/, "");
  return trimmed.length > 0 ? `#${trimmed}` : "";
}

function selectHashtagsForPlatform(hashtags: string[], platform: Platform): string[] {
  const limit = PLATFORM_HASHTAG_LIMITS[platform];
  return hashtags.map(normalizeHashtag).filter((tag) => tag.length > 0).slice(0, limit);
}

/**
 * Truncates the caption body (never the hashtag line) so the combined text
 * fits `limit`, preserving hashtags at the end for discovery. Falls back to
 * a hard truncation of the whole string only if hashtags alone can't fit.
 */
function composeCaptionText(captionMaster: string, hashtags: string[], limit: number): string {
  const hashtagLine = hashtags.join(" ");
  const separator = hashtagLine.length > 0 ? "\n\n" : "";
  const full = `${captionMaster}${separator}${hashtagLine}`;
  if (full.length <= limit) {
    return full;
  }

  const reservedForHashtags = separator.length + hashtagLine.length;
  const availableForCaption = limit - reservedForHashtags - TRUNCATION_SUFFIX.length;

  if (availableForCaption <= 0) {
    return full.slice(0, Math.max(limit - TRUNCATION_SUFFIX.length, 0)) + TRUNCATION_SUFFIX;
  }

  const truncatedCaption = captionMaster.slice(0, availableForCaption).trimEnd() + TRUNCATION_SUFFIX;
  return `${truncatedCaption}${separator}${hashtagLine}`;
}

export function adaptPostToPlatformVariant(input: AdaptPostInput, platform: Platform): AdaptedPostVariant {
  const hashtags = selectHashtagsForPlatform(input.hashtags ?? [], platform);
  const captionText = composeCaptionText(input.captionMaster, hashtags, PLATFORM_CAPTION_LIMITS[platform]);

  return {
    platform,
    captionText,
    hashtags,
    mediaUrls: input.mediaUrls,
  };
}

export function adaptPostToPlatformVariants(input: AdaptPostInput, platforms: Platform[]): AdaptedPostVariant[] {
  return platforms.map((platform) => adaptPostToPlatformVariant(input, platform));
}
