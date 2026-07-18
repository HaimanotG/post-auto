export const PLATFORMS = ["facebook_page", "instagram_business", "threads"] as const;

/**
 * Max caption length per platform. Threads' 500-char limit is the binding
 * constraint when adapting one master caption across platforms (see PLAN.md).
 */
export const PLATFORM_CAPTION_LIMITS: Record<(typeof PLATFORMS)[number], number> = {
  facebook_page: 63206,
  instagram_business: 2200,
  threads: 500,
};

export const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
