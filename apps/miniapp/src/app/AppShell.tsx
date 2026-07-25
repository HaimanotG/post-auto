import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { BackIcon, TabAnalyticsIcon, TabHomeIcon, TabMarketplaceIcon } from "./icons";
import { ComposeIcon, InboxIcon } from "./icons";
import { HeaderProvider, useHeaderOverride } from "./HeaderContext";

const TAB_ITEMS = [
  { to: "/", label: "Home", Icon: TabHomeIcon },
  { to: "/composer", label: "Compose", Icon: ComposeIcon },
  { to: "/inbox", label: "Inbox", Icon: InboxIcon },
  { to: "/analytics", label: "Analytics", Icon: TabAnalyticsIcon },
  { to: "/marketplace", label: "Market", Icon: TabMarketplaceIcon },
] as const;

const ROUTE_TITLES: Record<string, string> = {
  "/": "PostAuto",
  "/composer": "New post",
  "/inbox": "Inbox",
  "/analytics": "Analytics",
  "/marketplace": "Marketplace",
};

function Header() {
  const override = useHeaderOverride();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const title = override.title ?? ROUTE_TITLES[pathname] ?? "PostAuto";
  const onBack = override.onBack;

  useEffect(() => {
    const backButton = window.Telegram?.WebApp?.BackButton;
    if (!backButton) return;

    if (onBack) {
      backButton.onClick(onBack);
      backButton.show();
    }

    return () => {
      if (onBack) backButton.offClick(onBack);
      backButton.hide();
    };
  }, [onBack]);

  return (
    <div className="flex flex-none items-center justify-between border-b border-pa-separator px-3 pt-1.5 pb-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className={`flex h-9 w-9 items-center justify-center text-pa-link ${onBack ? "" : "invisible"}`}
      >
        <BackIcon />
      </button>
      <span className="flex-1 text-center text-base font-semibold tracking-[-0.1px] text-pa-text">{title}</span>
      <div className="h-9 w-9" aria-hidden="true" />
    </div>
  );
}

function TabBar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className="flex flex-none border-t border-pa-separator bg-pa-tab-bar-bg px-1 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))]">
      {TAB_ITEMS.map(({ to, label, Icon }) => {
        const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={`flex flex-1 flex-col items-center gap-[3px] py-0.5 ${isActive ? "text-pa-link" : "text-pa-hint"}`}
          >
            <Icon />
            <span className="text-[10.5px] font-semibold">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Shared chrome for every route: a title/back header and a bottom tab bar, both styled per the PostAuto Mini App design. */
export function AppShell() {
  return (
    <HeaderProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-pa-bg text-pa-text">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <TabBar />
      </div>
    </HeaderProvider>
  );
}
