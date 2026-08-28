# 容器内同步并注册探针 plugin（workloom-spike）。
# 源在 /work 挂载的仓库 spike-assets/plugin，同步到 $KIMI_CODE_HOME/plugins/managed/workloom-spike，
# 并在 plugins/installed.json 中登记（enabled=true）。对齐 trellis 的 managed 布局。
# 用法：install-plugin.sh（在容器内执行）
#!/bin/sh
set -e

SRC="/work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/plugin"
ROOT="${KIMI_CODE_HOME:-/home/tester/.kimi-code}"
DEST="$ROOT/plugins/managed/workloom-spike"
REG="$ROOT/plugins/installed.json"

mkdir -p "$ROOT/plugins/managed"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$SRC"/. "$DEST"/

NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# 用 jq 合并/更新 installed.json 中该 id 的条目
if [ -f "$REG" ]; then
  jq --arg id "workloom-spike" --arg root "$DEST" --arg now "$NOW" '
    (.plugins //= []) |
    (.plugins |= map(select(.id != $id))) |
    (.plugins += [{"id":$id,"root":$root,"source":"local-path","enabled":true,"installedAt":$now,"updatedAt":$now,"originalSource":"/work"}]) |
    .version = 1
  ' "$REG" > "$REG.tmp" && mv "$REG.tmp" "$REG"
else
  printf '{"version":1,"plugins":[{"id":"workloom-spike","root":"%s","source":"local-path","enabled":true,"installedAt":"%s","updatedAt":"%s","originalSource":"/work"}]}\n' "$DEST" "$NOW" "$NOW" > "$REG"
fi

echo "== plugin 已同步到 $DEST =="
find "$DEST" -maxdepth 2 | head -30
echo "== installed.json =="
cat "$REG"
