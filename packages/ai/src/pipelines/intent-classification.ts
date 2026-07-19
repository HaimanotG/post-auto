import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getModelForTask, type GetModelForTaskOptions } from "../model-router.js";
import {
  buildIntentClassificationUserPrompt,
  INTENT_CLASSIFICATION_SYSTEM_PROMPT,
  type IntentClassificationPromptInput,
} from "../prompts/intent-classification.js";

/**
 * Intents eligible for fully-automated replies (PLAN.md's auto-reply
 * allowlist: price/availability/greeting/hours). "other" is always escalated
 * -- it's the catch-all for anything the classifier isn't confident matches
 * one of the allowlisted intents.
 */
export const ALLOWED_AUTO_REPLY_INTENTS = ["price", "availability", "greeting", "hours"] as const;
export type AllowedAutoReplyIntent = (typeof ALLOWED_AUTO_REPLY_INTENTS)[number];

export const INTENT_LABELS = [...ALLOWED_AUTO_REPLY_INTENTS, "other"] as const;
export type IntentLabel = (typeof INTENT_LABELS)[number];

export const intentClassificationSchema = z.object({
  intent: z.enum(INTENT_LABELS),
  confidence: z.number().min(0).max(1),
});

export type IntentClassificationResult = z.infer<typeof intentClassificationSchema>;

export type ClassifyIntentInput = IntentClassificationPromptInput;

export interface ClassifyIntentOptions {
  /** Injected model, e.g. a fake in tests. Defaults to getModelForTask("intent-classification", modelOptions). */
  model?: BaseChatModel;
  modelOptions?: GetModelForTaskOptions;
}

/**
 * Runs the intent-classification pipeline step: a cheap/fast model returns
 * structured `{intent, confidence}` output for a single inbox message. This
 * is the shared entry point PLAN.md calls out for both the auto-reply
 * pipeline and the future `commands` (voice/chat) intent router.
 */
export async function classifyIntent(
  input: ClassifyIntentInput,
  options: ClassifyIntentOptions = {},
): Promise<IntentClassificationResult> {
  const model = options.model ?? getModelForTask("intent-classification", options.modelOptions);
  const structuredModel = model.withStructuredOutput(intentClassificationSchema);
  const raw = await structuredModel.invoke([
    new SystemMessage(INTENT_CLASSIFICATION_SYSTEM_PROMPT),
    new HumanMessage(buildIntentClassificationUserPrompt(input)),
  ]);
  return intentClassificationSchema.parse(raw);
}

export type AutoReplyGateDecision = "auto_reply" | "escalate";

export type AutoReplyGateReason = "allowed" | "intent_not_allowlisted" | "below_confidence_threshold";

export interface IntentGateResult {
  decision: AutoReplyGateDecision;
  reason: AutoReplyGateReason;
}

/** Default confidence floor below which a classification is escalated rather than auto-replied. */
export const DEFAULT_AUTO_REPLY_CONFIDENCE_THRESHOLD = 0.75;

export interface GateIntentDecisionOptions {
  confidenceThreshold?: number;
}

function isAllowedAutoReplyIntent(intent: IntentLabel): intent is AllowedAutoReplyIntent {
  return (ALLOWED_AUTO_REPLY_INTENTS as readonly string[]).includes(intent);
}

/**
 * Gates a classification result into an auto-reply/escalate decision per
 * PLAN.md step 2: intents outside the allowlist, or below the confidence
 * threshold, are escalated (`ai_reply_decisions.decision=escalate`,
 * `inbox_messages.status=needs_attention`) rather than auto-replied.
 */
export function gateIntentDecision(
  classification: IntentClassificationResult,
  options: GateIntentDecisionOptions = {},
): IntentGateResult {
  const threshold = options.confidenceThreshold ?? DEFAULT_AUTO_REPLY_CONFIDENCE_THRESHOLD;

  if (!isAllowedAutoReplyIntent(classification.intent)) {
    return { decision: "escalate", reason: "intent_not_allowlisted" };
  }
  if (classification.confidence < threshold) {
    return { decision: "escalate", reason: "below_confidence_threshold" };
  }
  return { decision: "auto_reply", reason: "allowed" };
}
