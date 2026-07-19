import type { InboxMessageSummary } from "./InboxList";

/** Mirrors AiReplyDecisionType in packages/db/prisma/schema.prisma. */
export type AiReplyDecisionType = "auto_reply" | "escalate" | "ignore";

/** One ai_reply_decisions row -- the audit log entry PLAN.md's AI auto-reply pipeline writes for every classified message, not only ones it auto-replied to. */
export interface AiReplyDecisionSummary {
  id: string;
  modelUsed: string;
  intentClassified: string;
  confidence: number;
  decision: AiReplyDecisionType;
  replyText: string | null;
  reasoningSnippet: string | null;
  createdAt: string;
}

export interface ConversationThreadProps {
  message: InboxMessageSummary | null;
  decisions: AiReplyDecisionSummary[];
}

const DECISION_LABELS: Record<AiReplyDecisionType, string> = {
  auto_reply: "Auto-replied",
  escalate: "Escalated",
  ignore: "Ignored",
};

/** Detail pane showing one inbox message plus its full ai_reply_decisions history. */
export function ConversationThread({ message, decisions }: ConversationThreadProps) {
  if (!message) {
    return <p>Select a message to view the conversation.</p>;
  }

  return (
    <article>
      <header>
        <h2>{message.senderName ?? message.senderUsername ?? "Unknown sender"}</h2>
        <p>{message.body}</p>
      </header>

      {decisions.length === 0 ? (
        <p>No AI reply decisions yet.</p>
      ) : (
        <ol>
          {decisions.map((decision) => (
            <li key={decision.id}>
              <span>{DECISION_LABELS[decision.decision]}</span>
              <span>{decision.intentClassified}</span>
              <span>{Math.round(decision.confidence * 100)}% confidence</span>
              {decision.replyText && <p>{decision.replyText}</p>}
              {decision.reasoningSnippet && <p>{decision.reasoningSnippet}</p>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
