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

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramWebAppUser; start_param?: string };
  ready: () => void;
  /** Opens a URL in Telegram's external browser rather than an in-app WebView. */
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
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

  useEffect(() => {
    let cancelled = false;

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
  }, [apiBaseUrl]);

  if (status.kind === "loading") {
    return <div role="status">Authenticating…</div>;
  }

  if (status.kind === "error") {
    return <div role="alert">{status.message}</div>;
  }

  return <AuthContext.Provider value={status.auth}>{children}</AuthContext.Provider>;
}
