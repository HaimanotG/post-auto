import { useState } from "react";
import { CopyIcon } from "../../app/icons";
import { Toast } from "../../app/Toast";

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
    <div className="px-4 pt-4 pb-6">
      <h1 className="sr-only">Prepare for Marketplace</h1>
      <img src={photoUrl} alt={listing.title} className="mb-4 h-[220px] w-full rounded-[14px] object-cover" />
      <p className="mb-0.5 text-[19px] font-bold text-pa-text">{listing.title}</p>
      {listing.priceText && <p className="mb-2.5 text-[17px] font-semibold text-pa-link">{listing.priceText}</p>}
      <p className="mb-5 text-[14.5px] leading-normal text-pa-hint">{listing.description}</p>

      <button
        type="button"
        onClick={() => void handleCopy()}
        className="mb-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-pa-secondary-bg py-3.5 text-[15px] font-semibold text-pa-text"
      >
        <CopyIcon />
        Copy listing text
      </button>
      {copyStatus === "copied" && <Toast kind="status">Copied to clipboard.</Toast>}
      {copyStatus === "error" && <Toast kind="alert">Couldn&apos;t copy to clipboard.</Toast>}

      {shareAvailable ? (
        <div>
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={shareStatus === "sharing"}
            className="w-full rounded-xl bg-pa-button py-3.5 text-[15px] font-semibold text-pa-button-text disabled:opacity-60"
          >
            {shareStatus === "sharing" ? "Sharing…" : "Share to Facebook"}
          </button>
          {shareStatus === "error" && <Toast kind="alert">Couldn&apos;t share. Copy the listing text instead.</Toast>}
        </div>
      ) : (
        <div>
          <a
            href={MARKETPLACE_CREATE_URL}
            target="_blank"
            rel="noreferrer"
            className="block w-full rounded-xl bg-pa-button py-3.5 text-center text-[15px] font-semibold text-pa-button-text"
          >
            Open Facebook Marketplace
          </a>
          <p className="mt-2.5 text-[12.5px] leading-normal text-pa-hint">
            Copy the listing text above, then paste it and upload the photo manually on the Facebook Marketplace
            listing page.
          </p>
        </div>
      )}
    </div>
  );
}
