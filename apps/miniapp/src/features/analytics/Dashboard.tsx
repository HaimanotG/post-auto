import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthGate";

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

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
    return <div role="status">Loading analytics…</div>;
  }

  if (status.kind === "error") {
    return <div role="alert">{status.message}</div>;
  }

  const { totals, byPlatform, posts } = status.data;

  return (
    <div>
      <section aria-label="Totals">
        <h2>Totals</h2>
        <dl>
          <div>
            <dt>Likes</dt>
            <dd>{totals.likes}</dd>
          </div>
          <div>
            <dt>Comments</dt>
            <dd>{totals.comments}</dd>
          </div>
          <div>
            <dt>Shares</dt>
            <dd>{totals.shares}</dd>
          </div>
          <div>
            <dt>Reach</dt>
            <dd>{totals.reach}</dd>
          </div>
          <div>
            <dt>Impressions</dt>
            <dd>{totals.impressions}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="By platform">
        <h2>By platform</h2>
        {byPlatform.length === 0 ? (
          <p>No published posts yet.</p>
        ) : (
          <ul>
            {byPlatform.map((platform) => (
              <li key={platform.platform}>
                {platform.platform}: {platform.likes} likes, {platform.comments} comments, {platform.shares} shares,{" "}
                {platform.reach} reach, {platform.impressions} impressions
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Posts">
        <h2>Posts</h2>
        {posts.length === 0 ? (
          <p>No posts yet.</p>
        ) : (
          <ul>
            {posts.map((post) => (
              <li key={post.postId}>
                <p>{post.captionMaster ?? "(no caption)"}</p>
                <ul>
                  {post.variants.map((variant) => (
                    <li key={variant.platform}>
                      {variant.platform} — {variant.variantStatus} — {variant.likes} likes
                      {variant.externalPermalink && (
                        <>
                          {" "}
                          <a href={variant.externalPermalink} target="_blank" rel="noreferrer">
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
