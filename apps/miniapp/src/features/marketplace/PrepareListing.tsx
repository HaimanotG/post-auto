import { useState } from "react";

/** Mirrors packages/social/src/marketplace/format-listing.ts's MarketplaceListing shape. */
export interface MarketplaceListingContent {
  title: string;
  priceText: string | null;
  description: string;
  listingText: string;
}

export interface PrepareListingProps {
  /** URL of the unbranded product photo (packages/render/templates/MarketplacePhoto.tsx output). */
  photoUrl: string;
  listing: MarketplaceListingContent;
}

const MARKETPLACE_CREATE_URL = "https://www.facebook.com/marketplace/create/item";

type CopyStatus = "idle" | "copied" | "error";
type ShareStatus = "idle" | "sharing" | "error";

function canUseWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Builds the Web Share payload, best-effort attaching the photo as a shared
 * file (Marketplace's own upload flow expects an image, not just a link) —
 * falls back to a text-only share if the photo can't be fetched as a blob or
 * the platform doesn't support sharing files.
 */
async function buildSharePayload(photoUrl: string, listing: MarketplaceListingContent): Promise<ShareData> {
  const shareData: ShareData = { title: listing.title, text: listing.listingText };
  try {
    const response = await fetch(photoUrl);
    const blob = await response.blob();
    const file = new File([blob], "listing-photo.jpg", { type: blob.type || "image/jpeg" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      shareData.files = [file];
    }
  } catch {
    // No file attached — text-only share still hands off title/description.
  }
  return shareData;
}

/**
 * "Prepare for Marketplace" UI (never "Post to Marketplace" — Meta provides
 * no Marketplace listing-creation API, see PLAN.md's Facebook Marketplace
 * assist section). Offers a copy-to-clipboard listing text button plus
 * either a Web Share API handoff to the Facebook app (when supported) or a
 * fallback link to facebook.com/marketplace/create/item with manual paste
 * instructions.
 */
export function PrepareListing({ photoUrl, listing }: PrepareListingProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const shareAvailable = canUseWebShare();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(listing.listingText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  async function handleShare() {
    setShareStatus("sharing");
    try {
      const shareData = await buildSharePayload(photoUrl, listing);
      await navigator.share(shareData);
      setShareStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setShareStatus("idle");
        return;
      }
      setShareStatus("error");
    }
  }

  return (
    <div>
      <h1>Prepare for Marketplace</h1>
      <img src={photoUrl} alt={listing.title} />
      <p>{listing.title}</p>
      {listing.priceText && <p>{listing.priceText}</p>}
      <p>{listing.description}</p>

      <button type="button" onClick={() => void handleCopy()}>
        Copy listing text
      </button>
      {copyStatus === "copied" && <p role="status">Copied to clipboard.</p>}
      {copyStatus === "error" && <p role="alert">Couldn&apos;t copy to clipboard.</p>}

      {shareAvailable ? (
        <div>
          <button type="button" onClick={() => void handleShare()} disabled={shareStatus === "sharing"}>
            {shareStatus === "sharing" ? "Sharing…" : "Share to Facebook"}
          </button>
          {shareStatus === "error" && <p role="alert">Couldn&apos;t share. Copy the listing text instead.</p>}
        </div>
      ) : (
        <div>
          <a href={MARKETPLACE_CREATE_URL} target="_blank" rel="noreferrer">
            Open Facebook Marketplace
          </a>
          <p>
            Copy the listing text above, then paste it and upload the photo manually on the Facebook Marketplace
            listing page.
          </p>
        </div>
      )}
    </div>
  );
}
