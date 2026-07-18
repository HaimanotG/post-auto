import { describe, expect, it } from "vitest";
import { buildGraphApiError, classifyGraphErrorCode, classifyGraphErrorStatus } from "./errors.js";

describe("classifyGraphErrorCode", () => {
  it.each([
    [190, "auth_error"],
    [102, "auth_error"],
    [4, "rate_limited"],
    [17, "rate_limited"],
    [613, "rate_limited"],
    [100, "permanent"],
    [10, "permanent"],
    [99999, "unknown"],
    [undefined, "unknown"],
  ] as const)("classifies code %s as %s", (code, expected) => {
    expect(classifyGraphErrorCode(code)).toBe(expected);
  });
});

describe("classifyGraphErrorStatus", () => {
  it.each([
    [500, "transient"],
    [503, "transient"],
    [429, "rate_limited"],
    [401, "auth_error"],
    [403, "auth_error"],
    [400, null],
    [200, null],
  ] as const)("classifies status %s as %s", (status, expected) => {
    expect(classifyGraphErrorStatus(status)).toBe(expected);
  });
});

describe("buildGraphApiError", () => {
  it("prefers the error-code-derived category over the status-derived one", () => {
    const error = buildGraphApiError(400, { error: { message: "bad token", code: 190 } });
    expect(error.category).toBe("auth_error");
    expect(error.code).toBe(190);
    expect(error.message).toBe("bad token");
  });

  it("falls back to status classification when the error code is unrecognized", () => {
    const error = buildGraphApiError(503, { error: { message: "upstream down", code: 99999 } });
    expect(error.category).toBe("transient");
  });

  it("falls back to unknown when neither the code nor the status is recognized", () => {
    const error = buildGraphApiError(400, { error: { message: "weird", code: 99999 } });
    expect(error.category).toBe("unknown");
  });

  it("builds a generic error when the body has no Graph error envelope", () => {
    const error = buildGraphApiError(502, "<html>Bad Gateway</html>");
    expect(error.category).toBe("transient");
    expect(error.message).toBe("Graph API request failed with status 502");
  });

  it("marks rate_limited and transient errors as retryable, others as not", () => {
    expect(buildGraphApiError(429, { error: { message: "x", code: 4 } }).isRetryable).toBe(true);
    expect(buildGraphApiError(503, {}).isRetryable).toBe(true);
    expect(buildGraphApiError(401, { error: { message: "x", code: 190 } }).isRetryable).toBe(false);
    expect(buildGraphApiError(400, { error: { message: "x", code: 100 } }).isRetryable).toBe(false);
  });
});
