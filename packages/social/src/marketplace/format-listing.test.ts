import { describe, expect, it } from "vitest";
import { formatMarketplaceListing } from "./format-listing.js";

describe("formatMarketplaceListing", () => {
  it("uses productName as the title, formats price with the default ETB currency, and prefers the explicit description", () => {
    const listing = formatMarketplaceListing({
      captionMaster: "Fresh injera, made daily. #freshfood",
      productName: "Injera (bundle of 10)",
      price: 350,
      description: "Freshly baked today, ready for pickup.",
    });

    expect(listing.title).toBe("Injera (bundle of 10)");
    expect(listing.priceText).toBe("350 ETB");
    expect(listing.description).toBe("Freshly baked today, ready for pickup.");
    expect(listing.listingText).toBe(
      "Injera (bundle of 10)\n350 ETB\n\nFreshly baked today, ready for pickup.",
    );
  });

  it("falls back to the caption's first non-empty line as the title when no productName is given", () => {
    const listing = formatMarketplaceListing({
      captionMaster: "\n  Handwoven scarves, new colors  \nMore details below",
      price: 900,
    });

    expect(listing.title).toBe("Handwoven scarves, new colors");
  });

  it("falls back to the master caption as the description when no explicit description is given", () => {
    const listing = formatMarketplaceListing({
      captionMaster: "Grand opening deals this week!",
      productName: "Opening deal",
      price: 100,
    });

    expect(listing.description).toBe("Grand opening deals this week!");
  });

  it("formats large prices with thousand separators", () => {
    const listing = formatMarketplaceListing({
      captionMaster: "Caption",
      productName: "Sofa set",
      price: 12500,
    });

    expect(listing.priceText).toBe("12,500 ETB");
  });

  it("accepts a string price (as Prisma Decimal serializes to)", () => {
    const listing = formatMarketplaceListing({
      captionMaster: "Caption",
      productName: "Table",
      price: "1750.50",
    });

    expect(listing.priceText).toBe("1,750.5 ETB");
  });

  it("respects an explicit currency override", () => {
    const listing = formatMarketplaceListing({
      captionMaster: "Caption",
      productName: "Import item",
      price: 40,
      currency: "USD",
    });

    expect(listing.priceText).toBe("40 USD");
  });

  it("omits the price line entirely when no price is known", () => {
    const listing = formatMarketplaceListing({
      captionMaster: "Caption",
      productName: "Mystery item",
      price: null,
    });

    expect(listing.priceText).toBeNull();
    expect(listing.listingText).toBe("Mystery item\n\nCaption");
  });

  it("truncates an over-limit title and appends an ellipsis", () => {
    const longName = "x".repeat(150);
    const listing = formatMarketplaceListing({
      captionMaster: "Caption",
      productName: longName,
      price: 10,
    });

    expect(listing.title.length).toBe(100);
    expect(listing.title.endsWith("…")).toBe(true);
  });

  it("treats a blank productName the same as a missing one", () => {
    const listing = formatMarketplaceListing({
      captionMaster: "Beautiful ceramic vases",
      productName: "   ",
      price: 200,
    });

    expect(listing.title).toBe("Beautiful ceramic vases");
  });

  it("treats a non-numeric string price as unknown", () => {
    const listing = formatMarketplaceListing({
      captionMaster: "Caption",
      productName: "Item",
      price: "call for price",
    });

    expect(listing.priceText).toBeNull();
  });
});
