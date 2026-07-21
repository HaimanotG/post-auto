import type { FastifyInstance } from "fastify";
import type { InboxMessageStatus, InboxMessageType, Platform } from "@postauto/shared";
import { requireAuthenticatedUser, resolveOwnedBusiness, type BusinessContextStore } from "../lib/business-context.js";

interface StoredAiReplyDecision {
  id: string;
  modelUsed: string;
  intentClassified: string;
  confidence: number;
  decision: string;
  replyText: string | null;
  reasoningSnippet: string | null;
  createdAt: Date;
}

interface StoredInboxMessage {
  id: string;
  platform: Platform;
  type: InboxMessageType;
  senderName: string | null;
  senderUsername: string | null;
  body: string;
  status: InboxMessageStatus;
  createdAt: Date;
  aiReplyDecisions: StoredAiReplyDecision[];
}

/**
 * Structural subset of PrismaClient this route needs, mirroring the narrow
 * interface pattern used by routes/analytics.ts's AnalyticsStore.
 */
export interface InboxStore extends BusinessContextStore {
  inboxMessage: {
    findMany(args: {
      where: { businessId: string };
      orderBy: { createdAt: "desc" };
      include: { aiReplyDecisions: { orderBy: { createdAt: "asc" } } };
    }): Promise<StoredInboxMessage[]>;
  };
}

export interface InboxRoutesOptions {
  prisma: InboxStore;
}

/**
 * Registers GET /inbox: the mini app's InboxList/ConversationThread
 * (m3-08) have been rendering against fixture data since M3 shipped the
 * ai_reply_decisions pipeline (process-meta-webhook.ts,
 * classify-and-reply.ts) but nothing ever served the resulting
 * inbox_messages rows back to the frontend. Each message carries its full
 * aiReplyDecisions history so ConversationThread can show the audit trail
 * for whichever message the user selects.
 */
export function registerInboxRoutes(app: FastifyInstance, options: InboxRoutesOptions): void {
  app.get("/inbox", async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply);
    if (!user) return;

    const business = await resolveOwnedBusiness(options.prisma, user);

    const messages = await options.prisma.inboxMessage.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      include: { aiReplyDecisions: { orderBy: { createdAt: "asc" } } },
    });

    await reply.code(200).send({
      messages: messages.map((message) => ({
        id: message.id,
        platform: message.platform,
        type: message.type,
        senderName: message.senderName,
        senderUsername: message.senderUsername,
        body: message.body,
        status: message.status,
        createdAt: message.createdAt.toISOString(),
        decisions: message.aiReplyDecisions.map((decision) => ({
          id: decision.id,
          modelUsed: decision.modelUsed,
          intentClassified: decision.intentClassified,
          confidence: decision.confidence,
          decision: decision.decision,
          replyText: decision.replyText,
          reasoningSnippet: decision.reasoningSnippet,
          createdAt: decision.createdAt.toISOString(),
        })),
      })),
    });
  });
}
