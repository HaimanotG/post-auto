import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversationThread, type AiReplyDecisionSummary } from "./ConversationThread";
import type { InboxMessageSummary } from "./InboxList";

const message: InboxMessageSummary = {
  id: "msg_1",
  platform: "facebook_page",
  type: "comment",
  senderName: "Abebe Kebede",
  senderUsername: null,
  body: "Is this still available?",
  status: "needs_attention",
  createdAt: "2026-07-18T10:00:00.000Z",
};

function decisions(): AiReplyDecisionSummary[] {
  return [
    {
      id: "decision_1",
      modelUsed: "claude-fable-5",
      intentClassified: "availability",
      confidence: 0.42,
      decision: "escalate",
      replyText: null,
      reasoningSnippet: "Confidence below the auto-reply threshold.",
      createdAt: "2026-07-18T10:00:05.000Z",
    },
  ];
}

describe("ConversationThread", () => {
  it("prompts for a selection when no message is given", () => {
    render(<ConversationThread message={null} decisions={[]} />);

    expect(screen.getByText("Select a message to view the conversation.")).toBeInTheDocument();
  });

  it("renders the message's sender and body", () => {
    render(<ConversationThread message={message} decisions={[]} />);

    expect(screen.getByRole("heading", { name: "Abebe Kebede" })).toBeInTheDocument();
    expect(screen.getByText("Is this still available?")).toBeInTheDocument();
  });

  it("shows a fallback when there are no AI reply decisions yet", () => {
    render(<ConversationThread message={message} decisions={[]} />);

    expect(screen.getByText("No AI reply decisions yet.")).toBeInTheDocument();
  });

  it("renders each decision's label, intent, confidence, and reasoning", () => {
    render(<ConversationThread message={message} decisions={decisions()} />);

    expect(screen.getByText("Escalated")).toBeInTheDocument();
    expect(screen.getByText("availability")).toBeInTheDocument();
    expect(screen.getByText("42% confidence")).toBeInTheDocument();
    expect(screen.getByText("Confidence below the auto-reply threshold.")).toBeInTheDocument();
  });

  it("renders the reply text when the decision is an auto-reply", () => {
    const autoReply: AiReplyDecisionSummary = {
      id: "decision_2",
      modelUsed: "claude-fable-5",
      intentClassified: "greeting",
      confidence: 0.95,
      decision: "auto_reply",
      replyText: "Hi! Yes, it's still in stock.",
      reasoningSnippet: null,
      createdAt: "2026-07-18T10:01:00.000Z",
    };
    render(<ConversationThread message={message} decisions={[autoReply]} />);

    expect(screen.getByText("Auto-replied")).toBeInTheDocument();
    expect(screen.getByText("Hi! Yes, it's still in stock.")).toBeInTheDocument();
  });
});
