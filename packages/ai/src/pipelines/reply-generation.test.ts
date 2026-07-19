import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { REPLY_GENERATION_SYSTEM_PROMPT } from "../prompts/reply-generation.js";
import { generateReply, type ReplyGenerationResult } from "./reply-generation.js";

/** Fake BaseChatModel-shaped stand-in so tests never construct a real provider client or hit the network. */
function fakeStructuredModel(result: ReplyGenerationResult, onInvoke?: (messages: unknown[]) => void): BaseChatModel {
  return {
    withStructuredOutput: () => ({
      invoke: async (messages: unknown[]) => {
        onInvoke?.(messages);
        return result;
      },
    }),
  } as unknown as BaseChatModel;
}

describe("generateReply", () => {
  it("returns the structured {reply} result from the model", async () => {
    const model = fakeStructuredModel({ reply: "It's 50 birr per kg!" });

    const result = await generateReply({ message: "How much is this?", intent: "price" }, { model });

    expect(result).toEqual({ reply: "It's 50 birr per kg!" });
  });

  it("sends the system prompt and a user prompt containing the message, intent, caption, and brand voice", async () => {
    let sentMessages: unknown[] = [];
    const model = fakeStructuredModel({ reply: "Yes, still in stock!" }, (messages) => {
      sentMessages = messages;
    });

    await generateReply(
      {
        message: "Is this still available?",
        intent: "availability",
        postCaption: "Fresh avocados, 50 birr/kg",
        brandVoice: { businessName: "Addis Fresh Mart", tone: "warm and casual", guidelines: "mention free delivery" },
      },
      { model },
    );

    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[0]).toBeInstanceOf(SystemMessage);
    expect((sentMessages[0] as SystemMessage).content).toBe(REPLY_GENERATION_SYSTEM_PROMPT);
    expect(sentMessages[1]).toBeInstanceOf(HumanMessage);
    const userContent = (sentMessages[1] as HumanMessage).content as string;
    expect(userContent).toContain("Is this still available?");
    expect(userContent).toContain("availability");
    expect(userContent).toContain("Fresh avocados, 50 birr/kg");
    expect(userContent).toContain("Addis Fresh Mart");
    expect(userContent).toContain("warm and casual");
    expect(userContent).toContain("mention free delivery");
  });

  it("omits optional context lines when not provided", async () => {
    let sentMessages: unknown[] = [];
    const model = fakeStructuredModel({ reply: "Hello there!" }, (messages) => {
      sentMessages = messages;
    });

    await generateReply({ message: "hi", intent: "greeting" }, { model });

    const userContent = (sentMessages[1] as HumanMessage).content as string;
    expect(userContent).not.toContain("Original post caption");
    expect(userContent).not.toContain("Business name");
    expect(userContent).not.toContain("Brand tone");
    expect(userContent).not.toContain("Additional guidelines");
  });

  it("throws if the model returns output that doesn't match the schema", async () => {
    const model = {
      withStructuredOutput: () => ({
        invoke: async () => ({ reply: "" }),
      }),
    } as unknown as BaseChatModel;

    await expect(generateReply({ message: "hi", intent: "greeting" }, { model })).rejects.toThrow();
  });
});
