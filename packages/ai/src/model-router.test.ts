import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_ROUTER_CONFIG,
  getModelForTask,
  MissingApiKeyError,
  type ModelFactoryParams,
} from "./model-router.js";

/** Fake BaseChatModel-shaped stand-in so tests never construct a real provider client. */
function fakeModel(tag: string, params: ModelFactoryParams): BaseChatModel {
  return { __tag: tag, ...params } as unknown as BaseChatModel;
}

describe("getModelForTask", () => {
  it("routes intent-classification to the configured provider/model with the right API key", () => {
    const calls: { provider: string; params: ModelFactoryParams }[] = [];
    const model = getModelForTask("intent-classification", {
      anthropicApiKey: "anthropic-test-key",
      openaiApiKey: "openai-test-key",
      factories: {
        anthropic: (params) => {
          calls.push({ provider: "anthropic", params });
          return fakeModel("anthropic", params);
        },
        openai: (params) => {
          calls.push({ provider: "openai", params });
          return fakeModel("openai", params);
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.provider).toBe(DEFAULT_MODEL_ROUTER_CONFIG["intent-classification"].provider);
    expect(calls[0]?.params.model).toBe(DEFAULT_MODEL_ROUTER_CONFIG["intent-classification"].model);
    expect(calls[0]?.params.apiKey).toBe("anthropic-test-key");
    expect((model as unknown as { __tag: string }).__tag).toBe("anthropic");
  });

  it("routes reply-generation to the configured provider/model", () => {
    const calls: { provider: string; params: ModelFactoryParams }[] = [];
    getModelForTask("reply-generation", {
      anthropicApiKey: "anthropic-test-key",
      factories: {
        anthropic: (params) => {
          calls.push({ provider: "anthropic", params });
          return fakeModel("anthropic", params);
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.model).toBe(DEFAULT_MODEL_ROUTER_CONFIG["reply-generation"].model);
    expect(calls[0]?.params.temperature).toBe(DEFAULT_MODEL_ROUTER_CONFIG["reply-generation"].temperature);
  });

  it("lets a per-task config override swap provider/model without touching call sites", () => {
    const calls: string[] = [];
    getModelForTask("intent-classification", {
      config: {
        "intent-classification": { provider: "openai", model: "gpt-4o-mini" },
      },
      openaiApiKey: "openai-test-key",
      factories: {
        openai: (params) => {
          calls.push(params.model);
          return fakeModel("openai", params);
        },
        anthropic: () => {
          throw new Error("should not be called");
        },
      },
    });

    expect(calls).toEqual(["gpt-4o-mini"]);
  });

  it("partially overrides a task config, keeping unspecified fields at their default", () => {
    const calls: ModelFactoryParams[] = [];
    getModelForTask("reply-generation", {
      config: {
        "reply-generation": { temperature: 0.2 },
      },
      anthropicApiKey: "anthropic-test-key",
      factories: {
        anthropic: (params) => {
          calls.push(params);
          return fakeModel("anthropic", params);
        },
      },
    });

    expect(calls[0]?.model).toBe(DEFAULT_MODEL_ROUTER_CONFIG["reply-generation"].model);
    expect(calls[0]?.temperature).toBe(0.2);
  });

  it("falls back to process.env for the API key when none is passed explicitly", () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "env-key";
    try {
      const calls: ModelFactoryParams[] = [];
      getModelForTask("intent-classification", {
        factories: {
          anthropic: (params) => {
            calls.push(params);
            return fakeModel("anthropic", params);
          },
        },
      });
      expect(calls[0]?.apiKey).toBe("env-key");
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it("throws MissingApiKeyError naming the provider and task when no key is available", () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => getModelForTask("intent-classification")).toThrow(MissingApiKeyError);
      try {
        getModelForTask("intent-classification");
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(MissingApiKeyError);
        expect((error as MissingApiKeyError).provider).toBe("anthropic");
        expect((error as MissingApiKeyError).task).toBe("intent-classification");
        expect((error as Error).message).toMatch(/ANTHROPIC_API_KEY/);
      }
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it("uses the real @langchain/anthropic constructor when no factory override is given", () => {
    const model = getModelForTask("intent-classification", { anthropicApiKey: "anthropic-test-key" });
    expect(model.constructor.name).toBe("ChatAnthropic");
  });

  it("uses the real @langchain/openai constructor for a provider override with no factory override", () => {
    const model = getModelForTask("reply-generation", {
      config: { "reply-generation": { provider: "openai", model: "gpt-4o" } },
      openaiApiKey: "openai-test-key",
    });
    expect(model.constructor.name).toBe("ChatOpenAI");
  });
});
