import { useEffect, useState } from "react";
import { DEFAULT_API_BASE_URL } from "../../app/api-config";
import { useAuth } from "../../app/AuthGate";

/** Mirrors the Platform enum in packages/db/prisma/schema.prisma. */
export type AnalyticsPlatform = "facebook_page" | "instagram_business" | "threads";

export interface EngagementTotals {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
}

export interface PlatformTotals extends EngagementTotals {
  platform: AnalyticsPlatform;
}

export interface PostVariantAnalytics extends EngagementTotals {
  platform: AnalyticsPlatform;
  variantStatus: string;
  externalPermalink: string | null;
  capturedAt: string | null;
}

export interface PostAnalytics {
  postId: string;
  captionMaster: string | null;
  variants: PostVariantAnalytics[];
}

/** Shape returned by GET /analytics (apps/api/src/routes/analytics.ts). */
export interface AnalyticsResponse {
  totals: EngagementTotals;
  byPlatform: PlatformTotals[];
  posts: PostAnalytics[];
}

export interface DashboardProps {
  apiBaseUrl?: string;
}

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; data: AnalyticsResponse };

/**
 * Mini app analytics dashboard per PLAN.md's M4 scope: fetches GET
 * /analytics on mount and renders the business-wide totals, per-platform
 * breakdown, and per-post variant detail the route already aggregates
 * server-side (see apps/api/src/routes/analytics.ts) — no client-side
 * aggregation here.
 */
export function Dashboard({ apiBaseUrl = DEFAULT_API_BASE_URL }: DashboardProps) {
  const { token } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus({ kind: "loading" });
      try {
        const response = await fetch(`${apiBaseUrl}/analytics`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`Failed to load analytics with status ${response.status}`);
        }

        const data = (await response.json()) as AnalyticsResponse;
        if (!cancelled) setStatus({ kind: "loaded", data });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load analytics";
        setStatus({ kind: "error", message });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, token]);

  if (status.kind === "loading") {
    return <div role="status" className="px-4 py-6 text-center text-[14.5px] text-pa-hint">Loading analytics…</div>;
  }

  if (status.kind === "error") {
    return <div role="alert" className="px-4 py-6 text-center text-[14.5px] text-pa-destructive">{status.message}</div>;
  }

  const { totals, byPlatform, posts } = status.data;
  const statLabels: Array<[string, keyof typeof totals]> = [
    ["Likes", "likes"],
    ["Comments", "comments"],
    ["Shares", "shares"],
    ["Reach", "reach"],
    ["Impressions", "impressions"],
  ];

  return (
    <div className="px-4 pt-4 pb-6">
      <section aria-label="Totals">
        <h2 className="sr-only">Totals</h2>
        <dl className="mb-5 grid grid-cols-2 gap-2.5">
          {statLabels.map(([label, key]) => (
            <div key={key} className="rounded-[14px] bg-pa-secondary-bg p-3.5">
              <dt className="mb-1 text-[12.5px] text-pa-hint">{label}</dt>
              <dd className="text-[21px] font-bold text-pa-text">{totals[key]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="By platform">
        <h2 className="px-1 pb-2 text-[13px] font-semibold tracking-[0.4px] text-pa-hint uppercase">By platform</h2>
        {byPlatform.length === 0 ? (
          <p className="text-[14px] text-pa-hint">No published posts yet.</p>
        ) : (
          <ul className="mb-5 overflow-hidden rounded-[14px] bg-pa-secondary-bg">
            {byPlatform.map((platform) => (
              <li
                key={platform.platform}
                className="border-b border-pa-separator px-3.5 py-3 text-[13.5px] text-pa-text last:border-b-0"
              >
                {platform.platform}: {platform.likes} likes, {platform.comments} comments, {platform.shares} shares,{" "}
                {platform.reach} reach, {platform.impressions} impressions
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Posts">
        <h2 className="px-1 pb-2 text-[13px] font-semibold tracking-[0.4px] text-pa-hint uppercase">Recent posts</h2>
        {posts.length === 0 ? (
          <p className="text-[14px] text-pa-hint">No posts yet.</p>
        ) : (
          <ul>
            {posts.map((post) => (
              <li key={post.postId} className="mb-2.5 rounded-[14px] bg-pa-secondary-bg p-3.5">
                <p className="mb-2 text-[14.5px] text-pa-text">{post.captionMaster ?? "(no caption)"}</p>
                <ul>
                  {post.variants.map((variant) => (
                    <li
                      key={variant.platform}
                      className="border-t border-pa-separator py-1.5 text-[13px] text-pa-hint first:border-t-0"
                    >
                      {variant.platform} — {variant.variantStatus} — {variant.likes} likes
                      {variant.externalPermalink && (
                        <>
                          {" "}
                          <a href={variant.externalPermalink} target="_blank" rel="noreferrer" className="text-pa-link">
                            View
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
