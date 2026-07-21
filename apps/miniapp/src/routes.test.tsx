import { RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, type TelegramWebApp } from "./app/AuthGate";
import { router } from "./routes";

function setTelegramWebApp(webApp: Partial<TelegramWebApp> | undefined) {
  window.Telegram = webApp ? ({ WebApp: webApp } as unknown as Window["Telegram"]) : undefined;
}

function mockAuthenticatedFetch(handlers: Record<string, () => Response | Promise<Response>>) {
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
      for (const [suffix, handler] of Object.entries(handlers)) {
        if (request.url.endsWith(suffix)) return handler();
      }
      throw new Error(`Unexpected fetch to ${request.url}`);
    }),
  );
}

async function renderRoute(path: string) {
  await router.navigate({ to: path });
  render(
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>,
  );
}

describe("routes", () => {
  beforeEach(() => {
    setTelegramWebApp({ initData: "auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc" });
  });

  afterEach(() => {
    setTelegramWebApp(undefined);
    vi.unstubAllGlobals();
  });

  it("renders the home screen with the Facebook connect button", async () => {
    mockAuthenticatedFetch({ "/oauth/status": () => new Response(JSON.stringify({ connected: [] }), { status: 200 }) });

    await renderRoute("/");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Connect your business account" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Connect Facebook" })).toBeInTheDocument();
  });

  it("renders the composer form", async () => {
    mockAuthenticatedFetch({});

    await renderRoute("/composer");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    });
  });

  it("renders the inbox screen from GET /inbox", async () => {
    mockAuthenticatedFetch({ "/inbox": () => new Response(JSON.stringify({ messages: [] }), { status: 200 }) });

    await renderRoute("/inbox");

    await waitFor(() => {
      expect(screen.getByText("No messages yet.")).toBeInTheDocument();
    });
  });

  it("renders the analytics dashboard from GET /analytics", async () => {
    mockAuthenticatedFetch({
      "/analytics": () =>
        new Response(
          JSON.stringify({ totals: { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 }, byPlatform: [], posts: [] }),
          { status: 200 },
        ),
    });

    await renderRoute("/analytics");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Totals" })).toBeInTheDocument();
    });
  });

  it("renders the marketplace placeholder", async () => {
    mockAuthenticatedFetch({});

    await renderRoute("/marketplace");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Marketplace" })).toBeInTheDocument();
    });
  });
});
