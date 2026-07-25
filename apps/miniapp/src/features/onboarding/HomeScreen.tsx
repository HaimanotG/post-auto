import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DEFAULT_API_BASE_URL } from "../../app/api-config";
import { useAuth } from "../../app/AuthGate";
import {
  ChevronRightIcon,
  ComposeIcon,
  FacebookIcon,
  GoodCheckIcon,
  InboxIcon,
  InstagramIcon,
  ThreadsIcon,
} from "../../app/icons";
import { platformAccountLabel } from "../../app/platform-labels";
import { ConnectPlatformButton } from "./ConnectPlatformButton";
import { OAuthStatusPoller, type ConnectedSocialAccount } from "./OAuthStatusPoller";

export interface HomeScreenProps {
  apiBaseUrl?: string;
}

interface InboxCountResponse {
  messages: Array<{ status: string }>;
}

type AccountsStatus = "loading" | "loaded" | "error";

function AccountRow({ account }: { account: ConnectedSocialAccount }) {
  return (
    <div className="flex items-center gap-3 border-b border-pa-separator px-3.5 py-3.5 last:border-b-0">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-pa-bg">
        <GoodCheckIcon className="text-pa-good" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-pa-text">
          {account.displayName ?? platformAccountLabel(account.platform)}
        </div>
        <div className="truncate text-[12.5px] text-pa-hint">
          {account.displayName ? platformAccountLabel(account.platform) : account.externalAccountId}
        </div>
      </div>
      <span className="flex-none text-[12.5px] font-semibold text-pa-good">Connected</span>
    </div>
  );
}

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
    return <div role="status" className="px-4 py-6 text-center text-[14.5px] text-pa-hint">Loading…</div>;
  }

  if (accountsStatus === "error") {
    return (
      <div role="alert" className="px-4 py-6 text-center text-[14.5px] text-pa-destructive">
        Couldn't load your connection status. Pull down to reload, or try again shortly.
      </div>
    );
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
        <ConnectPlatformButton apiBaseUrl={apiBaseUrl} platform="facebook_page" />
        <p className="text-[12.5px] text-pa-hint">
          Connecting Facebook also links any Instagram Business account attached to your Page.
        </p>
        <OAuthStatusPoller apiBaseUrl={apiBaseUrl} onConnected={setConnectedAccounts} />
      </div>
    );
  }

  const facebookPages = connectedAccounts.filter((account) => account.platform === "facebook_page");
  const hasInstagram = connectedAccounts.some((account) => account.platform === "instagram_business");
  const hasThreads = connectedAccounts.some((account) => account.platform === "threads");

  return (
    <div className="px-4 pt-[18px] pb-6">
      <div className="px-1 pt-1 pb-0.5 text-[22px] font-bold text-pa-text">Hi, {user.firstName ?? "there"}</div>

      <div className="px-1 pt-[22px] pb-2 text-[13px] font-semibold tracking-[0.4px] text-pa-hint uppercase">
        Connected accounts
      </div>
      <div className="overflow-hidden rounded-[14px] bg-pa-secondary-bg">
        {connectedAccounts.map((account) => (
          <AccountRow key={`${account.platform}-${account.externalAccountId}`} account={account} />
        ))}
      </div>
      {facebookPages.length > 1 && (
        <p className="px-1 pt-2 text-[12.5px] text-pa-hint">
          You have {facebookPages.length} Facebook Pages connected — pick which ones to post to from the composer.
        </p>
      )}

      {!hasInstagram && facebookPages.length > 0 && (
        <div className="mt-3 flex items-start gap-3 rounded-[14px] bg-pa-secondary-bg px-3.5 py-3.5">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-pa-bg text-pa-hint">
            <InstagramIcon />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold text-pa-text">Instagram not linked</div>
            <p className="pt-0.5 text-[12.5px] leading-normal text-pa-hint">
              Link an Instagram professional account to your Facebook Page in Meta Business Suite, then reconnect
              Facebook to pick it up.
            </p>
            <ConnectPlatformButton
              apiBaseUrl={apiBaseUrl}
              platform="facebook_page"
              variant="secondary"
              label="Reconnect Facebook"
            />
          </div>
        </div>
      )}

      {!hasThreads && (
        <div className="mt-3 flex items-start gap-3 rounded-[14px] bg-pa-secondary-bg px-3.5 py-3.5">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-pa-bg text-pa-hint">
            <ThreadsIcon />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold text-pa-text">Threads not connected</div>
            <p className="pt-0.5 text-[12.5px] leading-normal text-pa-hint">
              Threads uses its own sign-in, separate from Facebook.
            </p>
            <ConnectPlatformButton apiBaseUrl={apiBaseUrl} platform="threads" variant="secondary" />
          </div>
        </div>
      )}

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
