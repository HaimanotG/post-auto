import { useEffect, useState } from "react";
import { DEFAULT_API_BASE_URL } from "../../app/api-config";
import { useAuth } from "../../app/AuthGate";
import { Toast } from "../../app/Toast";

export interface ConnectedSocialAccount {
  id: string;
  platform: string;
  externalAccountId: string;
  displayName: string | null;
  status: string;
}

interface OAuthStatusResponse {
  connected: ConnectedSocialAccount[];
}

export interface OAuthStatusPollerProps {
  apiBaseUrl?: string;
  pollIntervalMs?: number;
  maxAttempts?: number;
  /** Injectable for tests; defaults to window.Telegram.WebApp.initDataUnsafe.start_param. */
  startParam?: string;
  /** Notifies a parent (e.g. HomeScreen) once polling finds a connected account, so it can drop its own stale "not connected" state without a second fetch. */
  onConnected?: (accounts: ConnectedSocialAccount[]) => void;
}

type PollState =
  | { kind: "inactive" }
  | { kind: "polling"; attempt: number }
  | { kind: "connected"; accounts: ConnectedSocialAccount[] }
  | { kind: "timed_out" }
  | { kind: "error"; message: string };

/**
 * The bot relaunches the mini app via t.me/<bot>?startapp=oauth_success
 * once the external-browser OAuth round trip finishes (see the "return to
 * Telegram" screen in apps/api/src/routes/oauth.ts). A WebView can't get
 * the result pushed to it, so on relaunch this polls GET /oauth/status
 * until the new social_accounts row shows up.
 */
export function OAuthStatusPoller({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  pollIntervalMs = 2000,
  maxAttempts = 10,
  startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param,
  onConnected,
}: OAuthStatusPollerProps) {
  const { token } = useAuth();
  const isActive = startParam === "oauth_success";
  const [state, setState] = useState<PollState>(isActive ? { kind: "polling", attempt: 0 } : { kind: "inactive" });

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function poll(attempt: number) {
      if (!cancelled) setState({ kind: "polling", attempt });
      try {
        const response = await fetch(`${apiBaseUrl}/oauth/status`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`Failed to check connection status with status ${response.status}`);
        }

        const body = (await response.json()) as OAuthStatusResponse;
        if (cancelled) return;

        if (body.connected.length > 0) {
          setState({ kind: "connected", accounts: body.connected });
          onConnected?.(body.connected);
          return;
        }

        if (attempt >= maxAttempts) {
          setState({ kind: "timed_out" });
          return;
        }

        timeoutId = setTimeout(() => void poll(attempt + 1), pollIntervalMs);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to check connection status";
        setState({ kind: "error", message });
      }
    }

    void poll(1);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, apiBaseUrl, token, pollIntervalMs, maxAttempts]);

  if (state.kind === "inactive") {
    return null;
  }

  if (state.kind === "polling") {
    return <Toast kind="status">Checking connection…</Toast>;
  }

  if (state.kind === "connected") {
    return <Toast kind="status">Connected {state.accounts.length} account(s).</Toast>;
  }

  if (state.kind === "timed_out") {
    return <Toast kind="alert">Still waiting for the connection to complete. Try again from the mini app.</Toast>;
  }

  return <Toast kind="alert">{state.message}</Toast>;
}
