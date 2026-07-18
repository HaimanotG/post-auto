import type { SatoriTree } from "../render.js";
import { box, image, text } from "./dom.js";
import type { SlideBusiness } from "./types.js";

export interface CarouselDetailSlideProps {
  imageUrl: string;
  /** 1-based position of this slide within the carousel, matching slideCount's total. */
  slideIndex: number;
  slideCount: number;
  business: SlideBusiness;
  caption?: string;
}

/** A non-cover carousel slide: full-bleed image, position indicator, and an optional caption. */
export function CarouselDetailSlide(props: CarouselDetailSlideProps): SatoriTree {
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
          top: 0,
          right: 0,
          padding: "40px",
        },
        [
          box(
            {
              backgroundColor: props.business.primaryColor,
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 10,
              paddingBottom: 10,
              borderRadius: 999,
            },
            [text(`${props.slideIndex} / ${props.slideCount}`, { fontSize: 24, color: "#ffffff", fontWeight: 700 })],
          ),
        ],
      ),
      props.caption
        ? box(
            {
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "48px",
              backgroundColor: "rgba(0, 0, 0, 0.55)",
            },
            [text(props.caption, { fontSize: 40, color: "#ffffff", fontWeight: 600 })],
          )
        : undefined,
    ].filter((child): child is SatoriTree => child !== undefined),
  );
}
