import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CarouselEditor, type CarouselSlideDraft } from "./CarouselEditor";

function slides(): CarouselSlideDraft[] {
  return [
    { id: "asset_1", rawUrl: "https://cdn.test/a.jpg", productName: "Shoes", description: "" },
    { id: "asset_2", rawUrl: "https://cdn.test/b.jpg", productName: "Socks", description: "Cotton blend" },
    { id: "asset_3", rawUrl: "https://cdn.test/c.jpg", productName: "Laces", description: "" },
  ];
}

describe("CarouselEditor", () => {
  it("labels the first slide as the cover and the rest by position", () => {
    render(<CarouselEditor slides={slides()} onChange={vi.fn()} />);

    expect(screen.getByText("Cover slide")).toBeInTheDocument();
    expect(screen.getByText("Slide 2")).toBeInTheDocument();
    expect(screen.getByText("Slide 3")).toBeInTheDocument();
  });

  it("moves a slide earlier when Move up is clicked", () => {
    const onChange = vi.fn();
    render(<CarouselEditor slides={slides()} onChange={onChange} />);

    const moveUpButtons = screen.getAllByRole("button", { name: "Move up" });
    fireEvent.click(moveUpButtons[1]!);

    expect(onChange).toHaveBeenCalledWith([
      { id: "asset_2", rawUrl: "https://cdn.test/b.jpg", productName: "Socks", description: "Cotton blend" },
      { id: "asset_1", rawUrl: "https://cdn.test/a.jpg", productName: "Shoes", description: "" },
      { id: "asset_3", rawUrl: "https://cdn.test/c.jpg", productName: "Laces", description: "" },
    ]);
  });

  it("moves a slide later when Move down is clicked", () => {
    const onChange = vi.fn();
    render(<CarouselEditor slides={slides()} onChange={onChange} />);

    const moveDownButtons = screen.getAllByRole("button", { name: "Move down" });
    fireEvent.click(moveDownButtons[0]!);

    expect(onChange).toHaveBeenCalledWith([
      { id: "asset_2", rawUrl: "https://cdn.test/b.jpg", productName: "Socks", description: "Cotton blend" },
      { id: "asset_1", rawUrl: "https://cdn.test/a.jpg", productName: "Shoes", description: "" },
      { id: "asset_3", rawUrl: "https://cdn.test/c.jpg", productName: "Laces", description: "" },
    ]);
  });

  it("disables Move up on the first slide and Move down on the last slide", () => {
    render(<CarouselEditor slides={slides()} onChange={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: "Move up" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move down" }).at(-1)).toBeDisabled();
  });

  it("edits a slide's product name and caption", () => {
    const onChange = vi.fn();
    render(<CarouselEditor slides={slides()} onChange={onChange} />);

    fireEvent.change(screen.getAllByLabelText("Caption")[0]!, { target: { value: "New arrivals" } });

    expect(onChange).toHaveBeenCalledWith([
      { id: "asset_1", rawUrl: "https://cdn.test/a.jpg", productName: "Shoes", description: "New arrivals" },
      { id: "asset_2", rawUrl: "https://cdn.test/b.jpg", productName: "Socks", description: "Cotton blend" },
      { id: "asset_3", rawUrl: "https://cdn.test/c.jpg", productName: "Laces", description: "" },
    ]);
  });

  it("removes a slide, disabling removal when only one slide remains", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CarouselEditor slides={slides()} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove slide" })[2]!);
    expect(onChange).toHaveBeenCalledWith([
      { id: "asset_1", rawUrl: "https://cdn.test/a.jpg", productName: "Shoes", description: "" },
      { id: "asset_2", rawUrl: "https://cdn.test/b.jpg", productName: "Socks", description: "Cotton blend" },
    ]);

    rerender(<CarouselEditor slides={[slides()[0]!]} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Remove slide" })).toBeDisabled();
  });
});
