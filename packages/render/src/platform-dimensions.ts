/**
 * Per-platform target render sizes (PLAN.md's "Carousel/slide rendering"
 * section). The same template+props gets re-rendered at each of these target
 * dimensions rather than cropping one raster, so output stays crisp.
 * Threads mirrors Instagram's sizes (no separate Threads media spec).
 */
export type Platform = "facebook" | "instagram" | "threads";

export type AspectRatioKey = "landscape" | "square" | "portrait";

export interface Dimensions {
  width: number;
  height: number;
}

export interface PlatformDimension extends Dimensions {
  platform: Platform;
  aspectRatio: AspectRatioKey;
}

// 1.91:1, Meta's recommended FB link/image landscape ratio.
const LANDSCAPE_1_91_1: Dimensions = { width: 1200, height: 628 };
// 1:1, shared square size across all three platforms.
const SQUARE_1_1: Dimensions = { width: 1080, height: 1080 };
// 4:5, IG's (and Threads') recommended portrait ratio.
const PORTRAIT_4_5: Dimensions = { width: 1080, height: 1350 };

const PLATFORM_DIMENSIONS: Record<Platform, Partial<Record<AspectRatioKey, Dimensions>>> = {
  facebook: {
    landscape: LANDSCAPE_1_91_1,
    square: SQUARE_1_1,
  },
  instagram: {
    portrait: PORTRAIT_4_5,
    square: SQUARE_1_1,
  },
  // Mirrors instagram per PLAN.md ("Threads mirrors IG").
  threads: {
    portrait: PORTRAIT_4_5,
    square: SQUARE_1_1,
  },
};

/** Returns the target dimensions for a platform + aspect ratio combination. */
export function getPlatformDimension(platform: Platform, aspectRatio: AspectRatioKey): PlatformDimension {
  const dimensions = PLATFORM_DIMENSIONS[platform][aspectRatio];
  if (!dimensions) {
    throw new Error(`Unsupported aspect ratio "${aspectRatio}" for platform "${platform}"`);
  }
  return { platform, aspectRatio, ...dimensions };
}

/** Returns every supported aspect ratio's dimensions for a platform. */
export function listPlatformDimensions(platform: Platform): PlatformDimension[] {
  return (Object.entries(PLATFORM_DIMENSIONS[platform]) as [AspectRatioKey, Dimensions][]).map(
    ([aspectRatio, dimensions]) => ({ platform, aspectRatio, ...dimensions }),
  );
}

/** True when a platform supports rendering at a given aspect ratio. */
export function supportsAspectRatio(platform: Platform, aspectRatio: AspectRatioKey): boolean {
  return PLATFORM_DIMENSIONS[platform][aspectRatio] !== undefined;
}
