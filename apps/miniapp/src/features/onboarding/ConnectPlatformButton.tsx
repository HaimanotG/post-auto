import { useState } from "react";
import { DEFAULT_API_BASE_URL } from "../../app/api-config";
import { useAuth } from "../../app/AuthGate";
import { platformLabel } from "../../app/platform-labels";
import { Toast } from "../../app/Toast";

/** Mirrors apps/api/src/routes/oauth.ts's OAuthInitiablePlatform -- the two platforms with their own `/oauth/:platform/start` grant. Instagram rides along on facebook_page's grant, so it has no button of its own. */
export type OAuthInitiablePlatform = "facebook_page" | "threads";

export interface ConnectPlatformButtonProps {
  apiBaseUrl?: string;
  platform: OAuthInitiablePlatform;
  /** "primary" (default) for the main onboarding CTA; "secondary" for a lower-emphasis reconnect/add-another-platform action alongside already-connected accounts. */
  variant?: "primary" | "secondary";
  /** Overrides the default "Connect {label}" text -- e.g. "Reconnect Facebook" when re-running the grant to refresh a linked Instagram account. */
  label?: string;
}

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

interface StartOAuthResponse {
  authorizationUrl: string;
}

const VARIANT_CLASSNAME: Record<"primary" | "secondary", string> = {
  primary: "bg-pa-button text-pa-button-text",
  secondary: "border-[1.4px] border-dashed border-pa-hint text-pa-link",
};

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
 * Starts one of Meta's two independent OAuth grants (see routes/oauth.ts):
 * `facebook_page` covers both the Facebook Page and its linked Instagram
 * Business account in one grant, `threads` has its own separate grant. Both
 * share the same start -> external browser -> return-to-Telegram ->
 * OAuthStatusPoller round trip, so this one component drives either.
 */
export function ConnectPlatformButton({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  platform,
  variant = "primary",
  label: labelOverride,
}: ConnectPlatformButtonProps) {
  const { token } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const label = platformLabel(platform);
  const buttonText = labelOverride ?? `Connect ${label}`;

  async function handleClick() {
    setStatus({ kind: "loading" });
    try {
      const response = await fetch(`${apiBaseUrl}/oauth/${platform}/start`, {
        headers: { authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to start ${label} connection with status ${response.status}`);
      }

      const body = (await response.json()) as StartOAuthResponse;
      openInExternalBrowser(body.authorizationUrl);
      setStatus({ kind: "idle" });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to start ${label} connection`;
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={status.kind === "loading"}
        className={`mt-2.5 w-full rounded-xl px-4 py-3.5 text-base font-semibold disabled:opacity-60 ${VARIANT_CLASSNAME[variant]}`}
      >
        {status.kind === "loading" ? `Opening ${label}…` : buttonText}
      </button>
      {status.kind === "error" && <Toast kind="alert">{status.message}</Toast>}
    </div>
  );
}
