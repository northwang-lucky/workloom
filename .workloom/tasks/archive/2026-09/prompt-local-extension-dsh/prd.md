# 提示词本机扩展点机制（DSH 落地）

## Goal

为 workloom 的提示词注入链增加本机可扩展点：`.workloom/prompts.local/`（gitignore）按目标文件提供附加纪律片段，支持 `requiresTools` 条件注入；同时产品内置一条 runtime 无关的 LSP 软基线。扩展点机制由 core 承载（runtime 无关），adapter-dsh 负责工具探测与注入落地；adapter-pi 落地拆为后续任务。

## Requirements

1. 本机片段目录约定
   - 目录：项目根 `.workloom/prompts.local/`，加入 `.workloom/.gitignore`。
   - 合法文件名：`main.md`、`research.md`、`implement.md`、`check.md`、`frontend.md`、`all.md`；其他 `.md` 文件名 fail loud（错误信息列出合法文件名清单）；非 `.md` 文件忽略。
   - 目录不存在 = 无片段，整体零行为；文件缺失/内容为空 = 跳过该目标注入。

2. 片段格式
   - Markdown 正文 + 可选 YAML front-matter；front-matter 字段：`requiresTools: [<tool name>, ...]`（多值 AND 语义：声明的工具全部位于可用工具集才注入）。
   - front-matter 解析失败（非法 YAML、未知字段、requiresTools 非字符串数组）fail loud，与 config.yaml 的 fail-loud 口径一致；本机片段是有意为之的增强，静默失效最难排查。

3. 目标映射与合成
   - 主 agent（delegationDepth=0）：合成 `all.md`（前）+ `main.md`（后）。
   - executor 子代理：按 kind 合成 `all.md`（前）+ `<kind>.md`（后）；research/implement/check/frontend 各对应一个文件名。
   - depth>0 的 session 上下文不再注入本机片段（片段只在 executor 首条 prompt 注入一次，避免 all.md 重复注入）。
   - 注入不计入 context_injection 预算（纪律文本量小且必须完整生效）。

4. 条件注入
   - 可用工具集探测：主 agent 侧取 `ctx.tools.schemas()` 全局视图；executor 侧取可见工具名 `visibleNames - denyList`（与 toolFilter deny 后子代理真实可见集一致，buildExecutorPrompt 调用在 denyList 计算之后执行）。
   - core service 纯函数完成读取→解析→按可用工具集过滤→按目标与 all/kind 顺序合成；`buildExecutorPrompt` 新增可选字符串参数，Pi 不传 = 不注入，向后兼容。

5. 主 agent 注入点
   - assembleSessionContext 快照尾部（norms 段之后）追加 `Local directives:` 小节，内容为合成后的主 agent 片段文本。

6. executor 注入点
   - executor 首条 prompt：kind 纪律段之后、leaf 契约段之前，追加 `## Local directives` 段；userPrompt 已含该标题时不再追加（与 leaf 段去重同规则）。

7. 内置 LSP 软基线（产品内置，runtime 无关，不带条件）
   - 软措辞："When LSP tooling is available, use it to assist coding and error diagnosis, and include an LSP diagnostics check in the verification pass."（检测到 LSP 工具时，由本机片段加强为硬指令。）
   - 落点：core `EXECUTOR_CONTRACT_BY_KIND` 的 implement/check/frontend 三个 kind 文本（research 不加）；workflow.md 的 2.1/2.2 步骤正文、`[workflow-state:in_progress]` 块、`[workflow-norms]`。
   - `EXECUTOR_NORMS`（depth>0 的 norms 常量）不加：避免同一指令在 norms 与 kind 纪律段重复，research 只读不改代码。
   - 不存在"产品内置片段"概念：LSP 基线直接写入上述常量/契约文本，加载器只服务本机片段。

8. 可观测性
   - `workloom_doctor` 新增检查：读取 prompts.local，列出每个已加载片段（target、条件、来源文件）与未加载原因（条件不满足/文件缺失/未知文件名）；目录不存在时该项通过。

9. 文档与本机落地
   - `.workloom/config.example.yaml` 补一节：目录约定、片段格式、requiresTools 语义、本机用途示例（LSP 硬约束）。
   - 本仓库本机 `.workloom/prompts.local/` 落地四个偏好文件（gitignored，不入库）：main.md、implement.md、check.md、frontend.md，内容为硬约束：必须使用 LSP 工具辅助编码与排错，implement/check 收尾必须报告 LSP 诊断验证结果。

10. 契约版本：workflow.md `version: 13` → `14`（契约内容变更）。

## Acceptance Criteria

TC1 core 片段加载与解析：给定含 front-matter 的片段文件返回结构化结果；非法 front-matter 抛错（fail loud）。
TC2 core 条件过滤：availableTools 含全部声明工具时注入；缺任一时不注入（AND 语义）。
TC3 core 目标合成与顺序：all 在前、专属在后；未知文件名 fail loud；目录缺失返回空。
TC4 buildExecutorPrompt 新参数：传入文本时插入位置为 kind 纪律段之后、leaf 段之前；不传时与旧版行为完全一致（Pi 向后兼容）；userPrompt 已含 `## Local directives` 时不重复。
TC5 assembleSessionContext：depth=0 注入 `Local directives:` 小节（norms 后）；depth>0 不注入。
TC6 adapter-dsh 探测与传参：主 agent 用 `ctx.tools.schemas()`；executor 用 `visibleNames - denyList`；可用工具集不含声明工具时 executor 首条 prompt 无 Local directives 段。
TC7 内置软基线：EXECUTOR_CONTRACT_BY_KIND 的 implement/check/frontend 含 LSP 句子、research 不含；EXECUTOR_NORMS 不含；workflow.md 的 2.1/2.2 正文、`[workflow-state:in_progress]`、`[workflow-norms]` 含软基线句子；version 为 14。
TC8 doctor：新检查输出已加载片段与未加载原因；无目录时通过。
TC9 本机偏好文件（main/implement/check/frontend 四个）落盘于 `.workloom/prompts.local/` 且被 gitignore 忽略（`git status` 不显示）。

## Notes

- 分层约束：加载/过滤/合成逻辑在 core（runtime 无关）；adapter-dsh 仅做探测与传参（thin）。本次新增 core 抽象为 TypeScript，落入 `src/service/`；legacy 纯 JS 模块只接字符串参数，保持免构建。
- 本次不实现 adapter-pi 落地（后续任务）：Pi 子代理经 `--no-extensions` 无扩展工具，落地形态依赖本机制定型。
- 本机偏好文件在 git 之外，属交付物之一但不算仓库改动；仓库改动为：core service + executor-context 参数 + session-context + adapter-dsh 探测 + workflow.md + doctor + config.example.yaml + `.workloom/.gitignore`。
