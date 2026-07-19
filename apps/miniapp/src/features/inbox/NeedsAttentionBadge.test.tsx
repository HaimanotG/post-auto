import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeedsAttentionBadge, type InboxMessageStatus } from "./NeedsAttentionBadge";

describe("NeedsAttentionBadge", () => {
  it("renders a badge when the status is needs_attention", () => {
    render(<NeedsAttentionBadge status="needs_attention" />);

    expect(screen.getByRole("status")).toHaveTextContent("Needs attention");
  });

  it.each<InboxMessageStatus>(["new", "auto_replied", "resolved", "ignored"])(
    "renders nothing for status %s",
    (status) => {
      const { container } = render(<NeedsAttentionBadge status={status} />);

      expect(container).toBeEmptyDOMElement();
    },
  );
});
