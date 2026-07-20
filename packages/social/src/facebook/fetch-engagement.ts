import type { GraphClient } from "../graph-client.js";
import { extractInsightMetric, type EngagementMetrics } from "../insights.js";

export interface FetchFacebookPostEngagementParams {
  /** The feed post's object id (`post_platform_variants.external_post_id`). */
  postId: string;
  /** Page access token (not a user token). */
  pageAccessToken: string;
}

interface FacebookPostEngagementResponse {
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  /** Graph API omits this field entirely once a post has zero shares. */
  shares?: { count?: number };
  insights?: { data?: { name: string; values?: { value?: number }[] }[] };
}

/**
 * Pulls engagement metrics for a single Facebook Page feed post via
 * `graph-client.ts` (see PLAN.md's collect-engagement-snapshots cron).
 * `post_impressions`/`post_impressions_unique` are Meta's documented Page
 * post insights metrics for total impressions and unique reach.
 */
export async function fetchFacebookPostEngagement(
  client: GraphClient,
  params: FetchFacebookPostEngagementParams,
): Promise<EngagementMetrics> {
  const response = await client.get<FacebookPostEngagementResponse>(
    `/${params.postId}`,
    {
      fields:
        "likes.summary(true).limit(0),comments.summary(true).limit(0),shares,insights.metric(post_impressions,post_impressions_unique)",
    },
    params.pageAccessToken,
  );

  return {
    likesCount: response.data.likes?.summary?.total_count ?? 0,
    commentsCount: response.data.comments?.summary?.total_count ?? 0,
    sharesCount: response.data.shares?.count ?? 0,
    impressions: extractInsightMetric(response.data.insights, "post_impressions"),
    reach: extractInsightMetric(response.data.insights, "post_impressions_unique"),
  };
}
