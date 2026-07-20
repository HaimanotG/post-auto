import type { GraphClient } from "../graph-client.js";
import { extractInsightMetric, type EngagementMetrics } from "../insights.js";

export interface FetchThreadsMediaEngagementParams {
  /** The published Threads media's object id (`post_platform_variants.external_post_id`). */
  mediaId: string;
  /** Threads user access token (Threads has its own OAuth grant, not a Page token). */
  accessToken: string;
}

interface ThreadsMediaEngagementResponse {
  data?: { name: string; values?: { value?: number }[] }[];
}

/**
 * Pulls engagement metrics for a single Threads post via the Threads
 * Insights API (`GET /{threads-media-id}/insights`), which -- unlike
 * Facebook/Instagram -- returns the metric array directly rather than
 * nested under an `insights` field. The caller is responsible for
 * constructing `client` with `baseUrl: "https://graph.threads.net"`, same as
 * `threads/publish-post.ts`. Threads has no separate "reach" metric, so it's
 * always 0 here; `sharesCount` is mapped from "reposts" as the closest
 * equivalent to a share on Threads.
 */
export async function fetchThreadsMediaEngagement(
  client: GraphClient,
  params: FetchThreadsMediaEngagementParams,
): Promise<EngagementMetrics> {
  const response = await client.get<ThreadsMediaEngagementResponse>(
    `/${params.mediaId}/insights`,
    { metric: "likes,replies,reposts,views" },
    params.accessToken,
  );

  return {
    likesCount: extractInsightMetric(response.data, "likes"),
    commentsCount: extractInsightMetric(response.data, "replies"),
    sharesCount: extractInsightMetric(response.data, "reposts"),
    impressions: extractInsightMetric(response.data, "views"),
    reach: 0,
  };
}
