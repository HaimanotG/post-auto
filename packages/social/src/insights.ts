/**
 * Normalized shape every per-platform engagement fetcher returns, matching
 * `engagement_snapshots`' counter columns 1:1 (see PLAN.md's data model and
 * packages/db/prisma/schema.prisma's EngagementSnapshot model).
 */
export interface EngagementMetrics {
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  reach: number;
  impressions: number;
}

interface InsightMetricValue {
  value?: number;
}

interface InsightMetricEntry {
  name: string;
  values?: InsightMetricValue[];
}

interface InsightsEdge {
  data?: InsightMetricEntry[];
}

/**
 * Reads a named metric out of a Graph API "insights" edge response, shared
 * by the Facebook Page, Instagram, and Threads fetchers below since all
 * three use the same `{ data: [{ name, values: [{ value }] }] }` shape for
 * per-metric insights, just with different metric names and hosts.
 */
export function extractInsightMetric(insights: InsightsEdge | undefined, metricName: string): number {
  const entry = insights?.data?.find((candidate) => candidate.name === metricName);
  const value = entry?.values?.[entry.values.length - 1]?.value;
  return typeof value === "number" ? value : 0;
}
