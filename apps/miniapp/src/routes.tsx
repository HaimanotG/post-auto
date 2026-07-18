import { Link, Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

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

function RouteStub({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <RouteStub title="PostAuto" />,
});

const composerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/composer",
  component: () => <RouteStub title="Composer" />,
});

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  component: () => <RouteStub title="Inbox" />,
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analytics",
  component: () => <RouteStub title="Analytics" />,
});

const marketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/marketplace",
  component: () => <RouteStub title="Marketplace" />,
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
