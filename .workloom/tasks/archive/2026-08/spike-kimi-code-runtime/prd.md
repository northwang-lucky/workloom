# spike：在 podman 容器内验证 Kimi Code runtime 适配的关键不确定项

## Goal

在 podman 容器（挂宿主机 kimi 登录状态）内真机验证 `docs/research/kimi-code-plugin-support.md` 第 9 节的开放问题，产出 spike 报告并回填调研报告，为 adapter-kimi 完整实施（后续任务）扫清不确定项。本任务不实现 adapter-kimi。

## Requirements

### 验证环境（用户已确认）

- **容器方案（已确认）**：podman 容器内验证，compose 配置参考 `/data00/home/wangyubo.1219/workbench/code-src/works/cardx-cli-work/podman/postinstall-compose.yml` 的模式——`userns_mode: keep-id`、`restart: "no"` + `command: ["sleep", "infinity"]` 保活、`working_dir: /work`、HOME/XDG 重定向、外网走宿主 mihomo 代理（`host.containers.internal:7890`，含 http/https 大小写双写与 NO_PROXY）、宿主机目录挂载加 `Z` 标签。容器镜像与 kimi CLI 安装方式由 implement 决定（npm 全局安装或官方推荐方式），版本记录进报告。
- **登录状态挂载（已确认）**：把宿主机 `~/.kimi-code/` 的登录状态挂进容器（`credentials/`、`oauth/`、`device_id`、`region`、`config.toml`），容器内 kimi 无需重新登录即可调用；优先只读/子集挂载避免污染宿主机状态，若 kimi 运行需要写 `~/.kimi-code` 则评估放宽并说明。
- **模型约束（已确认）**：所有真机调用显式 `-m kimi-code/kimi-for-coding`；禁止使用 k3 与 highspeed（宿主机 config 默认模型 kimi-code/k3，不得依赖默认值）。
- **仓库挂载（已确认）**：workloom 仓库挂载到容器 `/work` 供测试资产使用。

### 验证矩阵（对应调研报告第 9 节开放问题 1–8）

- **V1 `kimi -p --output-format stream-json` 输出协议**：逐行 JSONL 的结构（type 字段全集、文本增量、工具调用事件、最终汇总）、退出码语义、错误形态。产出 executor 解析器的设计输入。
- **V2 `UserPromptSubmit` hook**：stdin payload 字段结构、stdout 附加文本是否进入上下文、长度上限、subagent 回合是否触发。
- **V3 `PreToolUse` hook**：payload 中工具名与 tool_input 字段结构、写工具（Write/Edit）的确切名称、exit 2 阻断是否生效、fail-open 行为（脚本崩溃/超时是否放行）。
- **V4 plugin manifest `mcpServers`**：stdio node MCP server 被加载（`mcp__workloom__*` 工具对模型可见）、默认 cwd 是什么、`env` 字段、`/plugins` 中禁用/启用。
- **V5 `sessionStart.skill`**：契约全文的加载形态（整体进入 main agent 上下文还是仅登记为可调用 skill）。
- **V6 plugin commands frontmatter 容错**：未知字段（如 title/argument-hint）是否报 diagnostics 或被忽略。
- **V7 plugin 更新/多版本共存**：`/plugins install` 对同 id 再安装的行为（覆盖安装/并存/拒装）。
- **V8（文档性）项目级 plugin 安装范围的路线图**：查官方文档/GitHub issues，非真机项。

### 产出

1. spike 报告 `docs/research/kimi-code-spike-report.md`：每项验证的事实结论 + 证据（命令与输出摘录）+ 对 adapter-kimi 设计的影响。
2. 回填 `docs/research/kimi-code-plugin-support.md` 第 9 节开放问题（逐项标注已验结论）。
3. 验证资产（容器 compose、hook/MCP 探针脚本、验证命令清单）沉淀在任务目录 `spike-assets/` 下，要求一条命令可复跑。

## Acceptance Criteria

1. 容器内 `kimi -p` 用 `kimi-code/kimi-for-coding` 跑通最小 prompt，登录状态挂载生效（无重新登录步骤）。
2. V1–V7 每项均有真机验证结论与证据摘录，V8 有文档结论。
3. spike 报告落盘、调研报告第 9 节回填完成。
4. 验证资产可复跑（重建容器 + 一条命令重验）。

## Notes

- 本任务约束来源：用户指示（podman 容器、挂登录状态、kimi-for-coding、禁 k3/highspeed、P0）。
- 已知事实（本机 CLI `--help` 已核实，2026-08-28）：`kimi -p` 有 `--output-format text|stream-json`；`-m/--model` 指定模型别名；`--agent/--agent-file` 选 main agent；存在 `kimi acp`（ACP server over stdio）与 `kimi doctor`（配置校验）子命令；宿主机 CLI 在 `~/.kimi-code/bin/kimi`。
- 模型别名完整名为 `kimi-code/kimi-for-coding`（config.toml secondary_model 中已有该别名）。
- 调研基线：`docs/research/kimi-code-plugin-support.md`（已提交 6a632cd）；Kimi Code 开源仓库 MoonshotAI/kimi-code（MIT）。
