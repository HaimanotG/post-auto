/**
 * Small curated eval set for the auto-reply pipeline, per PLAN.md's
 * Verification section: "maintain a small curated eval set (comment ->
 * expected intent/decision) run against the pipeline whenever prompts/model
 * config change." Each case pins the intent/gate decision a correctly
 * behaving pipeline should produce for a realistic Facebook/Instagram/Threads
 * comment, plus (for cases expected to auto-reply) content assertions on the
 * generated reply so prompt regressions that fabricate unavailable facts are
 * caught, not just intent-label drift.
 */

import type { AutoReplyGateDecision, IntentLabel } from "../pipelines/intent-classification.js";
import type { BrandVoiceSettings } from "../prompts/reply-generation.js";

export interface AiEvalCase {
  id: string;
  message: string;
  postCaption?: string;
  brandVoice?: BrandVoiceSettings;
  expectedIntent: IntentLabel;
  expectedDecision: AutoReplyGateDecision;
  /** Case-insensitive substrings the generated reply must contain. Only checked when expectedDecision is "auto_reply". */
  replyMustInclude?: string[];
  /** Case-insensitive substrings the generated reply must NOT contain -- e.g. a specific price/stock fact never given in the input, to catch fabrication. Only checked when expectedDecision is "auto_reply". */
  replyMustNotInclude?: string[];
}

export const AI_EVAL_CASES: AiEvalCase[] = [
  {
    id: "price-with-caption-context",
    message: "How much is this?",
    postCaption: "Handwoven cotton scarves, 450 birr each, free delivery in Addis Ababa",
    expectedIntent: "price",
    expectedDecision: "auto_reply",
    replyMustInclude: ["450"],
  },
  {
    id: "price-no-context-must-not-fabricate",
    message: "What's the price on this one?",
    expectedIntent: "price",
    expectedDecision: "auto_reply",
    replyMustNotInclude: ["birr", "$"],
  },
  {
    id: "availability-in-stock",
    message: "Is the medium size still available?",
    postCaption: "Leather sandals, sizes S-XL in stock now",
    expectedIntent: "availability",
    expectedDecision: "auto_reply",
  },
  {
    id: "availability-no-context",
    message: "Do you still have this in stock?",
    expectedIntent: "availability",
    expectedDecision: "auto_reply",
  },
  {
    id: "greeting-plain",
    message: "Hi there! Love your page.",
    expectedIntent: "greeting",
    expectedDecision: "auto_reply",
  },
  {
    id: "greeting-selam",
    message: "Selam! Beautiful products.",
    expectedIntent: "greeting",
    expectedDecision: "auto_reply",
  },
  {
    id: "hours-open-question",
    message: "What time do you open tomorrow?",
    expectedIntent: "hours",
    expectedDecision: "auto_reply",
  },
  {
    id: "hours-weekend",
    message: "Are you open on Sundays?",
    expectedIntent: "hours",
    expectedDecision: "auto_reply",
  },
  {
    id: "other-complaint-escalates",
    message: "This arrived broken and I want a refund immediately.",
    expectedIntent: "other",
    expectedDecision: "escalate",
  },
  {
    id: "other-spam-escalates",
    message: "Check my profile for a free giveaway!!! Follow now!!!",
    expectedIntent: "other",
    expectedDecision: "escalate",
  },
  {
    id: "other-unrelated-question-escalates",
    message: "Do you know a good electrician in Bole?",
    expectedIntent: "other",
    expectedDecision: "escalate",
  },
  {
    id: "greeting-with-brand-voice",
    message: "Hey! Just found your shop.",
    brandVoice: { businessName: "Genet Boutique", tone: "warm and casual" },
    expectedIntent: "greeting",
    expectedDecision: "auto_reply",
    replyMustInclude: ["Genet Boutique"],
  },
];
