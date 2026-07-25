import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "./app/AppShell";
import { Dashboard } from "./features/analytics/Dashboard";
import { PostComposer } from "./features/composer/PostComposer";
import { InboxScreen } from "./features/inbox/InboxScreen";
import { MarketplaceScreen } from "./features/marketplace/MarketplaceScreen";
import { HomeScreen } from "./features/onboarding/HomeScreen";

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
  component: MarketplaceScreen,
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
