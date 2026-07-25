import { RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, type TelegramWebApp } from "../../app/AuthGate";
import { HomeScreen } from "./HomeScreen";

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

/** HomeScreen renders <Link>s to /composer and /inbox, which need a router context even in isolation. */
function renderHomeScreen() {
  const rootRoute = createRootRoute({ component: () => <HomeScreen apiBaseUrl="https://api.test" /> });
  const composerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/composer", component: () => null });
  const inboxRoute = createRoute({ getParentRoute: () => rootRoute, path: "/inbox", component: () => null });
  const router = createRouter({ routeTree: rootRoute.addChildren([composerRoute, inboxRoute]) });

  return render(
    <AuthGate apiBaseUrl="https://api.test">
      <RouterProvider router={router} />
    </AuthGate>,
  );
}

describe("HomeScreen", () => {
  beforeEach(() => {
    setTelegramWebApp({ initData: "auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc" });
  });

  afterEach(() => {
    setTelegramWebApp(undefined);
    vi.unstubAllGlobals();
  });

  it("shows the connect prompt when no account is linked", async () => {
    mockAuthenticatedFetch({ "/oauth/status": () => new Response(JSON.stringify({ connected: [] }), { status: 200 }) });

    renderHomeScreen();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Connect your business account" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Connect Facebook" })).toBeInTheDocument();
  });

  it("shows a greeting, connected accounts, and the needs-attention count once connected", async () => {
    mockAuthenticatedFetch({
      "/oauth/status": () =>
        new Response(
          JSON.stringify({ connected: [{ platform: "facebook_page", externalAccountId: "page-1", status: "active" }] }),
          { status: 200 },
        ),
      "/inbox": () =>
        new Response(
          JSON.stringify({
            messages: [{ status: "needs_attention" }, { status: "needs_attention" }, { status: "resolved" }],
          }),
          { status: 200 },
        ),
    });

    renderHomeScreen();

    await waitFor(() => {
      expect(screen.getByText("Hi, Haile")).toBeInTheDocument();
    });
    expect(screen.getByText("Facebook Page")).toBeInTheDocument();
    expect(screen.getByText("page-1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create a new post/ })).toHaveAttribute("href", "/composer");

    await waitFor(() => {
      expect(screen.getByText("2 messages need attention")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /2 messages need attention/ })).toHaveAttribute("href", "/inbox");
  });

  it("shows a distinct error state when the connection-status check fails, instead of a misleading connect prompt", async () => {
    mockAuthenticatedFetch({ "/oauth/status": () => new Response(null, { status: 500 }) });

    renderHomeScreen();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your connection status");
    });
    expect(screen.queryByRole("heading", { name: "Connect your business account" })).not.toBeInTheDocument();
  });

  it("shows an Instagram-not-linked notice and a Threads connect option when only Facebook is connected", async () => {
    mockAuthenticatedFetch({
      "/oauth/status": () =>
        new Response(
          JSON.stringify({
            connected: [
              { id: "acct_1", platform: "facebook_page", externalAccountId: "page-1", displayName: "My Shop", status: "active" },
            ],
          }),
          { status: 200 },
        ),
      "/inbox": () => new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    });

    renderHomeScreen();

    await waitFor(() => {
      expect(screen.getByText("My Shop")).toBeInTheDocument();
    });
    expect(screen.getByText("Instagram not linked")).toBeInTheDocument();
    expect(screen.getByText("Threads not connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect Facebook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Threads" })).toBeInTheDocument();
  });

  it("distinguishes two connected Facebook Pages by name and hints at per-account targeting", async () => {
    mockAuthenticatedFetch({
      "/oauth/status": () =>
        new Response(
          JSON.stringify({
            connected: [
              { id: "acct_1", platform: "facebook_page", externalAccountId: "page-1", displayName: "Shop A", status: "active" },
              { id: "acct_2", platform: "facebook_page", externalAccountId: "page-2", displayName: "Shop B", status: "active" },
            ],
          }),
          { status: 200 },
        ),
      "/inbox": () => new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    });

    renderHomeScreen();

    await waitFor(() => {
      expect(screen.getByText("Shop A")).toBeInTheDocument();
    });
    expect(screen.getByText("Shop B")).toBeInTheDocument();
    expect(screen.getByText(/2 Facebook Pages connected/)).toBeInTheDocument();
  });
});
