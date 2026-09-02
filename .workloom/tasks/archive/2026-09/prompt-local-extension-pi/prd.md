# 提示词本机扩展点机制（Pi 落地）

## Goal

将本机提示词扩展点接入 Pi runtime：Pi 主会话与 executor child pi 均按本机片段的条件化文本注入；child pi 通过能力探测决定是否携带 pi-lsp（`-e`），使 `requiresTools: [lsp_diagnostics]` 片段在 Pi child 真正可用；pi-lsp 的 server 配置对齐 DSH 覆盖面；不违反 executor-voice 分层（core 纪律已有，adapter 只接线）。

## Requirements

1. child 能力探测与 `-e` 加载
   - `registerExecutorTool(pi: ExtensionAPI)` 已在派发路径持句柄；executor 工具执行时探测 `pi.getActiveTools()` 是否含 `lsp_diagnostics`（主会话可观测工具面；探测在事件处理器/工具执行时进行，非加载期 stub）。
   - 命中 → `buildChildPiArgs` 追加 `-e npm:@narumitw/pi-lsp`（与 `--no-extensions` 并存合法，官方 CLI 语义：explicit -e paths still work）；未命中 → 不追加（零行为）。
   - pi-lsp 只注册 `lsp_diagnostics`/`lsp_fix` 两个工具（源码实证），不含任何 workloom 工具，不破坏 child 零派发保证。

2. 理论工具集与 executor 注入
   - executor 派发时 `theoreticalTools` = 内置 4（read/bash/edit/write）+ 探测命中时 `[lsp_diagnostics, lsp_fix]`。
   - `buildExecutorPrompt` 传入 `localDirectives: composeLocalDirectivesText(root, kind, theoreticalTools)` —— 与 DSH 侧 `visibleNames − denyList` 语义等价（child 真实可见工具集的静态投影）。
   - 未命中时 requiresTools 片段被过滤，与"有才用"语义一致。

3. Pi 主会话注入
   - `inject.ts` 的 `assembleSessionContextText` 包装与 `session_start` 注入调用增加可选 `localDirectives`（文本 = `composeLocalDirectivesText(root, 'main', getActiveTools())`）。
   - 主会话 getActiveTools 即其真实工具面（settings.json 包列表含 pi-lsp 时含 `lsp_diagnostics`）。

4. pi-lsp server 配置（机器层，不入仓库）
   - 写 `~/.pi/agent/pi-lsp.json`（pi-lsp canonical 配置名）：对齐 DSH 四件套 —— gopls、bash-language-server、TS 用 tsgo（`tsc --lsp --stdio`）优先 + typescript-language-server 兜底。
   - child 与主会话共享同一用户级配置（同用户），无需项目级。

5. 分层与口径
   - `agent-definitions.ts` 人设零改动（executor-voice：LSP 句子只存在于 core `EXECUTOR_CONTRACT_BY_KIND`，adapter 不重复）。
   - core 零行为变化：`assembleSessionContext`/`buildExecutorPrompt` 参数已就位，本任务只是接线；若实现中发现签名障碍，最小改动并记录。
   - Pi child 的软基线经 `buildExecutorPrompt` 共享 `EXECUTOR_CONTRACT_BY_KIND` 自动生效（已验，无需额外工作）。
   - 不引入新 config 字段（能力探测为默认路径）。

## Acceptance Criteria

TC1 `buildChildPiArgs` 纯函数：探测命中时参数序列含 `-e npm:@narumitw/pi-lsp` 且仍含 `--no-extensions`；未命中时不含 `-e` 参数（两种情形均断言）。
TC2 理论工具集计算（纯函数）：命中 → read/bash/edit/write/lsp_diagnostics/lsp_fix；未命中 → read/bash/edit/write。
TC3 executor 派发产物：理论工具集含 `lsp_diagnostics` 时，`localDirectives` 文本含 implement/check/frontend 片段内容；不含时为空（AND 过滤生效）。
TC4 主会话注入：`session_start` 快照文本含 `Local directives:` 小节与 main.md 内容（Pi 环境构造测试）。
TC5 回归：`agent-definitions.ts` 未出现 LSP 句子；adapter-pi 现有测试全绿（47/47 基准）；core 测试全绿。
TC6 pi-lsp.json 落盘 `~/.pi/agent/pi-lsp.json` 且可被 pi-lsp 解析（手工验收：Pi 主会话对 `.ts` 与 `.go` 文件实际调用一次 `lsp_diagnostics`，返回诊断或明确的 server 报错均可接受，不得为"配置无法解析"类错误）。

## Notes

- Pi 主会话的 Local directives 注入为 `session_start` 一次性（文本入上下文历史后持续存在）；DSH 为每轮快照。两者覆盖效力等价、注入形态不同（记录，不拉齐）。
- 本机事实：pi-lsp@0.49.5 已在 pi 扩展 store，`~/.pi/agent/settings.json` 包列表含它；能力探测路径已覆盖未装插件的机器（不追加 `-e`，片段被过滤）。
- research 产物（`research/01-tools-no-extensions.md` 等 4 份）为事实依据，1.3 作为上下文引用。
