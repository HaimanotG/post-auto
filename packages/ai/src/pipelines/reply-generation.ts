import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getModelForTask, type GetModelForTaskOptions } from "../model-router.js";
import {
  buildReplyGenerationUserPrompt,
  REPLY_GENERATION_SYSTEM_PROMPT,
  type ReplyGenerationPromptInput,
} from "../prompts/reply-generation.js";

export const replyGenerationSchema = z.object({
  reply: z.string().min(1),
});

export type ReplyGenerationResult = z.infer<typeof replyGenerationSchema>;

export type GenerateReplyInput = ReplyGenerationPromptInput;

export interface GenerateReplyOptions {
  /** Injected model, e.g. a fake in tests. Defaults to getModelForTask("reply-generation", modelOptions). */
  model?: BaseChatModel;
  modelOptions?: GetModelForTaskOptions;
}

/**
 * Runs the reply-generation pipeline step: a stronger model writes an
 * on-brand reply from the customer's message, its classified intent, the
 * post caption, and brand-voice settings, per PLAN.md's auto-reply pipeline
 * step 3.
 */
export async function generateReply(
  input: GenerateReplyInput,
  options: GenerateReplyOptions = {},
): Promise<ReplyGenerationResult> {
  const model = options.model ?? getModelForTask("reply-generation", options.modelOptions);
  const structuredModel = model.withStructuredOutput(replyGenerationSchema);
  const raw = await structuredModel.invoke([
    new SystemMessage(REPLY_GENERATION_SYSTEM_PROMPT),
    new HumanMessage(buildReplyGenerationUserPrompt(input)),
  ]);
  return replyGenerationSchema.parse(raw);
}
