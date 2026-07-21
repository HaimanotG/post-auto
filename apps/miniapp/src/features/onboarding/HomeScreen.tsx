import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthGate";
import { ChevronRightIcon, ComposeIcon, FacebookIcon, GoodCheckIcon, InboxIcon } from "../../app/icons";
import { platformAccountLabel } from "../../app/platform-labels";
import { ConnectFacebookButton } from "./ConnectFacebookButton";
import { OAuthStatusPoller, type ConnectedSocialAccount } from "./OAuthStatusPoller";

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface HomeScreenProps {
  apiBaseUrl?: string;
}

interface InboxCountResponse {
  messages: Array<{ status: string }>;
}

type AccountsStatus = "loading" | "loaded" | "error";

/** Landing screen: the connect prompt when no social account is linked yet, or a greeting plus quick actions once one is. */
export function HomeScreen({ apiBaseUrl = DEFAULT_API_BASE_URL }: HomeScreenProps) {
  const { token, user } = useAuth();
  const [accountsStatus, setAccountsStatus] = useState<AccountsStatus>("loading");
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedSocialAccount[]>([]);
  const [needsAttentionCount, setNeedsAttentionCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${apiBaseUrl}/oauth/status`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Failed to load connection status with status ${response.status}`);
        const body = (await response.json()) as { connected: ConnectedSocialAccount[] };
        if (!cancelled) {
          setConnectedAccounts(body.connected);
          setAccountsStatus("loaded");
        }
      } catch {
        if (!cancelled) setAccountsStatus("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, token]);

  const connected = accountsStatus === "loaded" && connectedAccounts.length > 0;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;

    async function loadInboxCount() {
      try {
        const response = await fetch(`${apiBaseUrl}/inbox`, { headers: { authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const body = (await response.json()) as InboxCountResponse;
        if (!cancelled) {
          setNeedsAttentionCount(body.messages.filter((message) => message.status === "needs_attention").length);
        }
      } catch {
        // Quick action falls back to a generic label below.
      }
    }

    void loadInboxCount();
    return () => {
      cancelled = true;
    };
  }, [connected, apiBaseUrl, token]);

  if (accountsStatus === "loading") {
    return <div role="status">Loading…</div>;
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-3.5 px-7 pt-16 pb-7 text-center">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-pa-secondary-bg text-pa-link">
          <FacebookIcon />
        </div>
        <h1 className="text-xl font-bold text-pa-text">Connect your business account</h1>
        <p className="max-w-[280px] text-[14.5px] leading-normal text-pa-hint">
          PostAuto posts your product photos to Facebook, Instagram and Threads, and lets AI answer customer messages
          for you.
        </p>
        <ConnectFacebookButton apiBaseUrl={apiBaseUrl} />
        <p className="text-[12.5px] text-pa-hint">Opens Facebook login in your browser, then returns you here.</p>
        <OAuthStatusPoller apiBaseUrl={apiBaseUrl} onConnected={setConnectedAccounts} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-[18px] pb-6">
      <div className="px-1 pt-1 pb-0.5 text-[22px] font-bold text-pa-text">Hi, {user.firstName ?? "there"}</div>

      <div className="mt-3 overflow-hidden rounded-[14px] bg-pa-secondary-bg">
        {connectedAccounts.map((account) => (
          <div
            key={`${account.platform}-${account.externalAccountId}`}
            className="flex items-center gap-3 border-b border-pa-separator px-3.5 py-3.5 last:border-b-0"
          >
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-pa-bg">
              <GoodCheckIcon className="text-pa-good" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-pa-text">{platformAccountLabel(account.platform)}</div>
              <div className="truncate text-[12.5px] text-pa-hint">{account.externalAccountId}</div>
            </div>
            <span className="text-[12.5px] font-semibold text-pa-good">Connected</span>
          </div>
        ))}
      </div>

      <div className="px-1 pt-[22px] pb-2 text-[13px] font-semibold tracking-[0.4px] text-pa-hint uppercase">
        Quick actions
      </div>
      <div className="overflow-hidden rounded-[14px] bg-pa-secondary-bg">
        <Link
          to="/composer"
          className="flex w-full items-center gap-3 border-b border-pa-separator px-3.5 py-3.5 text-left"
        >
          <ComposeIcon className="text-pa-link" />
          <span className="flex-1 text-[15px] text-pa-text">Create a new post</span>
          <ChevronRightIcon className="text-pa-hint" />
        </Link>
        <Link to="/inbox" className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left">
          <InboxIcon className="text-pa-link" />
          <span className="flex-1 text-[15px] text-pa-text">
            {needsAttentionCount === null ? "Check your inbox" : `${needsAttentionCount} messages need attention`}
          </span>
          <ChevronRightIcon className="text-pa-hint" />
        </Link>
      </div>
    </div>
  );
}
