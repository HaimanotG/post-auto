/**
 * Prompt text for the intent-classification pipeline, kept in its own file
 * (not inlined in pipelines/intent-classification.ts) per PLAN.md so future
 * localization (e.g. Amharic) is additive rather than a refactor.
 */

export interface IntentClassificationPromptInput {
  message: string;
  /** The caption of the post the message is attached to, if any (extra context for ambiguous messages). */
  postCaption?: string;
}

export const INTENT_CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for comments, mentions, and DMs a small business receives on its Facebook, Instagram, or Threads posts.

Classify the customer's message into exactly one of these intents:
- "price": asking about the price/cost of a product or service.
- "availability": asking whether a product is in stock, available, or orderable.
- "greeting": a greeting or general pleasantry with no specific question.
- "hours": asking about business hours or when the business is open.
- "other": anything else (complaints, negotiations, spam, unrelated questions, or anything that doesn't clearly fit the intents above).

Respond with your best-guess intent and a confidence score between 0 and 1 reflecting how certain you are.`;

export function buildIntentClassificationUserPrompt(input: IntentClassificationPromptInput): string {
  const lines = [`Customer message: "${input.message}"`];
  if (input.postCaption) {
    lines.push(`Original post caption (for context only): "${input.postCaption}"`);
  }
  return lines.join("\n");
}
