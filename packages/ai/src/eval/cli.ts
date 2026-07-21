/**
 * Runnable AI eval harness, per PLAN.md's Verification section: "maintain a
 * small curated eval set ... run against the pipeline whenever prompts/model
 * config change." Usage: `pnpm --filter @postauto/ai eval`.
 *
 * Defaults to the no-credential heuristic classifier/reply-writer (safe to
 * run anywhere, no network). Set RUN_LIVE_AI_EVAL=1 with a real
 * ANTHROPIC_API_KEY, OPENAI_API_KEY, or DEEPSEEK_API_KEY to run the same eval set against the
 * real configured models instead -- mirrors the RUN_LIVE_META_TESTS=1 gating
 * convention PLAN.md's Verification section uses for live Meta-hitting
 * tests, so a plain `pnpm test`/CI run never depends on or spends a real key.
 */
import { AI_EVAL_CASES } from "./dataset.js";
import { heuristicClassifyIntent, heuristicGenerateReply } from "./heuristic-classifier.js";
import { runAiEval, type AiEvalCaseResult } from "./run-eval.js";

function hasLiveApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY);
}

function formatFailure(result: AiEvalCaseResult): string {
  const lines = [
    `FAIL ${result.id}`,
    `  expected: intent=${result.expectedIntent} decision=${result.expectedDecision}`,
    `  actual:   intent=${result.classification.intent} (confidence ${result.classification.confidence.toFixed(2)}) decision=${result.gate.decision} (${result.gate.reason})`,
  ];
  for (const failure of result.replyCheckFailures) {
    lines.push(`  reply check failed: ${failure.rule} "${failure.text}" -- reply was: "${result.reply?.reply}"`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const useLive = process.env.RUN_LIVE_AI_EVAL === "1" && hasLiveApiKey();

  const summary = useLive
    ? await runAiEval(AI_EVAL_CASES)
    : await runAiEval(AI_EVAL_CASES, {
        classifyIntent: heuristicClassifyIntent,
        generateReply: heuristicGenerateReply,
      });

  console.log(`AI eval mode: ${useLive ? "live (real configured models)" : "mocked (heuristic fallback)"}`);
  if (!useLive && process.env.RUN_LIVE_AI_EVAL === "1") {
    console.log(
      "RUN_LIVE_AI_EVAL=1 was set but no ANTHROPIC_API_KEY/OPENAI_API_KEY/DEEPSEEK_API_KEY was found -- falling back to mocked mode.",
    );
  }
  console.log(`Pass rate: ${summary.passed}/${summary.total} (${(summary.passRate * 100).toFixed(1)}%)`);
  console.log(`Intent accuracy: ${(summary.intentAccuracy * 100).toFixed(1)}%`);
  console.log(`Decision accuracy: ${(summary.decisionAccuracy * 100).toFixed(1)}%`);

  const failures = summary.results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("");
    for (const result of failures) {
      console.log(formatFailure(result));
    }
  }

  if (useLive && summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
