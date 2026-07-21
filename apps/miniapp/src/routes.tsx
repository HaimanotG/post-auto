import { Link, Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Dashboard } from "./features/analytics/Dashboard";
import { PostComposer } from "./features/composer/PostComposer";
import { InboxScreen } from "./features/inbox/InboxScreen";
import { HomeScreen } from "./features/onboarding/HomeScreen";

const NAV_ITEMS = [
  { to: "/composer", label: "Composer" },
  { to: "/inbox", label: "Inbox" },
  { to: "/analytics", label: "Analytics" },
  { to: "/marketplace", label: "Marketplace" },
] as const;

function RootLayout() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="flex gap-4 border-b border-neutral-800 p-4">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="text-sm font-medium text-neutral-300 hover:text-white [&.active]:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Marketplace listing prep has no data source yet: packages/social's
 * format-listing.ts and packages/render's MarketplacePhoto.ts (m5-01/m5-02)
 * are unused by any route or trigger task, so there's no post to pass
 * PrepareListing.tsx's required `photoUrl`/`listing` props. Left as an
 * honest placeholder rather than wired against invented data.
 */
function MarketplaceRouteStub() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Marketplace</h1>
      <p>Not available yet — nothing generates listing content for a post to prepare.</p>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

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
