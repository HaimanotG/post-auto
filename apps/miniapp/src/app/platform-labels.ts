/** Mirrors the Platform enum in packages/db/prisma/schema.prisma; kept as string-keyed lookups so callers can stay on their own local literal types. */
export const PLATFORM_LABELS: Record<string, string> = {
  facebook_page: "Facebook",
  instagram_business: "Instagram",
  threads: "Threads",
};

export const PLATFORM_ACCOUNT_LABELS: Record<string, string> = {
  facebook_page: "Facebook Page",
  instagram_business: "Instagram Business",
  threads: "Threads",
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

export function platformAccountLabel(platform: string): string {
  return PLATFORM_ACCOUNT_LABELS[platform] ?? platform;
}
