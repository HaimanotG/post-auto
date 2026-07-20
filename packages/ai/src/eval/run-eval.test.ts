import { describe, expect, it, vi } from "vitest";
import type { ClassifyIntentInput, IntentClassificationResult } from "../pipelines/intent-classification.js";
import type { AiEvalCase } from "./dataset.js";
import { runAiEval } from "./run-eval.js";

describe("runAiEval", () => {
  it("scores intent/decision correctness and only generates a reply on auto_reply", async () => {
    const cases: AiEvalCase[] = [
      { id: "auto-reply-case", message: "hi", expectedIntent: "greeting", expectedDecision: "auto_reply" },
      { id: "escalate-case", message: "refund now", expectedIntent: "other", expectedDecision: "escalate" },
    ];

    const classifyIntent = vi.fn(async (input: ClassifyIntentInput) =>
      input.message === "hi" ? { intent: "greeting" as const, confidence: 0.9 } : { intent: "other" as const, confidence: 0.6 },
    );
    const gateIntentDecision = vi.fn((classification: IntentClassificationResult) =>
      classification.intent === "greeting"
        ? { decision: "auto_reply" as const, reason: "allowed" as const }
        : { decision: "escalate" as const, reason: "intent_not_allowlisted" as const },
    );
    const generateReply = vi.fn(async () => ({ reply: "Thanks!" }));

    const summary = await runAiEval(cases, { classifyIntent, gateIntentDecision, generateReply });

    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.passRate).toBe(1);
    expect(summary.intentAccuracy).toBe(1);
    expect(summary.decisionAccuracy).toBe(1);
    expect(generateReply).toHaveBeenCalledTimes(1);
    expect(generateReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: "hi", intent: "greeting" }),
      undefined,
    );
    expect(summary.results[1]?.reply).toBeNull();
  });

  it("marks a case failed when the classified intent doesn't match expectations", async () => {
    const cases: AiEvalCase[] = [{ id: "wrong-intent", message: "how much?", expectedIntent: "price", expectedDecision: "auto_reply" }];

    const summary = await runAiEval(cases, {
      classifyIntent: async () => ({ intent: "availability", confidence: 0.9 }),
      gateIntentDecision: () => ({ decision: "auto_reply", reason: "allowed" }),
      generateReply: async () => ({ reply: "In stock!" }),
    });

    expect(summary.results[0]?.intentCorrect).toBe(false);
    expect(summary.results[0]?.decisionCorrect).toBe(true);
    expect(summary.results[0]?.passed).toBe(false);
    expect(summary.passRate).toBe(0);
  });

  it("marks a case failed when the gated decision doesn't match expectations", async () => {
    const cases: AiEvalCase[] = [{ id: "wrong-decision", message: "how much?", expectedIntent: "price", expectedDecision: "auto_reply" }];

    const summary = await runAiEval(cases, {
      classifyIntent: async () => ({ intent: "price", confidence: 0.4 }),
      gateIntentDecision: () => ({ decision: "escalate", reason: "below_confidence_threshold" }),
      generateReply: async () => ({ reply: "should not be called" }),
    });

    expect(summary.results[0]?.decisionCorrect).toBe(false);
    expect(summary.results[0]?.passed).toBe(false);
  });

  it("fails a case whose reply is missing a required substring, case-insensitively", async () => {
    const cases: AiEvalCase[] = [
      {
        id: "must-include",
        message: "how much?",
        expectedIntent: "price",
        expectedDecision: "auto_reply",
        replyMustInclude: ["450 birr"],
      },
    ];

    const summary = await runAiEval(cases, {
      classifyIntent: async () => ({ intent: "price", confidence: 0.9 }),
      gateIntentDecision: () => ({ decision: "auto_reply", reason: "allowed" }),
      generateReply: async () => ({ reply: "It's 450 BIRR, thanks!" }),
    });

    expect(summary.results[0]?.replyCheckFailures).toEqual([]);
    expect(summary.results[0]?.passed).toBe(true);
  });

  it("fails a case whose reply contains a forbidden fabricated substring", async () => {
    const cases: AiEvalCase[] = [
      {
        id: "must-not-include",
        message: "how much?",
        expectedIntent: "price",
        expectedDecision: "auto_reply",
        replyMustNotInclude: ["birr"],
      },
    ];

    const summary = await runAiEval(cases, {
      classifyIntent: async () => ({ intent: "price", confidence: 0.9 }),
      gateIntentDecision: () => ({ decision: "auto_reply", reason: "allowed" }),
      generateReply: async () => ({ reply: "It's about 300 Birr I think." }),
    });

    expect(summary.results[0]?.replyCheckFailures).toEqual([{ rule: "must_not_include", text: "birr" }]);
    expect(summary.results[0]?.passed).toBe(false);
  });

  it("returns a neutral summary for an empty case list", async () => {
    const summary = await runAiEval([], {
      classifyIntent: async () => ({ intent: "other", confidence: 0.5 }),
      gateIntentDecision: () => ({ decision: "escalate", reason: "intent_not_allowlisted" }),
      generateReply: async () => ({ reply: "" }),
    });

    expect(summary).toMatchObject({ total: 0, passed: 0, failed: 0, passRate: 1, intentAccuracy: 1, decisionAccuracy: 1, results: [] });
  });
});
