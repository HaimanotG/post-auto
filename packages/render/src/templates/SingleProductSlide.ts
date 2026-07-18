import type { SatoriTree } from "../render.js";
import { box, image, text } from "./dom.js";
import type { SlideBusiness } from "./types.js";

export interface SingleProductSlideProps {
  imageUrl: string;
  productName: string;
  /** Pre-formatted display price, e.g. "ETB 1,200". Omitted when the post has no price. */
  price?: string;
  business: SlideBusiness;
}

/** A single full-bleed product photo with a caption bar naming the product and business. */
export function SingleProductSlide(props: SingleProductSlideProps): SatoriTree {
  return box(
    {
      width: "100%",
      height: "100%",
      position: "relative",
      backgroundColor: "#000000",
      flexDirection: "column",
    },
    [
      image(props.imageUrl, { width: "100%", height: "100%", objectFit: "cover", position: "absolute" }),
      box(
        {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: "column",
          padding: "48px",
          backgroundColor: "rgba(0, 0, 0, 0.55)",
        },
        [
          text(props.business.name, { fontSize: 28, color: "#ffffff", opacity: 0.85, marginBottom: 12 }),
          box(
            { justifyContent: "space-between", alignItems: "flex-end" },
            [
              text(props.productName, { fontSize: 56, color: "#ffffff", fontWeight: 700 }),
              props.price
                ? text(props.price, { fontSize: 48, color: props.business.primaryColor, fontWeight: 700 })
                : undefined,
            ].filter((child): child is SatoriTree => child !== undefined),
          ),
        ],
      ),
    ],
  );
}
