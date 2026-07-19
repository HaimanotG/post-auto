import { NeedsAttentionBadge, type InboxMessageStatus } from "./NeedsAttentionBadge";

/** Mirrors the Platform/InboxMessageType enums in packages/db/prisma/schema.prisma. */
export type InboxPlatform = "facebook_page" | "instagram_business" | "threads";
export type InboxMessageType = "comment" | "mention" | "dm";

/** One inbox_messages row's display fields, as the (future) GET /inbox route would return them. */
export interface InboxMessageSummary {
  id: string;
  platform: InboxPlatform;
  type: InboxMessageType;
  senderName: string | null;
  senderUsername: string | null;
  body: string;
  status: InboxMessageStatus;
  createdAt: string;
}

export interface InboxListProps {
  messages: InboxMessageSummary[];
  selectedMessageId?: string;
  onSelect: (messageId: string) => void;
}

function senderLabel(message: InboxMessageSummary): string {
  return message.senderName ?? message.senderUsername ?? "Unknown sender";
}

/** Mini app inbox list per PLAN.md's M3 scope: one row per inbox_messages row; ordering is left to the caller. */
export function InboxList({ messages, selectedMessageId, onSelect }: InboxListProps) {
  if (messages.length === 0) {
    return <p>No messages yet.</p>;
  }

  return (
    <ul>
      {messages.map((message) => (
        <li key={message.id}>
          <button
            type="button"
            aria-current={message.id === selectedMessageId}
            onClick={() => onSelect(message.id)}
          >
            <span>{senderLabel(message)}</span>
            <NeedsAttentionBadge status={message.status} />
            <p>{message.body}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
