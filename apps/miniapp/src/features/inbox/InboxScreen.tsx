import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthGate";
import { ConversationThread, type AiReplyDecisionSummary } from "./ConversationThread";
import { InboxList, type InboxMessageSummary } from "./InboxList";

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface InboxScreenProps {
  apiBaseUrl?: string;
}

interface InboxMessageWithDecisions extends InboxMessageSummary {
  decisions: AiReplyDecisionSummary[];
}

interface InboxResponse {
  messages: InboxMessageWithDecisions[];
}

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; messages: InboxMessageWithDecisions[] };

/**
 * Container wiring GET /inbox to InboxList + ConversationThread: fetches on
 * mount, then holds which message is selected so the detail pane can show
 * that message's full ai_reply_decisions history.
 */
export function InboxScreen({ apiBaseUrl = DEFAULT_API_BASE_URL }: InboxScreenProps) {
  const { token } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [selectedMessageId, setSelectedMessageId] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus({ kind: "loading" });
      try {
        const response = await fetch(`${apiBaseUrl}/inbox`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`Failed to load inbox with status ${response.status}`);
        }

        const body = (await response.json()) as InboxResponse;
        if (!cancelled) setStatus({ kind: "loaded", messages: body.messages });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load inbox";
        setStatus({ kind: "error", message });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, token]);

  if (status.kind === "loading") {
    return <div role="status">Loading inbox…</div>;
  }

  if (status.kind === "error") {
    return <div role="alert">{status.message}</div>;
  }

  const selectedMessage = status.messages.find((message) => message.id === selectedMessageId) ?? null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
      <InboxList
        messages={status.messages}
        selectedMessageId={selectedMessageId}
        onSelect={setSelectedMessageId}
      />
      <ConversationThread message={selectedMessage} decisions={selectedMessage?.decisions ?? []} />
    </div>
  );
}
