import type { SatoriTree } from "../render.js";
import { box, image, text } from "./dom.js";
import type { SlideBusiness } from "./types.js";

export interface PriceHighlightSlideProps {
  price: string;
  productName: string;
  business: SlideBusiness;
  /** Optional small product thumbnail; the price itself is the focal point, not the photo. */
  imageUrl?: string;
}

/** Price-forward slide: a brand-colored background with the price as the dominant element. */
export function PriceHighlightSlide(props: PriceHighlightSlideProps): SatoriTree {
  return box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: props.business.primaryColor,
      padding: "56px",
    },
    [
      box({ justifyContent: "space-between", alignItems: "center" }, [
        text(props.business.name, { fontSize: 32, color: "#ffffff", opacity: 0.9, fontWeight: 600 }),
        props.imageUrl
          ? image(props.imageUrl, { width: 120, height: 120, objectFit: "cover", borderRadius: 16 })
          : undefined,
      ].filter((child): child is SatoriTree => child !== undefined)),
      box({ flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1 }, [
        text(props.price, { fontSize: 128, color: "#ffffff", fontWeight: 800 }),
        text(props.productName, { fontSize: 44, color: "#ffffff", opacity: 0.95, marginTop: 24 }),
      ]),
    ],
  );
}
