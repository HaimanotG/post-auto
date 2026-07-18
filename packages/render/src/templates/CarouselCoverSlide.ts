import type { SatoriTree } from "../render.js";
import { box, image, text } from "./dom.js";
import type { SlideBusiness } from "./types.js";

export interface CarouselCoverSlideProps {
  imageUrl: string;
  title: string;
  /** Total number of slides in the carousel, including this cover slide. */
  slideCount: number;
  business: SlideBusiness;
}

/** First slide of a carousel: full-bleed image, title, and a "swipe for more" cue. */
export function CarouselCoverSlide(props: CarouselCoverSlideProps): SatoriTree {
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
          left: 0,
          right: 0,
          justifyContent: "space-between",
          padding: "40px",
        },
        [
          text(props.business.name, { fontSize: 28, color: "#ffffff", fontWeight: 600 }),
          box(
            {
              backgroundColor: props.business.primaryColor,
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 10,
              paddingBottom: 10,
              borderRadius: 999,
            },
            [text(`1 / ${props.slideCount}`, { fontSize: 24, color: "#ffffff", fontWeight: 700 })],
          ),
        ],
      ),
      box(
        {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "48px",
          backgroundColor: "rgba(0, 0, 0, 0.55)",
        },
        [text(props.title, { fontSize: 60, color: "#ffffff", fontWeight: 700 })],
      ),
    ],
  );
}
