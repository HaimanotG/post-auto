import { describe, expect, it } from "vitest";
import { extractInsightMetric } from "./insights.js";

describe("extractInsightMetric", () => {
  it("reads the latest value for a named metric", () => {
    const insights = {
      data: [
        { name: "post_impressions", values: [{ value: 10 }, { value: 42 }] },
        { name: "post_impressions_unique", values: [{ value: 7 }] },
      ],
    };

    expect(extractInsightMetric(insights, "post_impressions")).toBe(42);
    expect(extractInsightMetric(insights, "post_impressions_unique")).toBe(7);
  });

  it("returns 0 when the metric is absent", () => {
    const insights = { data: [{ name: "post_impressions", values: [{ value: 5 }] }] };
    expect(extractInsightMetric(insights, "post_impressions_unique")).toBe(0);
  });

  it("returns 0 when the metric has no values", () => {
    const insights = { data: [{ name: "post_impressions" }] };
    expect(extractInsightMetric(insights, "post_impressions")).toBe(0);
  });

  it("returns 0 when insights is undefined", () => {
    expect(extractInsightMetric(undefined, "post_impressions")).toBe(0);
  });
});
