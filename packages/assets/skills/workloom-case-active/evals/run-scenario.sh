#!/bin/bash
set -euo pipefail

SCENARIO=${1:?scenario required}
CONFIG=${2:?with_skill or without_skill required}
ITERATION=${3:-1}
if [[ "$CONFIG" != 'with_skill' && "$CONFIG" != 'without_skill' ]]; then
  echo 'config must be with_skill or without_skill' >&2
  exit 2
fi

EVAL_DIR=$(cd "$(dirname "$0")" && pwd)
SKILL_DIR=$(dirname "$EVAL_DIR")
REPO_ROOT=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
WORKTREE_ROOT=${WORKTREE_ROOT:-$REPO_ROOT}
TASK_ROOT=${TASK_ROOT:-"$REPO_ROOT/.workloom/tasks/11-03-case-active-skill"}
case "$SCENARIO" in
  planning-defers-execution) EVAL_INDEX=0 ;;
  ready-executes-and-revalidates-fingerprint) EVAL_INDEX=1 ;;
  legacy-migrates-and-executes) EVAL_INDEX=2 ;;
  batch-one-confirmation) EVAL_INDEX=3 ;;
  blocked-stops-batch) EVAL_INDEX=4 ;;
  *) echo "unknown scenario: $SCENARIO" >&2; exit 2 ;;
esac
EVAL_NAME="eval-${EVAL_INDEX}-${SCENARIO}"
RUN_DIR="$TASK_ROOT/evals/skill-eval/iteration-$ITERATION/$EVAL_NAME/$CONFIG/run-1"
PROJECT="$RUN_DIR/project"
SESSION_ID="case-eval-${SCENARIO}-${CONFIG}-${ITERATION}"
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

ARGS=(
  --session-id "$SESSION_ID"
  --session-dir "$PROJECT/.pi/sessions"
  --no-context-files
  -e "$WORKTREE_ROOT/packages/adapter-pi/src/index.ts"
  --model minimax-cn/MiniMax-M3.1-Flash
)
if [[ "$CONFIG" == 'with_skill' ]]; then
  ARGS+=(--skill "$SKILL_DIR")
else
  ARGS+=(--no-skills)
fi
PI_PATH=$(command -v pi)
printf -v PI_ARGS '%q ' "${ARGS[@]}"
tmux new-session -d -s "$SESSION_ID" -c "$PROJECT" "PI_BIN=$PI_PATH pi $PI_ARGS"

# 等待 TUI 模型栏出现，避免启动期间丢按键。
ready=false
for _ in {1..60}; do
  pane=$(tmux capture-pane -p -t "$SESSION_ID")
  if [[ "$pane" == *'MiniMax-M3.1-Flash'* ]]; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != 'true' ]]; then
  echo 'Pi TUI did not become ready' >&2
  exit 1
fi

# 连续两次相同且非空才保存，避免空屏或启动动画被当作初始证据。
# 在 send-keys 前捕获：初始证据表示会话就绪、任务尚未发送，不受模型工作时间影响。
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

export EVALS="$EVAL_DIR/evals.json" SCENARIO="$SCENARIO" PROJECT="$PROJECT"
PROMPT=$(node -e '
  const fs = require("fs")
  const doc = JSON.parse(fs.readFileSync(process.env.EVALS, "utf8"))
  const item = doc.evals.find((entry) => entry.id === process.env.SCENARIO)
  if (!item) throw new Error("unknown scenario")
  process.stdout.write(item.prompt.replaceAll("<fixture-project>", process.env.PROJECT))
')
if [[ -z "$PROMPT" ]]; then
  echo 'empty evaluation prompt' >&2
  exit 2
fi
tmux send-keys -t "$SESSION_ID" "$PROMPT" Enter
export RUN_DIR SESSION_ID SCENARIO CONFIG WORKTREE_ROOT EVAL_INDEX EVAL_NAME
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
    status: "running",
    startedAt: new Date().toISOString(),
  }, null, 2)}\n`)
'
printf 'session=%s\nrun_dir=%s\n' "$SESSION_ID" "$RUN_DIR"
