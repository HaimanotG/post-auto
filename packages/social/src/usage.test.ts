import { describe, expect, it } from "vitest";
import {
  computeBackoffMs,
  isApproachingRateLimit,
  parseBusinessUseCaseUsageHeader,
  peakUsagePercent,
} from "./usage.js";

describe("parseBusinessUseCaseUsageHeader", () => {
  it("returns null for a missing header", () => {
    expect(parseBusinessUseCaseUsageHeader(null)).toBeNull();
    expect(parseBusinessUseCaseUsageHeader(undefined)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseBusinessUseCaseUsageHeader("not json")).toBeNull();
  });

  it("parses a well-formed usage payload", () => {
    const header = JSON.stringify({
      biz_1: [{ type: "pages", call_count: 50, total_cputime: 25, total_time: 25 }],
    });
    expect(parseBusinessUseCaseUsageHeader(header)).toEqual({
      biz_1: [{ type: "pages", call_count: 50, total_cputime: 25, total_time: 25 }],
    });
  });
});

describe("peakUsagePercent", () => {
  it("returns 0 for null usage", () => {
    expect(peakUsagePercent(null)).toBe(0);
  });

  it("returns the highest metric across all business ids and metric types", () => {
    const usage = {
      biz_1: [{ call_count: 10, total_cputime: 20, total_time: 30 }],
      biz_2: [{ call_count: 95, total_cputime: 5, total_time: 5 }],
    };
    expect(peakUsagePercent(usage)).toBe(95);
  });
});

describe("isApproachingRateLimit", () => {
  it("is false below the threshold", () => {
    const usage = { biz_1: [{ call_count: 50, total_cputime: 50, total_time: 50 }] };
    expect(isApproachingRateLimit(usage, 90)).toBe(false);
  });

  it("is true at or above the threshold", () => {
    const usage = { biz_1: [{ call_count: 90, total_cputime: 10, total_time: 10 }] };
    expect(isApproachingRateLimit(usage, 90)).toBe(true);
  });
});

describe("computeBackoffMs", () => {
  it("is 0 below the threshold", () => {
    const usage = { biz_1: [{ call_count: 50, total_cputime: 10, total_time: 10 }] };
    expect(computeBackoffMs(usage, 90, 10_000)).toBe(0);
  });

  it("scales linearly from the threshold to maxDelayMs at 100%", () => {
    const usage = { biz_1: [{ call_count: 95, total_cputime: 10, total_time: 10 }] };
    expect(computeBackoffMs(usage, 90, 10_000)).toBe(5000);
  });

  it("caps at maxDelayMs when usage is at 100%", () => {
    const usage = { biz_1: [{ call_count: 100, total_cputime: 10, total_time: 10 }] };
    expect(computeBackoffMs(usage, 90, 10_000)).toBe(10_000);
  });

  it("is 0 for null usage", () => {
    expect(computeBackoffMs(null, 90, 10_000)).toBe(0);
  });
});
