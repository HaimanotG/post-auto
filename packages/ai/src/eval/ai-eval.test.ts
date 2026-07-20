import { describe, expect, it } from "vitest";
import { AI_EVAL_CASES } from "./dataset.js";
import { heuristicClassifyIntent, heuristicGenerateReply } from "./heuristic-classifier.js";
import { runAiEval } from "./run-eval.js";

/**
 * The always-on (no credentials, no network) run of the curated eval set
 * from dataset.ts, exercised through the same runAiEval scorer the CLI uses
 * (`pnpm --filter @postauto/ai eval`). This is the "script/test that runs
 * the eval set with mocked ... models and reports pass rate" PLAN.md's
 * Verification section calls for; a real-model run is available via
 * `RUN_LIVE_AI_EVAL=1 pnpm --filter @postauto/ai eval` when an API key is
 * present, but is not exercised in this suite since CI has no key.
 */
describe("AI_EVAL_CASES against the heuristic (no-credential) fallback", () => {
  it("achieves a full pass rate on the curated eval set", async () => {
    const summary = await runAiEval(AI_EVAL_CASES, {
      classifyIntent: heuristicClassifyIntent,
      generateReply: heuristicGenerateReply,
    });

    if (summary.failed > 0) {
      const details = summary.results
        .filter((r) => !r.passed)
        .map(
          (r) =>
            `${r.id}: expected intent=${r.expectedIntent} decision=${r.expectedDecision}, got intent=${r.classification.intent} decision=${r.gate.decision}, replyCheckFailures=${JSON.stringify(r.replyCheckFailures)}`,
        )
        .join("\n");
      throw new Error(`AI eval had failures:\n${details}`);
    }

    expect(summary.total).toBe(AI_EVAL_CASES.length);
    expect(summary.passed).toBe(AI_EVAL_CASES.length);
    expect(summary.passRate).toBe(1);
  });
});
