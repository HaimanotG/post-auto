import {
  classifyIntent as defaultClassifyIntent,
  gateIntentDecision as defaultGateIntentDecision,
  type AutoReplyGateDecision,
  type ClassifyIntentInput,
  type ClassifyIntentOptions,
  type GateIntentDecisionOptions,
  type IntentClassificationResult,
  type IntentGateResult,
  type IntentLabel,
} from "../pipelines/intent-classification.js";
import {
  generateReply as defaultGenerateReply,
  type GenerateReplyInput,
  type GenerateReplyOptions,
  type ReplyGenerationResult,
} from "../pipelines/reply-generation.js";
import type { AiEvalCase } from "./dataset.js";

export interface ReplyCheckFailure {
  rule: "must_include" | "must_not_include";
  text: string;
}

export interface AiEvalCaseResult {
  id: string;
  expectedIntent: IntentLabel;
  expectedDecision: AutoReplyGateDecision;
  classification: IntentClassificationResult;
  gate: IntentGateResult;
  reply: ReplyGenerationResult | null;
  intentCorrect: boolean;
  decisionCorrect: boolean;
  replyCheckFailures: ReplyCheckFailure[];
  passed: boolean;
}

export interface AiEvalSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  intentAccuracy: number;
  decisionAccuracy: number;
  results: AiEvalCaseResult[];
}

export interface RunAiEvalOptions {
  /** Injectable for tests/CLI fallback; defaults to packages/ai's real classifyIntent (hits a real model). */
  classifyIntent?: (input: ClassifyIntentInput, options?: ClassifyIntentOptions) => Promise<IntentClassificationResult>;
  /** Injectable for tests/CLI fallback; defaults to packages/ai's real gateIntentDecision. */
  gateIntentDecision?: (classification: IntentClassificationResult, options?: GateIntentDecisionOptions) => IntentGateResult;
  /** Injectable for tests/CLI fallback; defaults to packages/ai's real generateReply (hits a real model). */
  generateReply?: (input: GenerateReplyInput, options?: GenerateReplyOptions) => Promise<ReplyGenerationResult>;
  classifyOptions?: ClassifyIntentOptions;
  gateOptions?: GateIntentDecisionOptions;
  replyOptions?: GenerateReplyOptions;
}

function checkReply(replyText: string, evalCase: AiEvalCase): ReplyCheckFailure[] {
  const lower = replyText.toLowerCase();
  const failures: ReplyCheckFailure[] = [];
  for (const text of evalCase.replyMustInclude ?? []) {
    if (!lower.includes(text.toLowerCase())) {
      failures.push({ rule: "must_include", text });
    }
  }
  for (const text of evalCase.replyMustNotInclude ?? []) {
    if (lower.includes(text.toLowerCase())) {
      failures.push({ rule: "must_not_include", text });
    }
  }
  return failures;
}

/**
 * Runs `cases` end-to-end through classifyIntent -> gateIntentDecision ->
 * (on auto_reply only) generateReply, matching classify-and-reply.ts's real
 * orchestration, and scores each case against its expected intent/decision
 * (and reply content rules, when applicable). Model-calling steps are
 * injectable so this same scorer runs against a real provider (live eval,
 * needs an API key) or a fixture/heuristic stand-in (CI-safe, no network).
 */
export async function runAiEval(cases: AiEvalCase[], options: RunAiEvalOptions = {}): Promise<AiEvalSummary> {
  const classifyIntent = options.classifyIntent ?? defaultClassifyIntent;
  const gateIntentDecision = options.gateIntentDecision ?? defaultGateIntentDecision;
  const generateReply = options.generateReply ?? defaultGenerateReply;

  const results: AiEvalCaseResult[] = [];

  for (const evalCase of cases) {
    const classification = await classifyIntent(
      { message: evalCase.message, postCaption: evalCase.postCaption },
      options.classifyOptions,
    );
    const gate = gateIntentDecision(classification, options.gateOptions);

    let reply: ReplyGenerationResult | null = null;
    let replyCheckFailures: ReplyCheckFailure[] = [];
    if (gate.decision === "auto_reply") {
      reply = await generateReply(
        {
          message: evalCase.message,
          intent: classification.intent,
          postCaption: evalCase.postCaption,
          brandVoice: evalCase.brandVoice,
        },
        options.replyOptions,
      );
      replyCheckFailures = checkReply(reply.reply, evalCase);
    }

    const intentCorrect = classification.intent === evalCase.expectedIntent;
    const decisionCorrect = gate.decision === evalCase.expectedDecision;
    const passed = intentCorrect && decisionCorrect && replyCheckFailures.length === 0;

    results.push({
      id: evalCase.id,
      expectedIntent: evalCase.expectedIntent,
      expectedDecision: evalCase.expectedDecision,
      classification,
      gate,
      reply,
      intentCorrect,
      decisionCorrect,
      replyCheckFailures,
      passed,
    });
  }

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;

  return {
    total,
    passed,
    failed: total - passed,
    passRate: total === 0 ? 1 : passed / total,
    intentAccuracy: total === 0 ? 1 : results.filter((r) => r.intentCorrect).length / total,
    decisionAccuracy: total === 0 ? 1 : results.filter((r) => r.decisionCorrect).length / total,
    results,
  };
}
