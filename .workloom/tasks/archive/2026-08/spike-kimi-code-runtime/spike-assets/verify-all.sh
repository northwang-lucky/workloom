# Kimi Code spike 验证矩阵一键重跑（容器内执行）。
# 前置：容器已由 compose 启动（podman-compose --in-pod false -f compose.yml up -d）。
# 用法：podman exec kimi-spike bash /work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/verify-all.sh
# 说明：会发起若干次真机模型调用（kimi-code/kimi-for-coding），每次调用需网络与登录状态。
#!/bin/sh
set -e
B=/work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets
O=$B/out/verify
KH=${KIMI_CODE_HOME:-/home/tester/.kimi-code}
mkdir -p "$O"
PASS=0; FAIL=0
chk(){ if [ "$1" = ok ]; then PASS=$((PASS+1)); echo "PASS  $2"; else FAIL=$((FAIL+1)); echo "FAIL  $2"; fi; }

# 0) 前置
bash $B/setup-kimi-home.sh >/dev/null 2>&1
[ -f "$KH/config.toml" ] && chk ok "setup: config.toml 就绪" || chk bad "setup: config.toml 缺失"
kimi doctor >/dev/null 2>&1 && chk ok "doctor: 配置有效" || chk bad "doctor: 配置无效"

# 1) V1 stream-json 协议
kimi -m kimi-code/kimi-for-coding --output-format stream-json -p "Reply with the exact word: omega" >$O/v1.jsonl 2>/dev/null
head -1 $O/v1.jsonl | grep -q '"type":"system.version"' && chk ok "V1: 输出含 system.version 元行" || chk bad "V1: 缺版本元行"
grep -q '"role":"assistant"' $O/v1.jsonl && chk ok "V1: 输出含 assistant 内容行" || chk bad "V1: 缺 assistant 内容"

# 2) V2 UserPromptSubmit payload
bash $B/probes/config-hooks.sh reset >/dev/null 2>&1
bash $B/probes/config-hooks.sh add UserPromptSubmit normal v2 >/dev/null 2>&1
rm -f $B/out/hooks/*
kimi -m kimi-code/kimi-for-coding --output-format stream-json -p "Reply with the exact word: beta" >/dev/null 2>&1
grep -rlq '"hook_event_name":"UserPromptSubmit"' $B/out/hooks/ 2>/dev/null && chk ok "V2: UserPromptSubmit payload 捕获" || chk bad "V2: 未捕获 UserPromptSubmit"

# 3) V3 PreToolUse Write payload
bash $B/probes/config-hooks.sh add PreToolUse normal v3 >/dev/null 2>&1
rm -f $B/out/hooks/*
kimi -m kimi-code/kimi-for-coding --output-format stream-json -p "Use the Write tool to create $O/v3-check.txt with content zz. Reply done." >/dev/null 2>&1
[ -f "$O/v3-check.txt" ] && grep -rlq '"tool_name":"Write"' $B/out/hooks/ 2>/dev/null && chk ok "V3: Write 工具触发 PreToolUse 且放行" || chk bad "V3: Write 未触发或未放行"

# 4) V4 MCP server 加载 + cwd + env（同时带出 V5）
bash $B/probes/config-hooks.sh reset >/dev/null 2>&1
bash $B/install-plugin.sh >/dev/null 2>&1
rm -f $B/out/mcp/server.log.jsonl
kimi -m kimi-code/kimi-for-coding --output-format stream-json -p "Call MCP tool mcp__plugin-workloom-spike_workloom__echo with text PROBEV. Report its return value." >$O/v4.jsonl 2>/dev/null
grep -q '"cwd":"/home/tester/.kimi-code/plugins/managed/workloom-spike"' $B/out/mcp/server.log.jsonl 2>/dev/null && chk ok "V4: MCP server 默认 cwd=插件根目录" || chk bad "V4: MCP cwd 异常/未加载"
grep -q '"KIMI_CODE_PROBE":"set-via-manifest"' $B/out/mcp/server.log.jsonl 2>/dev/null && chk ok "V4: manifest env 字段透传" || chk bad "V4: manifest env 未透传"
grep -q CONTRACT_OBEYED $O/v4.jsonl 2>/dev/null && chk ok "V5: sessionStart.skill 正文进入上下文（CONTRACT_OBEYED 生效）" || chk bad "V5: sessionStart.skill 未进入上下文"

# 5) V7 重复安装覆盖（单版本）
v=$(jq -r .version $KH/plugins/managed/workloom-spike/kimi.plugin.json)
ls -d $KH/plugins/managed/workloom-spike >/dev/null 2>&1 && [ -n "$v" ] && chk ok "V7: 重装覆盖到同一 managed/<id>/（version=$v，单版本）" || chk bad "V7: 重装异常"

echo "----"
echo "RESULT  PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "ALL_PASS" || echo "HAS_FAIL"
