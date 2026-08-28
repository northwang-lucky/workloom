# spike-assets：podman 容器内 Kimi Code runtime 适配验证资产

本目录是任务 `08-28-spike-kimi-code-runtime` 的验证资产，用于在 podman 容器内真机验证
`docs/research/kimi-code-plugin-support.md` 第 9 节的开放问题 V1–V8。容器方案参考
`cardx-cli-work/podman/postinstall-compose.yml`（`userns_mode: keep-id`、`sleep infinity` 保活、
`host.containers.internal:7890` 宿主 mihomo 代理、`Z` 标签挂载）。

## 资产清单

| 文件 | 作用 |
| --- | --- |
| `Containerfile.kimi` | 基镜像 node:26-trixie-slim + kimi 二进制运行库（libstdc++6/libgcc-s1）+ jq/curl；apt 走字节镜像源 |
| `compose.yml` | 容器编排：keep-id、KIMI_CODE_HOME 重定向、代理、只读挂载宿主机 `~/.kimi-code`（登录状态源）与 kimi 二进制 |
| `setup-kimi-home.sh` | 容器内自建 `$KIMI_CODE_HOME`，只拷贝 credentials/oauth/device_id/region；生成的 config.toml 剔除宿主机 `[[hooks]]` |
| `install-plugin.sh` | 把 `plugin/` 同步到 managed/ 并写 `plugins/installed.json`（enabled=true） |
| `probes/hook-dump.sh` | hooks 探针：落盘 stdin payload，按 mode 复现 normal/block/crash/timeout（fail-open 与阻断） |
| `probes/config-hooks.sh` | 容器内 config.toml 的 `[[hooks]]` 管理器（reset/add/show） |
| `probes/mcp-echo-server.mjs` | 最小 stdio MCP echo server（纯 JSON-RPC），记录 cwd/env 与流量 |
| `plugin/` | 探针 plugin：mcpServers + sessionStart.skill(contract) + commands(hello，含未知字段) |
| `verify-all.sh` | 容器内一键重跑验证矩阵（含断言 PASS/FAIL；会发起真机模型调用） |
| `out/` | 验证过程落盘证据（jsonl/日志），git 忽略 |

## 复跑步骤（一条命令重验）

```bash
# 1. 重建容器（登录状态与 kimi 二进制由 compose 只读挂载）
cd .workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets
podman-compose --in-pod false -f compose.yml up -d

# 2. 一键重跑验证（会调用 kimi-code/kimi-for-coding 真机模型；V1–V7）
podman exec kimi-spike bash /work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/verify-all.sh
```

## 前置条件

- 宿主机 UID/GID = 1001:1001（keep-id 映射）；`~/.kimi-code` 有已验证的登录状态。
- kimi 二进制：`~/.kimi-code/bin/kimi`（v0.39.0，原生 x86-64 glibc 二进制），compose 只读挂载为容器内 `/usr/local/bin/kimi`。
- 外网经宿主 mihomo 代理 `host.containers.internal:7890`。
- 所有模型调用显式 `-m kimi-code/kimi-for-coding`，不依赖 config 默认（`kimi-code/k3`）。

详细结论见 `docs/research/kimi-code-spike-report.md`。
