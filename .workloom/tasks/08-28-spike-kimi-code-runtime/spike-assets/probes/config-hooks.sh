# 容器内 $KIMI_CODE_HOME/config.toml 的 [[hooks]] 管理器。
# 用法：config-hooks.sh {reset|add|show}
#   reset                   : 从基线恢复（去掉所有 [[hooks]]）
#   add <event> <mode> <tag> [matcher] [timeout] : 追加一个 hook 指向 hook-dump.sh（首次自动备份基线）
#   show                    : 显示当前 [[hooks]]
# 说明：kimi 的 hook command 按 shell 拆分参数（trellis 即 `python3 ./hooks/x.py`），故可带 args 传 mode/tag。
#!/bin/sh
set -e

CFG="${KIMI_CODE_HOME:-/home/tester/.kimi-code}/config.toml"
BAK="$CFG.bak"
DR="/work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/probes/hook-dump.sh"
cmd="${1:-}"

case "$cmd" in
  reset)
    if [ -f "$BAK" ]; then cp "$BAK" "$CFG"; echo "reset -> $CFG"; else echo "no backup; 无法恢复"; exit 1; fi
    ;;
  add)
    event="$2"; mode="$3"; tag="$4"; matcher="${5:-}"; timeout="${6:-}"
    if [ ! -f "$BAK" ]; then
      awk '/^\[\[hooks\]\]/{exit} {print}' "$CFG" > "$BAK"
    fi
    printf '\n[[hooks]]\nevent = "%s"\n' "$event" >> "$CFG"
    [ -n "$matcher" ] && printf 'matcher = "%s"\n' "$matcher" >> "$CFG"
    printf 'command = "%s %s %s "\n' "$DR" "$mode" "$tag" >> "$CFG"
    [ -n "$timeout" ] && printf 'timeout = %s\n' "$timeout" >> "$CFG"
    echo "added hook: $event / mode=$mode / tag=$tag / matcher=${matcher:-none} / timeout=${timeout:-default}"
    ;;
  show)
    grep -A8 '^\[\[hooks\]\]' "$CFG" || echo "(no hooks)"
    ;;
  *)
    echo "usage: config-hooks.sh {reset|add <event> <mode> <tag> [matcher] [timeout]|show}"
    exit 1
    ;;
esac
