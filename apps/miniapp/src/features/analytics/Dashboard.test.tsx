import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, type TelegramWebApp } from "../../app/AuthGate";
import { Dashboard, type AnalyticsResponse } from "./Dashboard";

function setTelegramWebApp(webApp: Partial<TelegramWebApp> | undefined) {
  window.Telegram = webApp ? ({ WebApp: webApp } as unknown as Window["Telegram"]) : undefined;
}

function mockAuthenticatedFetch(onAnalytics: () => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url.endsWith("/auth/telegram")) {
        return new Response(
          JSON.stringify({
            token: "jwt-token",
            user: { id: "user-1", telegramUserId: "1", username: "haile", firstName: "Haile", photoUrl: null },
          }),
          { status: 200 },
        );
      }
      if (request.url.endsWith("/analytics")) {
        return onAnalytics();
      }
      throw new Error(`Unexpected fetch to ${request.url}`);
    }),
  );
}

const FIXTURE_ANALYTICS: AnalyticsResponse = {
  totals: { likes: 35, comments: 7, shares: 1, reach: 400, impressions: 550 },
  byPlatform: [
    { platform: "facebook_page", likes: 10, comments: 2, shares: 1, reach: 100, impressions: 150 },
    { platform: "instagram_business", likes: 25, comments: 5, shares: 0, reach: 300, impressions: 400 },
  ],
  posts: [
    {
      postId: "post_1",
      captionMaster: "Fresh tomatoes, 50 ETB/kg",
      variants: [
        {
          platform: "facebook_page",
          variantStatus: "published",
          externalPermalink: "https://facebook.com/p/1",
          capturedAt: "2026-07-19T09:00:00.000Z",
          likes: 10,
          comments: 2,
          shares: 1,
          reach: 100,
          impressions: 150,
        },
      ],
    },
  ],
};

describe("Dashboard", () => {
  beforeEach(() => {
    setTelegramWebApp({ initData: "auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc" });
  });

  afterEach(() => {
    setTelegramWebApp(undefined);
    vi.unstubAllGlobals();
  });

  it("shows a loading state before the analytics response resolves", async () => {
    let resolveAnalytics!: (response: Response) => void;
    mockAuthenticatedFetch(
      () => new Promise<Response>((resolve) => (resolveAnalytics = resolve)),
    );

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <Dashboard apiBaseUrl="https://api.test" />
      </AuthGate>,
    );

    expect(await screen.findByText("Loading analytics…")).toBeInTheDocument();

    // The loading text above comes from Dashboard's initial state, which
    // commits before its effect (the fetch that assigns resolveAnalytics)
    // has necessarily run — wait for that fetch directly instead of racing
    // it, or resolveAnalytics can still be unassigned here under CI timing.
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://api.test/analytics",
        expect.objectContaining({ headers: { authorization: "Bearer jwt-token" } }),
      );
    });

    resolveAnalytics(new Response(JSON.stringify(FIXTURE_ANALYTICS), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Totals" })).toBeInTheDocument();
    });
  });

  it("renders totals, per-platform breakdown, and per-post detail from the API response", async () => {
    mockAuthenticatedFetch(() => new Response(JSON.stringify(FIXTURE_ANALYTICS), { status: 200 }));

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <Dashboard apiBaseUrl="https://api.test" />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Totals" })).toBeInTheDocument();
    });

    const totalsSection = screen.getByRole("region", { name: "Totals" });
    expect(totalsSection).toHaveTextContent("35");
    expect(totalsSection).toHaveTextContent("550");

    const byPlatformSection = screen.getByRole("region", { name: "By platform" });
    expect(byPlatformSection).toHaveTextContent("facebook_page: 10 likes");
    expect(byPlatformSection).toHaveTextContent("instagram_business: 25 likes");

    const postsSection = screen.getByRole("region", { name: "Posts" });
    expect(postsSection).toHaveTextContent("Fresh tomatoes, 50 ETB/kg");
    expect(postsSection).toHaveTextContent("facebook_page — published — 10 likes");
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "https://facebook.com/p/1");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/analytics",
      expect.objectContaining({ headers: { authorization: "Bearer jwt-token" } }),
    );
  });

  it("renders empty states when the business has no data yet", async () => {
    mockAuthenticatedFetch(
      () =>
        new Response(
          JSON.stringify({ totals: { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 }, byPlatform: [], posts: [] }),
          { status: 200 },
        ),
    );

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <Dashboard apiBaseUrl="https://api.test" />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByText("No published posts yet.")).toBeInTheDocument();
    });
    expect(screen.getByText("No posts yet.")).toBeInTheDocument();
  });

  it("shows an error when the analytics request fails", async () => {
    mockAuthenticatedFetch(() => new Response(null, { status: 500 }));

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <Dashboard apiBaseUrl="https://api.test" />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to load analytics with status 500");
    });
  });
});
