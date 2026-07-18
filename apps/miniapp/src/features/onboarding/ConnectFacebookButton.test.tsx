import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, type TelegramWebApp } from "../../app/AuthGate";
import { ConnectFacebookButton } from "./ConnectFacebookButton";

function setTelegramWebApp(webApp: Partial<TelegramWebApp> | undefined) {
  window.Telegram = webApp ? ({ WebApp: webApp } as unknown as Window["Telegram"]) : undefined;
}

function mockAuthenticatedFetch(onOauthStart: (request: Request) => Response | Promise<Response>) {
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
      if (request.url.endsWith("/oauth/facebook_page/start")) {
        return onOauthStart(request);
      }
      throw new Error(`Unexpected fetch to ${request.url}`);
    }),
  );
}

async function renderConnectButton() {
  render(
    <AuthGate apiBaseUrl="https://api.test">
      <ConnectFacebookButton apiBaseUrl="https://api.test" />
    </AuthGate>,
  );
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Connect Facebook" })).toBeInTheDocument();
  });
}

describe("ConnectFacebookButton", () => {
  beforeEach(() => {
    setTelegramWebApp({ initData: "auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc" });
  });

  afterEach(() => {
    setTelegramWebApp(undefined);
    vi.unstubAllGlobals();
  });

  it("fetches the authorization URL and opens it via Telegram.WebApp.openLink when available", async () => {
    const openLink = vi.fn();
    mockAuthenticatedFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ authorizationUrl: "https://www.facebook.com/v21.0/dialog/oauth?x=1" }), {
          status: 200,
        }),
      ),
    );
    window.Telegram = {
      ...window.Telegram,
      WebApp: { ...window.Telegram!.WebApp, openLink },
    } as unknown as Window["Telegram"];

    await renderConnectButton();

    fireEvent.click(screen.getByRole("button", { name: "Connect Facebook" }));

    await waitFor(() => {
      expect(openLink).toHaveBeenCalledWith("https://www.facebook.com/v21.0/dialog/oauth?x=1", {
        try_instant_view: false,
      });
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/oauth/facebook_page/start",
      expect.objectContaining({ headers: { authorization: "Bearer jwt-token" } }),
    );
  });

  it("falls back to window.open when Telegram.WebApp.openLink is unavailable", async () => {
    mockAuthenticatedFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ authorizationUrl: "https://www.facebook.com/v21.0/dialog/oauth?x=2" }), {
          status: 200,
        }),
      ),
    );
    const windowOpen = vi.fn();
    vi.stubGlobal("open", windowOpen);

    await renderConnectButton();
    fireEvent.click(screen.getByRole("button", { name: "Connect Facebook" }));

    await waitFor(() => {
      expect(windowOpen).toHaveBeenCalledWith(
        "https://www.facebook.com/v21.0/dialog/oauth?x=2",
        "_blank",
        "noopener,noreferrer",
      );
    });
  });

  it("shows an error when starting the OAuth flow fails", async () => {
    mockAuthenticatedFetch(() => Promise.resolve(new Response(null, { status: 500 })));

    await renderConnectButton();
    fireEvent.click(screen.getByRole("button", { name: "Connect Facebook" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to start Facebook connection with status 500");
    });
  });
});
