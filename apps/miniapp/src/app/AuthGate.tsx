import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface TelegramWebAppUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

export interface TelegramWebAppBackButton {
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramWebAppUser; start_param?: string };
  ready: () => void;
  /** Requests the mini app fill the full viewport height instead of Telegram's default half-expanded state. */
  expand?: () => void;
  /** Opens a URL in Telegram's external browser rather than an in-app WebView. */
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  /** The Telegram client's active appearance; drives the mini app's own light/dark theme tokens. */
  colorScheme?: "light" | "dark";
  /** Subscribes to Telegram client events, notably "themeChanged" when colorScheme flips. */
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
  /** Native hardware/gesture back control, shown when a screen has somewhere to go back to. */
  BackButton?: TelegramWebAppBackButton;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export interface AuthUser {
  id: string;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
}

export interface AuthState {
  token: string;
  user: AuthUser;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthGate");
  }
  return context;
}

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "authenticated"; auth: AuthState };

interface AuthResponse {
  token: string;
  user: AuthUser;
}

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface AuthGateProps {
  children: ReactNode;
  apiBaseUrl?: string;
}

/**
 * Gates the mini app behind POST /auth/telegram, authenticating with the
 * live window.Telegram.WebApp.initData on every mount rather than persisting
 * the resulting JWT across launches — per PLAN.md, a WebView has no reliable
 * cookie jar to lean on, so each relaunch re-sends fresh initData instead.
 */
export function AuthGate({ children, apiBaseUrl = DEFAULT_API_BASE_URL }: AuthGateProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });

    async function authenticate() {
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        if (!cancelled) {
          setStatus({ kind: "error", message: "Telegram initData is unavailable" });
        }
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/auth/telegram`, {
          method: "POST",
          headers: { "x-telegram-init-data": initData },
        });

        if (!response.ok) {
          throw new Error(`Authentication failed with status ${response.status}`);
        }

        const body = (await response.json()) as AuthResponse;
        if (!cancelled) {
          setStatus({ kind: "authenticated", auth: { token: body.token, user: body.user } });
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Authentication failed";
          setStatus({ kind: "error", message });
        }
      }
    }

    void authenticate();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, attempt]);

  if (status.kind === "loading") {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center bg-pa-bg text-[14.5px] text-pa-hint">
        Authenticating…
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-pa-bg px-6 text-center text-[14.5px] text-pa-destructive">
        {status.message}
        <button
          type="button"
          onClick={() => setAttempt((current) => current + 1)}
          className="rounded-lg bg-pa-link px-4 py-2 text-[14.5px] font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return <AuthContext.Provider value={status.auth}>{children}</AuthContext.Provider>;
}
