#!/bin/bash
set -euo pipefail

SCENARIO=${1:?scenario required}
CONFIG=${2:?with_skill required}
ITERATION=${3:-1}
if [[ "$CONFIG" != 'with_skill' ]]; then
  echo 'only with_skill is accepted for archived-skill acceptance' >&2
  exit 2
fi
EVAL_DIR=$(cd "$(dirname "$0")" && pwd)
SKILL_DIR=$(dirname "$EVAL_DIR")
REPO_ROOT=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
WORKTREE_ROOT=${WORKTREE_ROOT:-$REPO_ROOT}
TASK_ROOT=${TASK_ROOT:-"$REPO_ROOT/.workloom/tasks/11-03-case-archived-skill"}
case "$SCENARIO" in
  archived-plan-default-head) EVAL_INDEX=0 ;;
  archived-legacy-explicit-ref) EVAL_INDEX=1 ;;
  archived-prd-only-rebuild) EVAL_INDEX=2 ;;
  archived-select-candidate) EVAL_INDEX=3 ;;
  archived-invalid-input-fast-fail) EVAL_INDEX=4 ;;
  *) echo "unknown scenario: $SCENARIO" >&2; exit 2 ;;
esac
EVAL_NAME="eval-${EVAL_INDEX}-${SCENARIO}"
RUN_DIR="$TASK_ROOT/evals/skill-eval/iteration-$ITERATION/$EVAL_NAME/with_skill/run-1"
PROJECT="$RUN_DIR/project"
SESSION_ID="case-eval-${SCENARIO}-with_skill-${ITERATION}"
if tmux has-session -t "$SESSION_ID" 2>/dev/null; then
  echo "tmux session already exists: $SESSION_ID" >&2
  exit 2
fi
if [[ -e "$RUN_DIR" ]]; then
  echo "run directory already exists: $RUN_DIR" >&2
  exit 2
fi
mkdir -p "$RUN_DIR"
node "$EVAL_DIR/build-fixtures.mjs" "$SCENARIO" "$PROJECT" "$SESSION_ID"
BASE_REF=$(git -C "$PROJECT" rev-parse HEAD~1)
ARGS=(
  --session-id "$SESSION_ID"
  --session-dir "$PROJECT/.pi/sessions"
  --no-context-files
  -e "$WORKTREE_ROOT/packages/adapter-pi/src/index.ts"
  --model minimax-cn/MiniMax-M3.1-Flash
  --skill "$SKILL_DIR"
)
PI_PATH=$(command -v pi)
printf -v PI_ARGS '%q ' "${ARGS[@]}"
tmux new-session -d -s "$SESSION_ID" -c "$PROJECT" "PI_BIN=$PI_PATH pi $PI_ARGS"
ready=false
for _ in {1..60}; do
  pane=$(tmux capture-pane -p -t "$SESSION_ID")
  if [[ "$pane" == *'MiniMax-M3.1-Flash'* ]]; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != 'true' ]]; then
  echo 'Pi TUI did not become ready' >&2
  exit 1
fi
mkdir -p "$RUN_DIR/outputs"
previous=''
for _ in {1..60}; do
  current=$(tmux capture-pane -p -t "$SESSION_ID")
  if [[ -n "$current" && "$current" == "$previous" ]]; then
    printf '%s\n' "$current" > "$RUN_DIR/outputs/initial.txt"
    break
  fi
  previous="$current"
  sleep 2
done
if [[ ! -s "$RUN_DIR/outputs/initial.txt" ]]; then
  echo 'no stable initial pane output' >&2
  exit 1
fi
export EVALS="$EVAL_DIR/evals.json" SCENARIO="$SCENARIO" PROJECT="$PROJECT" BASE_REF
PROMPT=$(node -e '
  const fs = require("fs")
  const doc = JSON.parse(fs.readFileSync(process.env.EVALS, "utf8"))
  const item = doc.evals.find((entry) => entry.id === process.env.SCENARIO)
  if (!item) throw new Error("unknown scenario")
  process.stdout.write(item.prompt.replaceAll("<fixture-project>", process.env.PROJECT).replaceAll("<base-ref>", process.env.BASE_REF))
')
if [[ -z "$PROMPT" ]]; then
  echo 'empty evaluation prompt' >&2
  exit 2
fi
tmux send-keys -t "$SESSION_ID" "$PROMPT" Enter
export RUN_DIR SESSION_ID SCENARIO CONFIG WORKTREE_ROOT EVAL_INDEX EVAL_NAME BASE_REF
node -e '
  const fs = require("fs")
  fs.writeFileSync(`${process.env.RUN_DIR}/run.json`, `${JSON.stringify({
    scenario: process.env.SCENARIO,
    evalId: Number(process.env.EVAL_INDEX),
    evalName: process.env.EVAL_NAME,
    configuration: process.env.CONFIG,
    sessionId: process.env.SESSION_ID,
    model: "minimax-cn/MiniMax-M3.1-Flash",
    worktree: process.env.WORKTREE_ROOT,
    requestedRef: process.env.SCENARIO === "archived-legacy-explicit-ref" ? process.env.BASE_REF : null,
    status: "running",
    startedAt: new Date().toISOString(),
  }, null, 2)}\n`)
'
printf 'session=%s\nrun_dir=%s\n' "$SESSION_ID" "$RUN_DIR"
