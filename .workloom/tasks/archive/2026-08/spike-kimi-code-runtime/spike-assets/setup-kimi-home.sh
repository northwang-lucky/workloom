# 容器内自建干净 $KIMI_CODE_HOME 的初始化脚本
# 只从只读挂载的 /host-kimi-code（宿主机 ~/.kimi-code）拷贝登录状态：
#   credentials/ oauth/ device_id region
# config.toml 由宿主机副本剔除 [[hooks]] 生成（宿主机 hooks 指向容器内不存在的 flux 路径），
# 模型/provider 定义（含 kimi-code/kimi-for-coding）完整保留。
#!/bin/sh
set -e

HOME_DIR="${KIMI_CODE_HOME:-/home/tester/.kimi-code}"
SRC="/host-kimi-code"

mkdir -p "$HOME_DIR"

# 拷贝登录状态源（cp -r 会合并目录；源文件只读挂载，cp 到目标为可写副本）
if [ -d "$SRC/credentials" ]; then
  cp -r "$SRC/credentials" "$HOME_DIR/"
fi
if [ -d "$SRC/oauth" ]; then
  cp -r "$SRC/oauth" "$HOME_DIR/"
fi
[ -f "$SRC/device_id" ] && cp "$SRC/device_id" "$HOME_DIR/"
[ -f "$SRC/region" ] && cp "$SRC/region" "$HOME_DIR/"

# 生成 config.toml：输出到第一个 [[hooks]] 为止（保留 provider/model 定义）
awk '/^\[\[hooks\]\]/{exit} {print}' "$SRC/config.toml" > "$HOME_DIR/config.toml"

echo "== $HOME_DIR 就绪 =="
ls -la "$HOME_DIR"
echo "== config.toml 行数 =="
wc -l "$HOME_DIR/config.toml"
echo "== 默认模型（应为 kimi-code/k3，验证时须显式 -m kimi-code/kimi-for-coding）=="
grep -E "default_model" "$HOME_DIR/config.toml" || true
