import type { GraphClient } from "../graph-client.js";
import { extractInsightMetric, type EngagementMetrics } from "../insights.js";

export interface FetchInstagramMediaEngagementParams {
  /** The published media's object id (`post_platform_variants.external_post_id`). */
  mediaId: string;
  /** Access token of the Page connected to this IG Business account. */
  pageAccessToken: string;
}

interface InstagramMediaEngagementResponse {
  like_count?: number;
  comments_count?: number;
  insights?: { data?: { name: string; values?: { value?: number }[] }[] };
}

/**
 * Pulls engagement metrics for a single Instagram media object via
 * `graph-client.ts` (see PLAN.md's collect-engagement-snapshots cron).
 * IG's media insights edge has no share-count metric, so `sharesCount` is
 * always 0 here -- a platform limitation, not a gap in this fetcher.
 */
export async function fetchInstagramMediaEngagement(
  client: GraphClient,
  params: FetchInstagramMediaEngagementParams,
): Promise<EngagementMetrics> {
  const response = await client.get<InstagramMediaEngagementResponse>(
    `/${params.mediaId}`,
    { fields: "like_count,comments_count,insights.metric(impressions,reach)" },
    params.pageAccessToken,
  );

  return {
    likesCount: response.data.like_count ?? 0,
    commentsCount: response.data.comments_count ?? 0,
    sharesCount: 0,
    impressions: extractInsightMetric(response.data.insights, "impressions"),
    reach: extractInsightMetric(response.data.insights, "reach"),
  };
}
