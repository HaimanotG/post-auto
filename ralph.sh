#!/bin/bash
# Fresh-session Ralph loop for PostAuto.
# Each iteration spawns a brand-new `claude -p` session (no memory of prior
# iterations) that reads state from disk (PLAN.md, prd.json, progress.txt),
# does exactly one task, and exits. This script re-launches it until prd.json
# has no remaining tasks, MAX_ITERATIONS is hit, or the same task fails
# STUCK_LIMIT times in a row (almost always a sign it's credential-gated and
# needs a human to supply a secret before it can proceed).

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

MAX_ITERATIONS="${MAX_ITERATIONS:-80}"
STUCK_LIMIT=3
ITERATION=1
LAST_TASK_ID=""
REPEAT_COUNT=0

echo "Starting Fresh-Session Ralph Loop in $REPO_DIR"
echo "Max iterations: $MAX_ITERATIONS | Stuck limit: $STUCK_LIMIT consecutive fails on the same task"

if [ ! -d .git ]; then
  echo "No git repo found — running git init and committing the harness scaffold."
  git init
  git add PLAN.md prd.json progress.txt ralph.sh .claude/settings.json
  git commit -m "Initial ralph loop harness: PLAN.md, prd.json, progress.txt, settings"
fi

next_task_id() {
  jq -r '
    .tasks as $all
    | [ $all[]
        | select(.passes == false)
        | select( ([ .deps[] as $d | ($all[] | select(.id == $d) | .passes) ] | all) )
      ]
    | sort_by(.priority)
    | .[0].id // empty
  ' prd.json
}

while [ "$ITERATION" -le "$MAX_ITERATIONS" ]; do
  echo "============================================="
  echo "Iteration $ITERATION of $MAX_ITERATIONS"
  echo "============================================="

  if ! grep -q '"passes": false' prd.json; then
    echo "All tasks in prd.json are marked passes:true. Done."
    break
  fi

  CURRENT_ID="$(next_task_id)"

  if [ -z "$CURRENT_ID" ]; then
    echo "No eligible task found (remaining tasks are all blocked by unmet deps). Stopping."
    break
  fi

  if [ "$CURRENT_ID" = "$LAST_TASK_ID" ]; then
    REPEAT_COUNT=$((REPEAT_COUNT + 1))
  else
    REPEAT_COUNT=1
    LAST_TASK_ID="$CURRENT_ID"
  fi

  if [ "$REPEAT_COUNT" -gt "$STUCK_LIMIT" ]; then
    echo "Task '$CURRENT_ID' has failed $((REPEAT_COUNT - 1)) times in a row. Halting the loop."
    echo "Check progress.txt for the 'Credential gaps' note on this task — it likely needs a"
    echo "secret or account only you can provide. Supply it, then re-run ralph.sh to resume."
    break
  fi

  claude -p "
You are running one iteration of a fresh-session Ralph loop for the PostAuto project.
Your state lives entirely on disk in this repo — you have no memory of prior iterations.

1. Read PLAN.md for full architectural context.
2. Read prd.json. The task queue is sorted by priority; work ONLY on task id '$CURRENT_ID'
   (title and description are in prd.json under that id). Do not touch any other task.
3. Read progress.txt (tail is enough) for what prior iterations already did, so you don't
   redo work or contradict earlier decisions.
4. Implement ONLY this one task. Do not start additional tasks even if it's tempting.
5. If the task is marked credential_gated:true in prd.json, it needs a real secret/account
   you don't have (see PLAN.md's 'Notes for the autonomous build loop' section for the exact
   policy). Implement the code and cover it with mocked/fixture-based tests instead of live
   calls. Never fabricate a passing live-integration result.
6. Run the relevant test/build/typecheck commands for what you touched (pnpm turbo test,
   pnpm turbo typecheck, pnpm turbo build, or a narrower --filter as appropriate).
7. If everything relevant passes: set that task's \"passes\" to true in prd.json (use Edit,
   keep the JSON valid), then append an entry to progress.txt following the format at the top
   of that file, including a 'Credential gaps' line if this was credential_gated.
8. If it does NOT pass: leave \"passes\": false, still append a progress.txt entry explaining
   what failed and why, so the next iteration (or a human) has context.
9. Commit your changes with 'git add' (specific files, not -A blindly) and 'git commit' with a
   descriptive message referencing the task id.
10. Reply with exactly one line: 'Task Complete' or 'Task Failed'. Say nothing else after that.
"

  CLAUDE_EXIT=$?
  echo "claude -p exited with status $CLAUDE_EXIT"

  ITERATION=$((ITERATION + 1))
  sleep 2
done

echo "Ralph loop stopped after $((ITERATION - 1)) iteration(s)."
if grep -q '"passes": false' prd.json 2>/dev/null; then
  echo "Remaining incomplete tasks:"
  jq -r '.tasks[] | select(.passes == false) | "  - \(.id): \(.title)"' prd.json
fi
