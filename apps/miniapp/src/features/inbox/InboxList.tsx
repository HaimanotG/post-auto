import { platformLabel } from "../../app/platform-labels";
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
    return <p className="px-4 py-6 text-center text-[14.5px] text-pa-hint">No messages yet.</p>;
  }

  return (
    <ul>
      {messages.map((message) => (
        <li key={message.id} className="border-b border-pa-separator last:border-b-0">
          <button
            type="button"
            aria-current={message.id === selectedMessageId}
            onClick={() => onSelect(message.id)}
            className="flex w-full gap-3 px-4 py-3.5 text-left"
          >
            <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-pa-secondary-bg text-base font-bold text-pa-hint">
              {senderLabel(message).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-semibold text-pa-text">{senderLabel(message)}</span>
                <span className="text-[11.5px] text-pa-hint">· {platformLabel(message.platform)}</span>
              </div>
              <p className="mt-px truncate text-[13.5px] text-pa-hint">{message.body}</p>
            </div>
            <NeedsAttentionBadge status={message.status} className="flex-none self-center" />
          </button>
        </li>
      ))}
    </ul>
  );
}
