import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TemplatePicker } from "./TemplatePicker";

describe("TemplatePicker", () => {
  it("renders all default templates with the current selection checked", () => {
    render(<TemplatePicker value="price-highlight" onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: /Single product/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Price highlight/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Carousel/ })).not.toBeChecked();
  });

  it("calls onChange with the selected template id when a different option is picked", () => {
    const onChange = vi.fn();
    render(<TemplatePicker value="single-product" onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /Carousel/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("carousel");
  });

  it("supports a custom template list", () => {
    const onChange = vi.fn();
    render(
      <TemplatePicker
        value="single-product"
        onChange={onChange}
        templates={[{ id: "single-product", label: "Solo shot", description: "Just one photo." }]}
      />,
    );

    expect(screen.getByRole("radio", { name: /Solo shot/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Carousel/ })).not.toBeInTheDocument();
  });
});
