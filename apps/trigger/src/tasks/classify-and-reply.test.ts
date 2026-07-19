import { describe, expect, it, vi } from "vitest";
import { runClassifyAndReply, type ClassifyAndReplyDeps, type ClassifyAndReplyStore } from "./classify-and-reply.js";

interface BuildDepsOptions {
  message?: {
    id: string;
    body: string;
    business: { name: string };
    relatedPost: { captionMaster: string | null } | null;
  } | null;
  classification?: { intent: "price" | "availability" | "greeting" | "hours" | "other"; confidence: number };
  gate?: { decision: "auto_reply" | "escalate"; reason: "allowed" | "intent_not_allowlisted" | "below_confidence_threshold" };
  reply?: { reply: string };
}

function buildDeps(options: BuildDepsOptions = {}) {
  const message =
    options.message === undefined
      ? {
          id: "inbox_message_1",
          body: "How much is this?",
          business: { name: "Boutique Addis" },
          relatedPost: { captionMaster: "New arrivals, ETB 500" },
        }
      : options.message;

  const classification = options.classification ?? { intent: "price" as const, confidence: 0.9 };
  const gate = options.gate ?? { decision: "auto_reply" as const, reason: "allowed" as const };
  const reply = options.reply ?? { reply: "It's ETB 500!" };

  const store: ClassifyAndReplyStore = {
    inboxMessage: {
      findUnique: vi.fn().mockResolvedValue(message),
      update: vi.fn().mockResolvedValue(undefined),
    },
    aiReplyDecision: {
      create: vi.fn().mockResolvedValue({ id: "ai_reply_decision_1" }),
    },
  };

  const classifyIntent = vi.fn().mockResolvedValue(classification);
  const gateIntentDecision = vi.fn().mockReturnValue(gate);
  const generateReply = vi.fn().mockResolvedValue(reply);
  const enqueuePublishReply = vi.fn().mockResolvedValue(undefined);

  const deps: ClassifyAndReplyDeps = {
    store,
    classifyIntent,
    gateIntentDecision,
    generateReply,
    enqueuePublishReply,
  };

  return { deps, store, classifyIntent, gateIntentDecision, generateReply, enqueuePublishReply };
}

describe("runClassifyAndReply", () => {
  it("throws when the inbox message doesn't exist", async () => {
    const { deps } = buildDeps({ message: null });

    await expect(runClassifyAndReply(deps, { inboxMessageId: "missing" })).rejects.toThrow("not found");
  });

  it("classifies, generates a reply, persists an auto_reply decision, marks the message auto_replied, and enqueues publish-reply", async () => {
    const { deps, store, classifyIntent, gateIntentDecision, generateReply, enqueuePublishReply } = buildDeps();

    const result = await runClassifyAndReply(deps, { inboxMessageId: "inbox_message_1" });

    expect(result).toEqual({ decision: "auto_reply", aiReplyDecisionId: "ai_reply_decision_1" });

    expect(classifyIntent).toHaveBeenCalledWith(
      { message: "How much is this?", postCaption: "New arrivals, ETB 500" },
      { modelOptions: undefined },
    );
    expect(gateIntentDecision).toHaveBeenCalledWith(
      { intent: "price", confidence: 0.9 },
      { confidenceThreshold: undefined },
    );
    expect(generateReply).toHaveBeenCalledWith(
      {
        message: "How much is this?",
        intent: "price",
        postCaption: "New arrivals, ETB 500",
        brandVoice: { businessName: "Boutique Addis" },
      },
      { modelOptions: undefined },
    );

    expect(store.aiReplyDecision.create).toHaveBeenCalledWith({
      data: {
        inboxMessageId: "inbox_message_1",
        modelUsed: "claude-3-5-sonnet-20241022",
        intentClassified: "price",
        confidence: 0.9,
        decision: "auto_reply",
        replyText: "It's ETB 500!",
        reasoningSnippet: null,
      },
    });
    expect(store.inboxMessage.update).toHaveBeenCalledWith({
      where: { id: "inbox_message_1" },
      data: { status: "auto_replied" },
    });
    expect(enqueuePublishReply).toHaveBeenCalledWith({
      aiReplyDecisionId: "ai_reply_decision_1",
      inboxMessageId: "inbox_message_1",
    });
  });

  it("escalates without generating a reply or enqueuing publish-reply when the intent isn't allowlisted", async () => {
    const { deps, store, generateReply, enqueuePublishReply } = buildDeps({
      classification: { intent: "other", confidence: 0.95 },
      gate: { decision: "escalate", reason: "intent_not_allowlisted" },
    });

    const result = await runClassifyAndReply(deps, { inboxMessageId: "inbox_message_1" });

    expect(result).toEqual({ decision: "escalate", aiReplyDecisionId: "ai_reply_decision_1" });
    expect(generateReply).not.toHaveBeenCalled();
    expect(enqueuePublishReply).not.toHaveBeenCalled();
    expect(store.aiReplyDecision.create).toHaveBeenCalledWith({
      data: {
        inboxMessageId: "inbox_message_1",
        modelUsed: "claude-3-5-haiku-20241022",
        intentClassified: "other",
        confidence: 0.95,
        decision: "escalate",
        replyText: null,
        reasoningSnippet: "intent_not_allowlisted",
      },
    });
    expect(store.inboxMessage.update).toHaveBeenCalledWith({
      where: { id: "inbox_message_1" },
      data: { status: "needs_attention" },
    });
  });

  it("escalates below the confidence threshold, recording the gate's reasoning_snippet", async () => {
    const { deps, store } = buildDeps({
      classification: { intent: "availability", confidence: 0.4 },
      gate: { decision: "escalate", reason: "below_confidence_threshold" },
    });

    await runClassifyAndReply(deps, { inboxMessageId: "inbox_message_1" });

    expect(store.aiReplyDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ decision: "escalate", reasoningSnippet: "below_confidence_threshold" }),
      }),
    );
  });

  it("passes postCaption as undefined when the message has no related post", async () => {
    const { deps, classifyIntent, generateReply } = buildDeps({
      message: { id: "inbox_message_1", body: "Hello!", business: { name: "Boutique Addis" }, relatedPost: null },
      classification: { intent: "greeting", confidence: 0.99 },
    });

    await runClassifyAndReply(deps, { inboxMessageId: "inbox_message_1" });

    expect(classifyIntent).toHaveBeenCalledWith({ message: "Hello!", postCaption: undefined }, expect.anything());
    expect(generateReply).toHaveBeenCalledWith(
      expect.objectContaining({ postCaption: undefined }),
      expect.anything(),
    );
  });

  it("forwards modelOptions and confidenceThreshold to classifyIntent/gateIntentDecision/generateReply", async () => {
    const { deps, classifyIntent, gateIntentDecision, generateReply } = buildDeps();
    const modelOptions = { config: { "reply-generation": { model: "gpt-4o" } } };
    deps.modelOptions = modelOptions;
    deps.confidenceThreshold = 0.5;

    await runClassifyAndReply(deps, { inboxMessageId: "inbox_message_1" });

    expect(classifyIntent).toHaveBeenCalledWith(expect.anything(), { modelOptions });
    expect(gateIntentDecision).toHaveBeenCalledWith(expect.anything(), { confidenceThreshold: 0.5 });
    expect(generateReply).toHaveBeenCalledWith(expect.anything(), { modelOptions });
  });

  it("records the overridden model name in modelUsed when modelOptions overrides reply-generation", async () => {
    const { deps, store } = buildDeps();
    deps.modelOptions = { config: { "reply-generation": { model: "gpt-4o" } } };

    await runClassifyAndReply(deps, { inboxMessageId: "inbox_message_1" });

    expect(store.aiReplyDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ modelUsed: "gpt-4o" }) }),
    );
  });
});
