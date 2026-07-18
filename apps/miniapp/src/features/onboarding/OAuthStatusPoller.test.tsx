import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, type TelegramWebApp } from "../../app/AuthGate";
import { OAuthStatusPoller } from "./OAuthStatusPoller";

function setTelegramWebApp(webApp: Partial<TelegramWebApp> | undefined) {
  window.Telegram = webApp ? ({ WebApp: webApp } as unknown as Window["Telegram"]) : undefined;
}

function mockAuthenticatedFetch(onOauthStatus: (callCount: number) => Response | Promise<Response>) {
  let callCount = 0;
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
      if (request.url.endsWith("/oauth/status")) {
        callCount += 1;
        return onOauthStatus(callCount);
      }
      throw new Error(`Unexpected fetch to ${request.url}`);
    }),
  );
}

describe("OAuthStatusPoller", () => {
  beforeEach(() => {
    setTelegramWebApp({ initData: "auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc" });
  });

  afterEach(() => {
    setTelegramWebApp(undefined);
    vi.unstubAllGlobals();
  });

  it("renders nothing when the start_param is not oauth_success", async () => {
    mockAuthenticatedFetch(() => new Response(JSON.stringify({ connected: [] }), { status: 200 }));

    const { container } = render(
      <AuthGate apiBaseUrl="https://api.test">
        <OAuthStatusPoller apiBaseUrl="https://api.test" startParam={undefined} />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(container.textContent).toBe("");
    expect(fetch).not.toHaveBeenCalledWith("https://api.test/oauth/status", expect.anything());
  });

  it("polls /oauth/status until a connected account appears", async () => {
    mockAuthenticatedFetch((callCount) => {
      if (callCount === 1) {
        return new Response(JSON.stringify({ connected: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ connected: [{ platform: "facebook_page", externalAccountId: "page-1", status: "active" }] }),
        { status: 200 },
      );
    });

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <OAuthStatusPoller apiBaseUrl="https://api.test" startParam="oauth_success" pollIntervalMs={5} />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Connected 1 account(s).");
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/oauth/status",
      expect.objectContaining({ headers: { authorization: "Bearer jwt-token" } }),
    );
  });

  it("shows a timeout message after exhausting the maximum polling attempts", async () => {
    mockAuthenticatedFetch(() => new Response(JSON.stringify({ connected: [] }), { status: 200 }));

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <OAuthStatusPoller apiBaseUrl="https://api.test" startParam="oauth_success" pollIntervalMs={1} maxAttempts={2} />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Still waiting for the connection to complete. Try again from the mini app.",
      );
    });
  });

  it("shows an error when the status check fails", async () => {
    mockAuthenticatedFetch(() => new Response(null, { status: 500 }));

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <OAuthStatusPoller apiBaseUrl="https://api.test" startParam="oauth_success" />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to check connection status with status 500");
    });
  });
});
