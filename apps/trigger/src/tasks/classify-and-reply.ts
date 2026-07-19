import {
  classifyIntent as defaultClassifyIntent,
  DEFAULT_MODEL_ROUTER_CONFIG,
  gateIntentDecision as defaultGateIntentDecision,
  generateReply as defaultGenerateReply,
  type AiTask,
  type AutoReplyGateDecision,
  type ClassifyIntentInput,
  type ClassifyIntentOptions,
  type GateIntentDecisionOptions,
  type GenerateReplyInput,
  type GenerateReplyOptions,
  type GetModelForTaskOptions,
  type IntentClassificationResult,
  type IntentGateResult,
  type ReplyGenerationResult,
} from "@postauto/ai";
import { prisma } from "@postauto/db";
import { tasks, task } from "@trigger.dev/sdk/v3";

export interface ClassifyAndReplyPayload {
  inboxMessageId: string;
}

export interface ClassifyAndReplyResult {
  decision: AutoReplyGateDecision;
  aiReplyDecisionId: string;
}

interface StoredInboxMessage {
  id: string;
  body: string;
  business: { name: string };
  relatedPost: { captionMaster: string | null } | null;
}

interface AiReplyDecisionWriteData {
  inboxMessageId: string;
  modelUsed: string;
  intentClassified: string;
  confidence: number;
  decision: AutoReplyGateDecision;
  replyText: string | null;
  reasoningSnippet: string | null;
}

type InboxMessageStatusUpdate = "auto_replied" | "needs_attention";

/**
 * Structural subset of PrismaClient this task needs, mirroring the narrow
 * interface pattern used by process-meta-webhook.ts's ProcessMetaWebhookStore
 * and publish-post.ts's PublishPostStore.
 */
export interface ClassifyAndReplyStore {
  inboxMessage: {
    findUnique(args: {
      where: { id: string };
      include: { business: true; relatedPost: true };
    }): Promise<StoredInboxMessage | null>;
    update(args: { where: { id: string }; data: { status: InboxMessageStatusUpdate } }): Promise<unknown>;
  };
  aiReplyDecision: {
    create(args: { data: AiReplyDecisionWriteData }): Promise<{ id: string }>;
  };
}

export interface ClassifyAndReplyDeps {
  store: ClassifyAndReplyStore;
  /** Injectable for tests; defaults to packages/ai's classifyIntent. */
  classifyIntent: (input: ClassifyIntentInput, options?: ClassifyIntentOptions) => Promise<IntentClassificationResult>;
  /** Injectable for tests; defaults to packages/ai's gateIntentDecision. */
  gateIntentDecision: (
    classification: IntentClassificationResult,
    options?: GateIntentDecisionOptions,
  ) => IntentGateResult;
  /** Injectable for tests; defaults to packages/ai's generateReply. */
  generateReply: (input: GenerateReplyInput, options?: GenerateReplyOptions) => Promise<ReplyGenerationResult>;
  /** Forwarded to classifyIntent/generateReply so a caller can swap providers/models for both steps at once. */
  modelOptions?: GetModelForTaskOptions;
  confidenceThreshold?: number;
  /** Injectable for tests; defaults to tasks.trigger("publish-reply", ...). */
  enqueuePublishReply: (payload: { aiReplyDecisionId: string; inboxMessageId: string }) => Promise<unknown>;
}

/** Resolves the model name that will back `task`, without constructing a client or requiring an API key -- used only for the ai_reply_decisions.model_used audit column. */
function resolveTaskModelName(task: AiTask, modelOptions?: GetModelForTaskOptions): string {
  return modelOptions?.config?.[task]?.model ?? DEFAULT_MODEL_ROUTER_CONFIG[task].model;
}

/**
 * Pure orchestration for classify-and-reply, matching PLAN.md's auto-reply
 * pipeline: (1) classify the inbox message's intent, (2) gate it against the
 * confidence + allowlist rule, (3) on auto_reply, generate an on-brand reply
 * and enqueue publish-reply; on escalate, no reply is generated. Either way
 * persists an ai_reply_decisions audit row and updates inbox_messages.status
 * (auto_replied / needs_attention) so the mini app's inbox reflects the
 * outcome.
 */
export async function runClassifyAndReply(
  deps: ClassifyAndReplyDeps,
  payload: ClassifyAndReplyPayload,
): Promise<ClassifyAndReplyResult> {
  const message = await deps.store.inboxMessage.findUnique({
    where: { id: payload.inboxMessageId },
    include: { business: true, relatedPost: true },
  });
  if (!message) {
    throw new Error(`InboxMessage ${payload.inboxMessageId} not found`);
  }

  const postCaption = message.relatedPost?.captionMaster ?? undefined;

  const classification = await deps.classifyIntent(
    { message: message.body, postCaption },
    { modelOptions: deps.modelOptions },
  );
  const gate = deps.gateIntentDecision(classification, { confidenceThreshold: deps.confidenceThreshold });

  let replyText: string | null = null;
  let reasoningSnippet: string | null = null;
  let modelUsed = resolveTaskModelName("intent-classification", deps.modelOptions);

  if (gate.decision === "auto_reply") {
    const generated = await deps.generateReply(
      {
        message: message.body,
        intent: classification.intent,
        postCaption,
        brandVoice: { businessName: message.business.name },
      },
      { modelOptions: deps.modelOptions },
    );
    replyText = generated.reply;
    modelUsed = resolveTaskModelName("reply-generation", deps.modelOptions);
  } else {
    reasoningSnippet = gate.reason;
  }

  const decisionRow = await deps.store.aiReplyDecision.create({
    data: {
      inboxMessageId: message.id,
      modelUsed,
      intentClassified: classification.intent,
      confidence: classification.confidence,
      decision: gate.decision,
      replyText,
      reasoningSnippet,
    },
  });

  await deps.store.inboxMessage.update({
    where: { id: message.id },
    data: { status: gate.decision === "auto_reply" ? "auto_replied" : "needs_attention" },
  });

  if (gate.decision === "auto_reply") {
    await deps.enqueuePublishReply({ aiReplyDecisionId: decisionRow.id, inboxMessageId: message.id });
  }

  return { decision: gate.decision, aiReplyDecisionId: decisionRow.id };
}

const prismaStore: ClassifyAndReplyStore = {
  inboxMessage: {
    async findUnique(args) {
      const message = await prisma.inboxMessage.findUnique({
        where: args.where,
        include: { business: { select: { name: true } }, relatedPost: { select: { captionMaster: true } } },
      });
      if (!message) {
        return null;
      }
      return {
        id: message.id,
        body: message.body,
        business: { name: message.business.name },
        relatedPost: message.relatedPost ? { captionMaster: message.relatedPost.captionMaster } : null,
      };
    },
    update: (args) => prisma.inboxMessage.update(args),
  },
  aiReplyDecision: {
    create: (args) => prisma.aiReplyDecision.create({ data: args.data, select: { id: true } }),
  },
};

/**
 * `publish-reply` (the task this enqueues on auto_reply) isn't implemented
 * yet -- it's not part of prd.json's current task queue -- so it's triggered
 * by task-id string, matching the same not-yet-existing-task precedent
 * apps/api's webhooks-meta.ts (m3-02) established for "process-meta-webhook"
 * before m3-03 landed.
 */
export const classifyAndReplyTask = task({
  id: "classify-and-reply",
  run: async (payload: ClassifyAndReplyPayload) => {
    return runClassifyAndReply(
      {
        store: prismaStore,
        classifyIntent: defaultClassifyIntent,
        gateIntentDecision: defaultGateIntentDecision,
        generateReply: defaultGenerateReply,
        enqueuePublishReply: (data) => tasks.trigger("publish-reply", data),
      },
      payload,
    );
  },
});
