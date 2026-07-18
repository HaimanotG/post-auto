/**
 * Meta Graph API error taxonomy.
 *
 * Graph API error codes are not documented as a clean enum — this maps the
 * well-known codes/subcodes (from Meta's error reference) into a small set
 * of categories callers actually need to branch on:
 *   - "auth_error": token invalid/expired/revoked -> the social_account needs
 *     reconnecting, no retry will help.
 *   - "rate_limited": back off and retry later (Trigger.dev's retry/backoff
 *     handles the "later" part).
 *   - "permanent": policy violation, invalid media, bad request -> mark the
 *     post_platform_variant failed, do not retry.
 *   - "transient": 5xx / network-level failure -> safe to retry.
 *   - "unknown": anything not recognized -> treat conservatively as permanent
 *     (do not retry silently forever on an error we can't classify).
 */
export type GraphErrorCategory = "auth_error" | "rate_limited" | "permanent" | "transient" | "unknown";

export interface GraphErrorBody {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

// https://developers.facebook.com/docs/graph-api/guides/error-handling/
const AUTH_ERROR_CODES = new Set([190, 102, 463, 467]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80004]);
const PERMANENT_ERROR_CODES = new Set([100, 200, 10, 803, 2207001, 2207003]);

export function classifyGraphErrorCode(code: number | undefined): GraphErrorCategory {
  if (code === undefined) return "unknown";
  if (AUTH_ERROR_CODES.has(code)) return "auth_error";
  if (RATE_LIMIT_CODES.has(code)) return "rate_limited";
  if (PERMANENT_ERROR_CODES.has(code)) return "permanent";
  return "unknown";
}

export function classifyGraphErrorStatus(status: number): GraphErrorCategory | null {
  if (status >= 500) return "transient";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "auth_error";
  return null;
}

export class GraphApiError extends Error {
  readonly category: GraphErrorCategory;
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;
  readonly raw: unknown;

  constructor(params: {
    message: string;
    status: number;
    category: GraphErrorCategory;
    code?: number;
    subcode?: number;
    fbtraceId?: string;
    raw?: unknown;
  }) {
    super(params.message);
    this.name = "GraphApiError";
    this.status = params.status;
    this.category = params.category;
    this.code = params.code;
    this.subcode = params.subcode;
    this.fbtraceId = params.fbtraceId;
    this.raw = params.raw;
  }

  /** True when a retry (after backoff) might succeed. */
  get isRetryable(): boolean {
    return this.category === "rate_limited" || this.category === "transient";
  }
}

/**
 * Builds a GraphApiError from an HTTP status + the Graph API's JSON error
 * envelope (`{ error: { message, type, code, error_subcode, fbtrace_id } }`),
 * or from a non-Graph-shaped error body (e.g. an upstream 502 HTML page).
 */
export function buildGraphApiError(status: number, body: unknown): GraphApiError {
  const errorBody = extractErrorBody(body);
  if (errorBody) {
    const codeCategory = classifyGraphErrorCode(errorBody.code);
    const category = codeCategory !== "unknown" ? codeCategory : (classifyGraphErrorStatus(status) ?? "unknown");
    return new GraphApiError({
      message: errorBody.message,
      status,
      category,
      code: errorBody.code,
      subcode: errorBody.error_subcode,
      fbtraceId: errorBody.fbtrace_id,
      raw: body,
    });
  }

  const category = classifyGraphErrorStatus(status) ?? "unknown";
  return new GraphApiError({
    message: `Graph API request failed with status ${status}`,
    status,
    category,
    raw: body,
  });
}

function extractErrorBody(body: unknown): GraphErrorBody | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "object" &&
    (body as { error: unknown }).error !== null
  ) {
    const error = (body as { error: Record<string, unknown> }).error;
    if (typeof error.message === "string") {
      return {
        message: error.message,
        type: typeof error.type === "string" ? error.type : undefined,
        code: typeof error.code === "number" ? error.code : undefined,
        error_subcode: typeof error.error_subcode === "number" ? error.error_subcode : undefined,
        fbtrace_id: typeof error.fbtrace_id === "string" ? error.fbtrace_id : undefined,
      };
    }
  }
  return null;
}
