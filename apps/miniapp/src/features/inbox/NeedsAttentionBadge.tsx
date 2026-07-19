/**
 * Mirrors the `inbox_messages.status` enum (packages/db/prisma/schema.prisma
 * InboxMessageStatus) -- kept as a local literal type per the mini app's
 * existing convention (see TemplatePicker.tsx) of not depending on
 * packages/db from the frontend.
 */
export type InboxMessageStatus = "new" | "auto_replied" | "needs_attention" | "resolved" | "ignored";

export interface NeedsAttentionBadgeProps {
  status: InboxMessageStatus;
}

/**
 * Flags inbox messages the AI auto-reply pipeline escalated instead of
 * answering -- below the confidence/allowlist gate described in PLAN.md's
 * AI auto-reply section. Renders nothing for every other status.
 */
export function NeedsAttentionBadge({ status }: NeedsAttentionBadgeProps) {
  if (status !== "needs_attention") {
    return null;
  }

  return <span role="status">Needs attention</span>;
}
