import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrepareListing, type MarketplaceListingContent } from "./PrepareListing";

const listing: MarketplaceListingContent = {
  title: "Handwoven Basket",
  priceText: "1,200 ETB",
  description: "Handmade basket, 30cm wide.",
  listingText: "Handwoven Basket\n1,200 ETB\n\nHandmade basket, 30cm wide.",
};

function defineNavigatorProp(name: "share" | "canShare" | "clipboard", value: unknown) {
  Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true });
}

function deleteNavigatorProp(name: "share" | "canShare" | "clipboard") {
  Object.defineProperty(window.navigator, name, { value: undefined, configurable: true, writable: true });
}

describe("PrepareListing", () => {
  afterEach(() => {
    deleteNavigatorProp("share");
    deleteNavigatorProp("canShare");
    deleteNavigatorProp("clipboard");
    vi.unstubAllGlobals();
  });

  it("renders the 'Prepare for Marketplace' heading and listing details, never 'Post to Marketplace'", () => {
    render(<PrepareListing photoUrl="https://cdn.test/photo.png" listing={listing} />);

    expect(screen.getByRole("heading", { name: "Prepare for Marketplace" })).toBeInTheDocument();
    expect(screen.queryByText(/post to marketplace/i)).not.toBeInTheDocument();
    expect(screen.getByText(listing.title)).toBeInTheDocument();
    expect(screen.getByText(listing.priceText!)).toBeInTheDocument();
    expect(screen.getByText(listing.description)).toBeInTheDocument();
    expect(screen.getByAltText(listing.title)).toHaveAttribute("src", "https://cdn.test/photo.png");
  });

  it("copies the listing text to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    defineNavigatorProp("clipboard", { writeText });

    render(<PrepareListing photoUrl="https://cdn.test/photo.png" listing={listing} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy listing text" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(listing.listingText);
    });
    expect(await screen.findByText("Copied to clipboard.")).toBeInTheDocument();
  });

  it("shows an error when copying to the clipboard fails", async () => {
    defineNavigatorProp("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("denied")) });

    render(<PrepareListing photoUrl="https://cdn.test/photo.png" listing={listing} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy listing text" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy to clipboard.");
  });

  describe("when the Web Share API is available", () => {
    it("shares the listing title, text, and photo as an attached file, and hides the fallback link", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      const canShare = vi.fn().mockReturnValue(true);
      defineNavigatorProp("share", share);
      defineNavigatorProp("canShare", canShare);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(new Blob(["fake-image-bytes"], { type: "image/png" }))),
      );

      render(<PrepareListing photoUrl="https://cdn.test/photo.png" listing={listing} />);

      expect(screen.queryByRole("link", { name: "Open Facebook Marketplace" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Share to Facebook" }));

      await waitFor(() => {
        expect(share).toHaveBeenCalledTimes(1);
      });
      const sharePayload = share.mock.calls[0]?.[0] as ShareData;
      expect(sharePayload.title).toBe(listing.title);
      expect(sharePayload.text).toBe(listing.listingText);
      expect(sharePayload.files?.[0]).toBeInstanceOf(File);
      expect(canShare).toHaveBeenCalledWith({ files: [expect.any(File)] });
    });

    it("falls back to a text-only share when the photo can't be attached as a file", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      defineNavigatorProp("share", share);
      defineNavigatorProp("canShare", vi.fn().mockReturnValue(false));
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["x"]))));

      render(<PrepareListing photoUrl="https://cdn.test/photo.png" listing={listing} />);
      fireEvent.click(screen.getByRole("button", { name: "Share to Facebook" }));

      await waitFor(() => {
        expect(share).toHaveBeenCalledWith({ title: listing.title, text: listing.listingText });
      });
    });

    it("shows an error when sharing fails for a reason other than user cancellation", async () => {
      defineNavigatorProp("share", vi.fn().mockRejectedValue(new Error("share failed")));
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

      render(<PrepareListing photoUrl="https://cdn.test/photo.png" listing={listing} />);
      fireEvent.click(screen.getByRole("button", { name: "Share to Facebook" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't share. Copy the listing text instead.");
    });

    it("silently resolves without an error when the user cancels the native share sheet", async () => {
      defineNavigatorProp("share", vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")));
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

      render(<PrepareListing photoUrl="https://cdn.test/photo.png" listing={listing} />);
      fireEvent.click(screen.getByRole("button", { name: "Share to Facebook" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Share to Facebook" })).not.toBeDisabled();
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("when the Web Share API is unavailable", () => {
    it("shows the fallback Marketplace link with manual paste instructions instead of a share button", () => {
      render(<PrepareListing photoUrl="https://cdn.test/photo.png" listing={listing} />);

      expect(screen.queryByRole("button", { name: "Share to Facebook" })).not.toBeInTheDocument();
      const link = screen.getByRole("link", { name: "Open Facebook Marketplace" });
      expect(link).toHaveAttribute("href", "https://www.facebook.com/marketplace/create/item");
      expect(link).toHaveAttribute("target", "_blank");
      expect(screen.getByText(/paste it and upload the photo manually/i)).toBeInTheDocument();
    });
  });
});
