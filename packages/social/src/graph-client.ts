import { buildGraphApiError } from "./errors.js";
import {
  computeBackoffMs,
  isApproachingRateLimit,
  parseBusinessUseCaseUsageHeader,
  type BusinessUseCaseUsage,
} from "./usage.js";

export type { GraphErrorCategory } from "./errors.js";
export { GraphApiError } from "./errors.js";
export type { BusinessUseCaseUsage, BusinessUseCaseUsageMetric } from "./usage.js";

const DEFAULT_BASE_URL = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v21.0";
const DEFAULT_RATE_LIMIT_THRESHOLD_PERCENT = 90;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

export interface GraphClientOptions {
  baseUrl?: string;
  apiVersion?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to a real `setTimeout`-based delay. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Usage percentage (0-100) at which the client starts backing off. */
  rateLimitThresholdPercent?: number;
  /** Backoff delay applied once usage is at 100%. Scales linearly from the threshold. */
  maxBackoffMs?: number;
}

export interface GraphRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  accessToken?: string;
  params?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export interface GraphResponse<T> {
  data: T;
  usage: BusinessUseCaseUsage | null;
}

export interface LongLivedTokenExchangeParams {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
}

export interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

async function realSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin wrapper around Meta's Graph API used by every `packages/social/*`
 * platform adapter, so rate-limit backoff, token refresh, and error
 * classification exist in exactly one place rather than being duplicated
 * per platform (see PLAN.md's "Meta Graph API integration" section).
 */
export class GraphClient {
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly rateLimitThresholdPercent: number;
  private readonly maxBackoffMs: number;
  private lastUsage: BusinessUseCaseUsage | null = null;

  constructor(options: GraphClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl = options.sleepImpl ?? realSleep;
    this.rateLimitThresholdPercent = options.rateLimitThresholdPercent ?? DEFAULT_RATE_LIMIT_THRESHOLD_PERCENT;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  }

  /** Usage reported by the most recent response, if any. */
  getLastUsage(): BusinessUseCaseUsage | null {
    return this.lastUsage;
  }

  async get<T>(
    path: string,
    params?: GraphRequestOptions["params"],
    accessToken?: string,
  ): Promise<GraphResponse<T>> {
    return this.request<T>(path, { method: "GET", params, accessToken });
  }

  async post<T>(
    path: string,
    body?: GraphRequestOptions["body"],
    accessToken?: string,
  ): Promise<GraphResponse<T>> {
    return this.request<T>(path, { method: "POST", body, accessToken });
  }

  async request<T>(path: string, options: GraphRequestOptions = {}): Promise<GraphResponse<T>> {
    if (isApproachingRateLimit(this.lastUsage, this.rateLimitThresholdPercent)) {
      const delayMs = computeBackoffMs(this.lastUsage, this.rateLimitThresholdPercent, this.maxBackoffMs);
      await this.sleepImpl(delayMs);
    }

    const method = options.method ?? "GET";
    const url = this.buildUrl(path, options.params, options.accessToken);

    const init: RequestInit = { method };
    if (options.body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(url, init);
    this.lastUsage = parseBusinessUseCaseUsageHeader(response.headers.get("X-Business-Use-Case-Usage"));

    const body = await parseJsonBody(response);

    if (!response.ok) {
      throw buildGraphApiError(response.status, body);
    }

    return { data: body as T, usage: this.lastUsage };
  }

  /** Exchanges a short-lived user access token for a 60-day long-lived one. */
  async exchangeForLongLivedToken(params: LongLivedTokenExchangeParams): Promise<LongLivedTokenResponse> {
    const response = await this.request<LongLivedTokenResponse>("/oauth/access_token", {
      method: "GET",
      params: {
        grant_type: "fb_exchange_token",
        client_id: params.appId,
        client_secret: params.appSecret,
        fb_exchange_token: params.shortLivedToken,
      },
    });
    return response.data;
  }

  private buildUrl(
    path: string,
    params: GraphRequestOptions["params"],
    accessToken: string | undefined,
  ): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}/${this.apiVersion}${normalizedPath}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    if (accessToken) {
      url.searchParams.set("access_token", accessToken);
    }
    return url.toString();
  }
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
