import { platformLabel } from "../../app/platform-labels";
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

const DECISION_BADGE_CLASSES: Record<AiReplyDecisionType, string> = {
  auto_reply: "bg-pa-good/15 text-pa-good",
  escalate: "bg-pa-warn-bg text-pa-warn-text",
  ignore: "bg-pa-bg text-pa-hint",
};

/** Detail pane showing one inbox message plus its full ai_reply_decisions history. */
export function ConversationThread({ message, decisions }: ConversationThreadProps) {
  if (!message) {
    return <p className="px-4 py-6 text-center text-[14.5px] text-pa-hint">Select a message to view the conversation.</p>;
  }

  return (
    <article className="px-4 pt-[18px] pb-6">
      <header className="mb-[22px]">
        <p className="mb-1.5 text-[12.5px] font-semibold tracking-[0.4px] text-pa-hint uppercase">
          {platformLabel(message.platform)} · {message.type}
        </p>
        <h2 className="mb-1.5 text-[17px] font-bold text-pa-text">
          {message.senderName ?? message.senderUsername ?? "Unknown sender"}
        </h2>
        <p className="rounded-[14px] bg-pa-secondary-bg p-3.5 text-[15px] leading-snug text-pa-text">{message.body}</p>
      </header>

      <div className="px-1 pb-2 text-[13px] font-semibold tracking-[0.4px] text-pa-hint uppercase">
        AI reply history
      </div>

      {decisions.length === 0 ? (
        <p className="text-[14px] text-pa-hint">No AI reply decisions yet.</p>
      ) : (
        <ol>
          {decisions.map((decision) => (
            <li key={decision.id} className="mb-2.5 rounded-[14px] bg-pa-secondary-bg p-3.5">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`rounded-lg px-2 py-[3px] text-[11px] font-bold ${DECISION_BADGE_CLASSES[decision.decision]}`}>
                  {DECISION_LABELS[decision.decision]}
                </span>
                <span className="text-xs text-pa-hint">
                  <span>{decision.intentClassified}</span> · <span>{Math.round(decision.confidence * 100)}% confidence</span>
                </span>
              </div>
              {decision.replyText && <p className="mb-1 text-sm leading-snug text-pa-text">{decision.replyText}</p>}
              {decision.reasoningSnippet && (
                <p className="text-[12.5px] leading-snug text-pa-hint">{decision.reasoningSnippet}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
