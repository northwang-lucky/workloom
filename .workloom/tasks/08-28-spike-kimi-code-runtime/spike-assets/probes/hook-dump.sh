# hooks 探测脚本：把 kimi 经 stdin 传入的事件 payload 落盘，并按 mode 复现阻断/fail-open 行为。
# 用法：hook-dump.sh [mode] [tag]
#   mode  ∈ normal(默认)|block|crash|timeout
#       normal  : 退出码 0，stdout 回显 HOOK_INJECT_<tag>（验证 UserPromptSubmit stdout 进入上下文）
#       block   : stderr 输出阻断原因，退出码 2（验证 PreToolUse 阻断）
#       crash   : 退出码 1（非零非 2，验证 fail-open 放行）
#       timeout : 睡眠超过 timeout 后退出（验证超时 fail-open 放行）
#   tag   ∈ 测试标识，用于区分多次运行（默认 unknown）
# 落盘：/work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/out/hooks/<tag>-<event>-<ts>.json
#!/bin/sh
set -e

MODE="${1:-normal}"
TAG="${2:-unknown}"
OUT_DIR="/work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/out/hooks"
mkdir -p "$OUT_DIR"

# 读出完整 payload
PAYLOAD="$(cat)"
EVENT="$(printf '%s' "$PAYLOAD" | jq -r '.hook_event_name // .event // "unknown"' 2>/dev/null || echo unknown)"
TS="$(date +%Y%m%d-%H%M%S-%N 2>/dev/null || date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/${TAG}-${EVENT}-${TS}.json"
printf '%s\n' "$PAYLOAD" > "$FILE"

case "$MODE" in
  block)
    printf '[hook-dump] BLOCK %s' "$TAG" >&2
    exit 2
    ;;
  crash)
    printf '[hook-dump] CRASH %s' "$TAG" >&2
    exit 1
    ;;
  timeout)
    # 睡眠 6 秒，超过 config 默认 30s 的 timeout 才有意义；此处为可测的 8 秒
    sleep 8
    exit 0
    ;;
  normal)
    printf 'HOOK_INJECT_%s' "$TAG"
    exit 0
    ;;
  *)
    printf '[hook-dump] unknown mode %s' "$MODE" >&2
    exit 1
    ;;
esac
