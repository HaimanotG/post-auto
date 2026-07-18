/**
 * Meta's `X-Business-Use-Case-Usage` response header reports rate-limit
 * consumption per business id, e.g.:
 *   { "<business_id>": [{ "type": "pages", "call_count": 82,
 *       "total_cputime": 40, "total_time": 40,
 *       "estimated_time_to_regain_access": 0 }] }
 * `call_count`/`total_cputime`/`total_time` are all percentages (0-100) of
 * the current rolling-window cap. See:
 * https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
 */
export interface BusinessUseCaseUsageMetric {
  type?: string;
  call_count: number;
  total_cputime: number;
  total_time: number;
  estimated_time_to_regain_access?: number;
}

export type BusinessUseCaseUsage = Record<string, BusinessUseCaseUsageMetric[]>;

export function parseBusinessUseCaseUsageHeader(headerValue: string | null | undefined): BusinessUseCaseUsage | null {
  if (!headerValue) return null;
  try {
    const parsed: unknown = JSON.parse(headerValue);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as BusinessUseCaseUsage;
  } catch {
    return null;
  }
}

/** The single highest percentage value seen across all metrics/business ids in a usage payload. */
export function peakUsagePercent(usage: BusinessUseCaseUsage | null): number {
  if (!usage) return 0;
  let peak = 0;
  for (const metrics of Object.values(usage)) {
    for (const metric of metrics) {
      peak = Math.max(peak, metric.call_count, metric.total_cputime, metric.total_time);
    }
  }
  return peak;
}

export function isApproachingRateLimit(usage: BusinessUseCaseUsage | null, thresholdPercent: number): boolean {
  return peakUsagePercent(usage) >= thresholdPercent;
}

/**
 * Backoff delay applied before the *next* request once usage crosses the
 * threshold. Scales linearly from 0 at the threshold to `maxDelayMs` at
 * 100% usage, so callers slow down progressively rather than either ignoring
 * the warning or halting entirely.
 */
export function computeBackoffMs(
  usage: BusinessUseCaseUsage | null,
  thresholdPercent: number,
  maxDelayMs: number,
): number {
  const peak = peakUsagePercent(usage);
  if (peak < thresholdPercent) return 0;
  const overageRatio = Math.min((peak - thresholdPercent) / (100 - thresholdPercent), 1);
  return Math.round(overageRatio * maxDelayMs);
}
