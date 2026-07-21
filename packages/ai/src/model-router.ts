import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";

/**
 * Every task the AI pipeline needs a model for. Kept as a closed union (not a
 * free-form string) so adding a new pipeline step forces a routing decision
 * here instead of silently falling back to a default.
 */
export type AiTask = "intent-classification" | "reply-generation";

export type ModelProvider = "anthropic" | "openai" | "deepseek";

export interface TaskModelConfig {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Default task -> model mapping per PLAN.md's auto-reply pipeline: a
 * cheap/fast model classifies intent, a stronger model writes the reply.
 * Defaults to DeepSeek (the key currently provisioned); swapping either to
 * Anthropic/OpenAI (or a different model) is a one-line edit here, not a
 * code change.
 */
export const DEFAULT_MODEL_ROUTER_CONFIG: Record<AiTask, TaskModelConfig> = {
  "intent-classification": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0,
  },
  "reply-generation": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.7,
  },
};

const PROVIDER_ENV_VAR: Record<ModelProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

export class MissingApiKeyError extends Error {
  constructor(
    readonly provider: ModelProvider,
    readonly task: AiTask,
  ) {
    const envVar = PROVIDER_ENV_VAR[provider];
    super(`No API key for provider "${provider}" (task "${task}"). Set ${envVar} or pass one explicitly.`);
    this.name = "MissingApiKeyError";
  }
}

export interface ModelFactoryParams {
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey: string;
}

/** Builds a concrete chat model instance. Injectable so tests never construct a real provider client. */
export type ModelFactory = (params: ModelFactoryParams) => BaseChatModel;

/** DeepSeek's API is OpenAI-compatible, so it reuses ChatOpenAI pointed at DeepSeek's base URL. */
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

const defaultFactories: Record<ModelProvider, ModelFactory> = {
  anthropic: ({ model, temperature, maxTokens, apiKey }) =>
    new ChatAnthropic({ model, temperature, maxTokens, apiKey }),
  openai: ({ model, temperature, maxTokens, apiKey }) => new ChatOpenAI({ model, temperature, maxTokens, apiKey }),
  deepseek: ({ model, temperature, maxTokens, apiKey }) =>
    new ChatOpenAI({ model, temperature, maxTokens, apiKey, configuration: { baseURL: DEEPSEEK_BASE_URL } }),
};

export interface GetModelForTaskOptions {
  /** Per-task overrides layered on top of DEFAULT_MODEL_ROUTER_CONFIG. */
  config?: Partial<Record<AiTask, Partial<TaskModelConfig>>>;
  /** Defaults to process.env.ANTHROPIC_API_KEY. */
  anthropicApiKey?: string;
  /** Defaults to process.env.OPENAI_API_KEY. */
  openaiApiKey?: string;
  /** Defaults to process.env.DEEPSEEK_API_KEY. */
  deepseekApiKey?: string;
  /** Defaults to the real @langchain/anthropic and @langchain/openai constructors. */
  factories?: Partial<Record<ModelProvider, ModelFactory>>;
}

/**
 * Resolves the chat model configured for `task`. Config-driven and
 * provider-agnostic per PLAN.md: which provider/model backs a task is data
 * (DEFAULT_MODEL_ROUTER_CONFIG or `options.config`), not a branch in the
 * pipeline code that calls this.
 */
export function getModelForTask(task: AiTask, options: GetModelForTaskOptions = {}): BaseChatModel {
  const base = DEFAULT_MODEL_ROUTER_CONFIG[task];
  const override = options.config?.[task];
  const taskConfig: TaskModelConfig = { ...base, ...override };

  const explicitApiKey: Record<ModelProvider, string | undefined> = {
    anthropic: options.anthropicApiKey,
    openai: options.openaiApiKey,
    deepseek: options.deepseekApiKey,
  };
  const apiKey = explicitApiKey[taskConfig.provider] ?? process.env[PROVIDER_ENV_VAR[taskConfig.provider]];
  if (!apiKey) {
    throw new MissingApiKeyError(taskConfig.provider, task);
  }

  const factory = options.factories?.[taskConfig.provider] ?? defaultFactories[taskConfig.provider];
  return factory({
    model: taskConfig.model,
    temperature: taskConfig.temperature,
    maxTokens: taskConfig.maxTokens,
    apiKey,
  });
}
