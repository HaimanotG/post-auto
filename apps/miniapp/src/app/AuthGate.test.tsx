import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, useAuth, type TelegramWebApp } from "./AuthGate";

function setTelegramWebApp(webApp: Partial<TelegramWebApp> | undefined) {
  window.Telegram = webApp ? ({ WebApp: webApp } as unknown as Window["Telegram"]) : undefined;
}

function Consumer() {
  const { token, user } = useAuth();
  return (
    <div>
      <span data-testid="token">{token}</span>
      <span data-testid="username">{user.username}</span>
    </div>
  );
}

describe("AuthGate", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    setTelegramWebApp(undefined);
    vi.unstubAllGlobals();
  });

  it("authenticates using window.Telegram.WebApp.initData and renders children", async () => {
    setTelegramWebApp({ initData: "auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc" });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "jwt-token",
          user: {
            id: "user-1",
            telegramUserId: "1",
            username: "haile",
            firstName: "Haile",
            photoUrl: null,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <Consumer />
      </AuthGate>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("token")).toHaveTextContent("jwt-token");
    });
    expect(screen.getByTestId("username")).toHaveTextContent("haile");

    expect(fetch).toHaveBeenCalledWith("https://api.test/auth/telegram", {
      method: "POST",
      headers: { "x-telegram-init-data": "auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc" },
    });
  });

  it("shows an error when Telegram initData is unavailable", async () => {
    setTelegramWebApp(undefined);

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <Consumer />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Telegram initData is unavailable");
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows an error when the auth request fails", async () => {
    setTelegramWebApp({ initData: "auth_date=1&user=%7B%22id%22%3A1%7D&hash=bad" });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

    render(
      <AuthGate apiBaseUrl="https://api.test">
        <Consumer />
      </AuthGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Authentication failed with status 401");
    });
  });
});
