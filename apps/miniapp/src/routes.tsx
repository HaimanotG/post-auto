import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "./app/AppShell";
import { TabMarketplaceIcon } from "./app/icons";
import { Dashboard } from "./features/analytics/Dashboard";
import { PostComposer } from "./features/composer/PostComposer";
import { InboxScreen } from "./features/inbox/InboxScreen";
import { HomeScreen } from "./features/onboarding/HomeScreen";

/**
 * Marketplace listing prep has no data source yet: packages/social's
 * format-listing.ts and packages/render's MarketplacePhoto.ts (m5-01/m5-02)
 * are unused by any route or trigger task, so there's no post to pass
 * PrepareListing.tsx's required `photoUrl`/`listing` props. Left as an
 * honest placeholder rather than wired against invented data.
 */
function MarketplaceRouteStub() {
  return (
    <div className="flex flex-col items-center gap-3 px-7 pt-16 pb-7 text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-pa-secondary-bg text-pa-link">
        <TabMarketplaceIcon className="h-8 w-8" />
      </div>
      <h1 className="text-xl font-bold text-pa-text">Marketplace</h1>
      <p className="max-w-[280px] text-[14.5px] leading-normal text-pa-hint">
        Not available yet — nothing generates listing content for a post to prepare.
      </p>
    </div>
  );
}

const rootRoute = createRootRoute({ component: AppShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeScreen,
});

const composerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/composer",
  component: PostComposer,
});

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  component: InboxScreen,
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analytics",
  component: Dashboard,
});

const marketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/marketplace",
  component: MarketplaceRouteStub,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  composerRoute,
  inboxRoute,
  analyticsRoute,
  marketplaceRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
