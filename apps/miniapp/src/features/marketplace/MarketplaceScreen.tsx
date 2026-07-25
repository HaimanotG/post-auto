import { useEffect, useState } from "react";
import { DEFAULT_API_BASE_URL } from "../../app/api-config";
import { useAuth } from "../../app/AuthGate";
import { TabMarketplaceIcon } from "../../app/icons";
import { PrepareListing, type MarketplaceListingContent } from "./PrepareListing";

export interface MarketplaceScreenProps {
  apiBaseUrl?: string;
}

type MarketplaceListingResponse =
  | { available: false }
  | { available: true; photoUrl: string; listing: MarketplaceListingContent };

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unavailable" }
  | { kind: "ready"; photoUrl: string; listing: MarketplaceListingContent };

function NothingToPrepare() {
  return (
    <div className="flex flex-col items-center gap-3 px-7 pt-16 pb-7 text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-pa-secondary-bg text-pa-link">
        <TabMarketplaceIcon className="h-8 w-8" />
      </div>
      <h1 className="text-xl font-bold text-pa-text">Marketplace</h1>
      <p className="max-w-[280px] text-[14.5px] leading-normal text-pa-hint">
        Not available yet — create a post with a photo first, then come back here to prepare a Marketplace listing
        for it.
      </p>
    </div>
  );
}

/**
 * Container wiring GET /marketplace/listing (apps/api/src/routes/marketplace.ts)
 * to PrepareListing.tsx -- previously an honest placeholder since nothing
 * generated listing content for a post to prepare (see routes.tsx's prior
 * MarketplaceRouteStub). Fetches on mount and renders the business's most
 * recent post with enough content (a photo plus a product name or caption)
 * to build a Marketplace listing from.
 */
export function MarketplaceScreen({ apiBaseUrl = DEFAULT_API_BASE_URL }: MarketplaceScreenProps) {
  const { token } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus({ kind: "loading" });
      try {
        const response = await fetch(`${apiBaseUrl}/marketplace/listing`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`Failed to load marketplace listing with status ${response.status}`);
        }

        const body = (await response.json()) as MarketplaceListingResponse;
        if (cancelled) return;
        if (body.available) {
          setStatus({ kind: "ready", photoUrl: body.photoUrl, listing: body.listing });
        } else {
          setStatus({ kind: "unavailable" });
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load marketplace listing";
        setStatus({ kind: "error", message });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, token]);

  if (status.kind === "loading") {
    return <div role="status" className="px-4 py-6 text-center text-[14.5px] text-pa-hint">Loading…</div>;
  }

  if (status.kind === "error") {
    return <div role="alert" className="px-4 py-6 text-center text-[14.5px] text-pa-destructive">{status.message}</div>;
  }

  if (status.kind === "unavailable") {
    return <NothingToPrepare />;
  }

  return <PrepareListing photoUrl={status.photoUrl} listing={status.listing} />;
}
