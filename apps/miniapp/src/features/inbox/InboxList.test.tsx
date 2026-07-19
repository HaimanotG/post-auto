import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InboxList, type InboxMessageSummary } from "./InboxList";

function messages(): InboxMessageSummary[] {
  return [
    {
      id: "msg_1",
      platform: "facebook_page",
      type: "comment",
      senderName: "Abebe Kebede",
      senderUsername: null,
      body: "Is this still available?",
      status: "needs_attention",
      createdAt: "2026-07-18T10:00:00.000Z",
    },
    {
      id: "msg_2",
      platform: "instagram_business",
      type: "dm",
      senderName: null,
      senderUsername: "sara_shops",
      body: "Thanks for the quick reply!",
      status: "auto_replied",
      createdAt: "2026-07-18T11:00:00.000Z",
    },
  ];
}

describe("InboxList", () => {
  it("renders a message when there are none", () => {
    render(<InboxList messages={[]} onSelect={vi.fn()} />);

    expect(screen.getByText("No messages yet.")).toBeInTheDocument();
  });

  it("renders each message's sender and body, falling back to username when no name is set", () => {
    render(<InboxList messages={messages()} onSelect={vi.fn()} />);

    expect(screen.getByText("Abebe Kebede")).toBeInTheDocument();
    expect(screen.getByText("Is this still available?")).toBeInTheDocument();
    expect(screen.getByText("sara_shops")).toBeInTheDocument();
    expect(screen.getByText("Thanks for the quick reply!")).toBeInTheDocument();
  });

  it("shows the needs-attention badge only on the message that needs it", () => {
    render(<InboxList messages={messages()} onSelect={vi.fn()} />);

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByRole("status")).toHaveTextContent("Needs attention");
    expect(within(items[1]!).queryByRole("status")).not.toBeInTheDocument();
  });

  it("calls onSelect with the clicked message's id", () => {
    const onSelect = vi.fn();
    render(<InboxList messages={messages()} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("sara_shops"));

    expect(onSelect).toHaveBeenCalledWith("msg_2");
  });

  it("marks the selected message as current", () => {
    render(<InboxList messages={messages()} selectedMessageId="msg_1" onSelect={vi.fn()} />);

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByRole("button")).toHaveAttribute("aria-current", "true");
    expect(within(items[1]!).getByRole("button")).toHaveAttribute("aria-current", "false");
  });
});
