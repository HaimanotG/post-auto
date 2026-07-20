import type { SatoriTree } from "../render.js";
import { box, image, text } from "./dom.js";

export interface MarketplacePhotoProps {
  imageUrl: string;
  /** Pre-formatted display price, e.g. "ETB 1,200". Omitted when the listing has no price. */
  price?: string;
}

/**
 * Full-bleed product photo with no business branding (name/logo/brand color) —
 * Marketplace listings show the seller's Facebook profile alongside the photo,
 * so baking business branding into the image itself would be redundant, per
 * PLAN.md's "prepare, don't auto-post" Marketplace assist flow.
 */
export function MarketplacePhoto(props: MarketplacePhotoProps): SatoriTree {
  return box(
    {
      width: "100%",
      height: "100%",
      position: "relative",
      backgroundColor: "#ffffff",
    },
    [
      image(props.imageUrl, { width: "100%", height: "100%", objectFit: "cover" }),
      props.price
        ? box(
            {
              position: "absolute",
              bottom: 32,
              right: 32,
              backgroundColor: "#ffffff",
              paddingLeft: 24,
              paddingRight: 24,
              paddingTop: 12,
              paddingBottom: 12,
              borderRadius: 12,
            },
            [text(props.price, { fontSize: 40, color: "#111111", fontWeight: 700 })],
          )
        : undefined,
    ].filter((child): child is SatoriTree => child !== undefined),
  );
}
