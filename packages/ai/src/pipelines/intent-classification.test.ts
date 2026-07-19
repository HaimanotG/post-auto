import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { INTENT_CLASSIFICATION_SYSTEM_PROMPT } from "../prompts/intent-classification.js";
import {
  ALLOWED_AUTO_REPLY_INTENTS,
  classifyIntent,
  DEFAULT_AUTO_REPLY_CONFIDENCE_THRESHOLD,
  gateIntentDecision,
  type IntentClassificationResult,
} from "./intent-classification.js";

/** Fake BaseChatModel-shaped stand-in so tests never construct a real provider client or hit the network. */
function fakeStructuredModel(result: IntentClassificationResult, onInvoke?: (messages: unknown[]) => void): BaseChatModel {
  return {
    withStructuredOutput: () => ({
      invoke: async (messages: unknown[]) => {
        onInvoke?.(messages);
        return result;
      },
    }),
  } as unknown as BaseChatModel;
}

describe("classifyIntent", () => {
  it("returns the structured {intent, confidence} result from the model", async () => {
    const model = fakeStructuredModel({ intent: "price", confidence: 0.92 });

    const result = await classifyIntent({ message: "How much is this?" }, { model });

    expect(result).toEqual({ intent: "price", confidence: 0.92 });
  });

  it("sends the system prompt and a user prompt containing the message and post caption", async () => {
    let sentMessages: unknown[] = [];
    const model = fakeStructuredModel({ intent: "availability", confidence: 0.8 }, (messages) => {
      sentMessages = messages;
    });

    await classifyIntent({ message: "Is this still available?", postCaption: "Fresh avocados, 50 birr/kg" }, { model });

    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[0]).toBeInstanceOf(SystemMessage);
    expect((sentMessages[0] as SystemMessage).content).toBe(INTENT_CLASSIFICATION_SYSTEM_PROMPT);
    expect(sentMessages[1]).toBeInstanceOf(HumanMessage);
    const userContent = (sentMessages[1] as HumanMessage).content as string;
    expect(userContent).toContain("Is this still available?");
    expect(userContent).toContain("Fresh avocados, 50 birr/kg");
  });

  it("throws if the model returns output that doesn't match the schema", async () => {
    const model = {
      withStructuredOutput: () => ({
        invoke: async () => ({ intent: "not-a-real-intent", confidence: 2 }),
      }),
    } as unknown as BaseChatModel;

    await expect(classifyIntent({ message: "hi" }, { model })).rejects.toThrow();
  });
});

describe("gateIntentDecision", () => {
  it.each(ALLOWED_AUTO_REPLY_INTENTS)("auto-replies allowlisted intent %s when confidence is at/above the default threshold", (intent) => {
    const result = gateIntentDecision({ intent, confidence: DEFAULT_AUTO_REPLY_CONFIDENCE_THRESHOLD });
    expect(result).toEqual({ decision: "auto_reply", reason: "allowed" });
  });

  it("escalates an allowlisted intent when confidence is below the default threshold", () => {
    const result = gateIntentDecision({ intent: "price", confidence: 0.74 });
    expect(result).toEqual({ decision: "escalate", reason: "below_confidence_threshold" });
  });

  it("escalates a non-allowlisted intent even at full confidence", () => {
    const result = gateIntentDecision({ intent: "other", confidence: 1 });
    expect(result).toEqual({ decision: "escalate", reason: "intent_not_allowlisted" });
  });

  it("respects a custom confidence threshold", () => {
    expect(gateIntentDecision({ intent: "hours", confidence: 0.6 }, { confidenceThreshold: 0.5 })).toEqual({
      decision: "auto_reply",
      reason: "allowed",
    });
    expect(gateIntentDecision({ intent: "hours", confidence: 0.6 }, { confidenceThreshold: 0.9 })).toEqual({
      decision: "escalate",
      reason: "below_confidence_threshold",
    });
  });

  it("treats intent_not_allowlisted as taking priority over the confidence check", () => {
    const result = gateIntentDecision({ intent: "other", confidence: 0.99 }, { confidenceThreshold: 0.99 });
    expect(result.reason).toBe("intent_not_allowlisted");
  });
});
