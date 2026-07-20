import type {
  ClassifyIntentInput,
  IntentClassificationResult,
} from "../pipelines/intent-classification.js";
import type { GenerateReplyInput, ReplyGenerationResult } from "../pipelines/reply-generation.js";

/**
 * A deterministic, rule-based stand-in for classifyIntent/generateReply, used
 * as the eval harness's no-credential fallback (CLI default when no
 * ANTHROPIC_API_KEY/OPENAI_API_KEY-backed live run is requested, and the
 * always-on CI test). It is a genuine (if crude) keyword classifier -- not
 * wired to each case's expected answer -- so a passing run is still signal,
 * not a tautology: it classifies purely from message text and would fail
 * cases whose expected intent doesn't match its keyword rules.
 */
export function heuristicClassifyIntent(input: ClassifyIntentInput): Promise<IntentClassificationResult> {
  const message = input.message.toLowerCase();

  if (/\b(price|cost|how much|birr|\$|pricing)\b/.test(message)) {
    return Promise.resolve({ intent: "price", confidence: 0.85 });
  }
  if (/\b(available|availability|in stock|stock|still have|left)\b/.test(message)) {
    return Promise.resolve({ intent: "availability", confidence: 0.85 });
  }
  if (/\b(hour|hours|open|close|closing|opening)\b/.test(message)) {
    return Promise.resolve({ intent: "hours", confidence: 0.85 });
  }
  if (/\b(hi|hello|hey|selam|good morning|good afternoon)\b/.test(message)) {
    return Promise.resolve({ intent: "greeting", confidence: 0.85 });
  }
  return Promise.resolve({ intent: "other", confidence: 0.6 });
}

/**
 * Templated reply per intent, deliberately never inventing a price/stock
 * fact that wasn't present in `input.postCaption` -- mirroring
 * REPLY_GENERATION_SYSTEM_PROMPT's anti-fabrication instruction, so the
 * fabrication-detecting eval cases (dataset.ts's replyMustNotInclude) are a
 * meaningful check even in no-credential mode.
 */
export function heuristicGenerateReply(input: GenerateReplyInput): Promise<ReplyGenerationResult> {
  const sender = input.brandVoice?.businessName;
  const signOff = sender ? ` - ${sender}` : "";
  const priceMatch = input.postCaption?.match(/(\d[\d,]*)\s*birr/i);

  let body: string;
  switch (input.intent) {
    case "price":
      body = priceMatch
        ? `Thanks for asking! It's ${priceMatch[1]} birr.`
        : "Thanks for asking! Let me confirm the exact price and get back to you.";
      break;
    case "availability":
      body = input.postCaption
        ? "Thanks for checking! Yes, please see the post for current stock details."
        : "Thanks for checking! Let me confirm current stock and get back to you.";
      break;
    case "hours":
      body = "Thanks for reaching out! Let me confirm our hours and get back to you shortly.";
      break;
    case "greeting":
    default:
      body = "Thank you so much for the kind words, we appreciate you!";
      break;
  }

  return Promise.resolve({ reply: `${body}${signOff}` });
}
