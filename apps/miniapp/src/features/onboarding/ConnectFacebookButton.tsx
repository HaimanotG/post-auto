import { useState } from "react";
import { useAuth } from "../../app/AuthGate";

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface ConnectFacebookButtonProps {
  apiBaseUrl?: string;
}

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

interface StartOAuthResponse {
  authorizationUrl: string;
}

/**
 * Opens the OAuth authorization URL in Telegram's external browser rather
 * than the in-app WebView — a WebView can't reliably postMessage back after
 * Meta's redirect (see PLAN.md's "Meta Graph API integration" section), so
 * the round trip has to leave the mini app entirely.
 */
function openInExternalBrowser(url: string): void {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.openLink) {
    webApp.openLink(url, { try_instant_view: false });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Starts the Facebook Page + Instagram Business OAuth grant (per PLAN.md,
 * one Meta App / one grant covers both) by fetching an authorization URL
 * from GET /oauth/facebook_page/start and handing it off to the external
 * browser. The callback's "return to Telegram" screen and /oauth/status
 * polling pick up from there.
 */
export function ConnectFacebookButton({ apiBaseUrl = DEFAULT_API_BASE_URL }: ConnectFacebookButtonProps) {
  const { token } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleClick() {
    setStatus({ kind: "loading" });
    try {
      const response = await fetch(`${apiBaseUrl}/oauth/facebook_page/start`, {
        headers: { authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to start Facebook connection with status ${response.status}`);
      }

      const body = (await response.json()) as StartOAuthResponse;
      openInExternalBrowser(body.authorizationUrl);
      setStatus({ kind: "idle" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start Facebook connection";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={status.kind === "loading"}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {status.kind === "loading" ? "Opening Facebook…" : "Connect Facebook"}
      </button>
      {status.kind === "error" && <p role="alert">{status.message}</p>}
    </div>
  );
}
