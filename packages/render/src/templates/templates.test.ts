import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderTreeToSvg } from "../render.js";
import { CarouselCoverSlide } from "./CarouselCoverSlide.js";
import { CarouselDetailSlide } from "./CarouselDetailSlide.js";
import { MarketplacePhoto } from "./MarketplacePhoto.js";
import { PriceHighlightSlide } from "./PriceHighlightSlide.js";
import { SingleProductSlide } from "./SingleProductSlide.js";
import type { SlideBusiness } from "./types.js";

// A 1x1 transparent PNG, inlined so real-render tests need no network I/O
// (satori resolves <img> src eagerly; a data URI avoids the fetch entirely).
const PIXEL_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const FONT_PATH = fileURLToPath(new URL("../../test/fixtures/inter-regular.woff", import.meta.url));

async function loadTestFont() {
  const data = await readFile(FONT_PATH);
  return [{ name: "Inter", data, weight: 400 as const, style: "normal" as const }];
}

const business: SlideBusiness = {
  name: "Selam Boutique",
  primaryColor: "#d1495b",
  logoUrl: "https://example.com/logo.png",
};

describe("slide templates", () => {
  it("SingleProductSlide returns a stable tree for a given set of props", () => {
    const tree = SingleProductSlide({
      imageUrl: PIXEL_PNG_DATA_URI,
      productName: "Handwoven Scarf",
      price: "ETB 850",
      business,
    });
    expect(tree).toMatchSnapshot();
  });

  it("SingleProductSlide omits the price node when no price is given", () => {
    const tree = SingleProductSlide({ imageUrl: PIXEL_PNG_DATA_URI, productName: "Handwoven Scarf", business });
    expect(tree).toMatchSnapshot();
  });

  it("PriceHighlightSlide returns a stable tree for a given set of props", () => {
    const tree = PriceHighlightSlide({
      price: "ETB 850",
      productName: "Handwoven Scarf",
      imageUrl: PIXEL_PNG_DATA_URI,
      business,
    });
    expect(tree).toMatchSnapshot();
  });

  it("CarouselCoverSlide returns a stable tree for a given set of props", () => {
    const tree = CarouselCoverSlide({
      imageUrl: PIXEL_PNG_DATA_URI,
      title: "New Arrivals This Week",
      slideCount: 4,
      business,
    });
    expect(tree).toMatchSnapshot();
  });

  it("CarouselDetailSlide returns a stable tree for a given set of props", () => {
    const tree = CarouselDetailSlide({
      imageUrl: PIXEL_PNG_DATA_URI,
      slideIndex: 2,
      slideCount: 4,
      caption: "Available in three colors",
      business,
    });
    expect(tree).toMatchSnapshot();
  });

  it("CarouselDetailSlide omits the caption bar when no caption is given", () => {
    const tree = CarouselDetailSlide({ imageUrl: PIXEL_PNG_DATA_URI, slideIndex: 3, slideCount: 4, business });
    expect(tree).toMatchSnapshot();
  });

  it("MarketplacePhoto returns a stable tree for a given set of props", () => {
    const tree = MarketplacePhoto({ imageUrl: PIXEL_PNG_DATA_URI, price: "ETB 850" });
    expect(tree).toMatchSnapshot();
  });

  it("MarketplacePhoto omits the price badge when no price is given", () => {
    const tree = MarketplacePhoto({ imageUrl: PIXEL_PNG_DATA_URI });
    expect(tree).toMatchSnapshot();
  });

  it.each([
    ["SingleProductSlide", () => SingleProductSlide({ imageUrl: PIXEL_PNG_DATA_URI, productName: "Scarf", price: "ETB 850", business })],
    ["PriceHighlightSlide", () => PriceHighlightSlide({ price: "ETB 850", productName: "Scarf", business })],
    ["CarouselCoverSlide", () => CarouselCoverSlide({ imageUrl: PIXEL_PNG_DATA_URI, title: "New In", slideCount: 3, business })],
    [
      "CarouselDetailSlide",
      () => CarouselDetailSlide({ imageUrl: PIXEL_PNG_DATA_URI, slideIndex: 1, slideCount: 3, caption: "Detail", business }),
    ],
    ["MarketplacePhoto", () => MarketplacePhoto({ imageUrl: PIXEL_PNG_DATA_URI, price: "ETB 850" })],
  ])("%s lays out into valid SVG through satori with real text and image nodes", async (_name, build) => {
    const fonts = await loadTestFont();
    const svg = await renderTreeToSvg(build(), { width: 1080, height: 1080, fonts });
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1080"');
  });
});
