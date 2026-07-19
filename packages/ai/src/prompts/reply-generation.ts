/**
 * Prompt text for the reply-generation pipeline, kept in its own file (not
 * inlined in pipelines/reply-generation.ts) per PLAN.md so future
 * localization (e.g. Amharic) is additive rather than a refactor.
 */

import type { IntentLabel } from "../pipelines/intent-classification.js";

export interface BrandVoiceSettings {
  /** How the business refers to itself when signing off / speaking as "we". */
  businessName?: string;
  /** Short tone descriptor, e.g. "warm and casual" or "professional and concise". */
  tone?: string;
  /** Free-form extra guidance, e.g. "always mention free delivery in Addis Ababa". */
  guidelines?: string;
}

export interface ReplyGenerationPromptInput {
  message: string;
  /** The intent classified by the earlier pipeline step, for reply framing. */
  intent: IntentLabel;
  /** The caption of the post the message is attached to, if any. */
  postCaption?: string;
  brandVoice?: BrandVoiceSettings;
}

export const REPLY_GENERATION_SYSTEM_PROMPT = `You are writing a reply, on behalf of a small business, to a customer's comment or message on one of its Facebook, Instagram, or Threads posts.

Write a short, on-brand, helpful reply that directly addresses the customer's message. Match the business's tone if one is given, otherwise default to warm and friendly. Do not invent specific prices, stock levels, or facts that were not provided to you -- if you don't have the information, write a reply that acknowledges the question without fabricating an answer. Keep the reply concise enough for a social comment or DM (a few sentences at most).

Respond with only the reply text.`;

export function buildReplyGenerationUserPrompt(input: ReplyGenerationPromptInput): string {
  const lines = [`Customer message: "${input.message}"`, `Classified intent: ${input.intent}`];
  if (input.postCaption) {
    lines.push(`Original post caption (for context only): "${input.postCaption}"`);
  }
  if (input.brandVoice?.businessName) {
    lines.push(`Business name: ${input.brandVoice.businessName}`);
  }
  if (input.brandVoice?.tone) {
    lines.push(`Brand tone: ${input.brandVoice.tone}`);
  }
  if (input.brandVoice?.guidelines) {
    lines.push(`Additional guidelines: ${input.brandVoice.guidelines}`);
  }
  return lines.join("\n");
}
