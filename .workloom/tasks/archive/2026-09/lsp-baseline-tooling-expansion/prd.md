# 扩展 LSP 提示词基线：引导流程使用 lsp_diagnostics 之外的 LSP 工具

## Goal

workloom 全链路提示词目前只提 "LSP diagnostics check"，实测（cardx 197 会话 + workloom 30 会话）除 `lsp_diagnostics` 与零星 `lsp_symbols` 外其余 6 个 LSP 工具零使用。本任务扩展内置软基线措辞，按场景引导模型主动使用 diagnostics 之外的 LSP 能力，同时保持 runtime 无关性（不指向 Pi 上不存在的工具）。

## Requirements

### 已定结论（brainstorm 2026-09-02 第一轮）

- R1 措辞分层（Q2=A）：core 软基线句与 workflow.md 契约一律用**场景语言**（如"改名走服务端重构""报错优先取 LSP 修复动作"），不点名 runtime 特有工具名；**DSH 本机片段**（`.workloom/prompts.local/`）才点名本机 8 个 `lsp_*` 工具。避免 Pi 侧指向虚无（Pi 仅有 `lsp_diagnostics` + `lsp_fix`）。
- R2 落点统一（Q3=A）：core `EXECUTOR_CONTRACT_BY_KIND` 的 implement/check/frontend 三 kind 纪律段、workflow.md 的 2.1 / 2.2 / in_progress 面包屑 / workflow-norms 四处，全部换成同一扩展基线句，单一来源，与现状句同构。
- R3 本机与示例落地（Q4=A）：本仓库 `.workloom/prompts.local/` 四片段（main/implement/check/frontend）随任务改为点名式措辞（不入库，gitignored）；`.workloom/config.example.yaml` 示例段同步，作为分层措辞的示范载体（入库）。
- R4 门禁机制不动（Q5=A）：`requiresTools: [lsp_diagnostics]` 维持单哨兵，不加通配、不改 core 机制。
- R5 契约版本（Q6 验收口径）：workflow.md `version: 14` → `15`；产物按 deployment 纪律 rsync 同步至 profile。

### 已定结论（补充：第二轮）

- R0 引导范围（Q1=A）：公共侧（core 句 + 契约）场景语言覆盖 **rename / code_action / completion / symbols / signature** 五类 + diagnostics 原有职责；本机片段点名 8 个工具，其中 **format / inlay_hints 标"按需"**降级。
- R6 example 写法（Q2=A）：`config.example.yaml` 示例片段用点名式 + 环境注释（"示例基于 DSH + dsh-lsp-actions；工具名因 runtime/本机配置而异"）。

### grilling 结论（2026-09-02，两轮收敛）

- G1 主基线句（Q1=A）：替换 `LSP_BASELINE_SENTENCE` 为五场景句（已批准草案，写入 design.md 为准，测试快照同源）：
  > When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.
- G2 research 变体句（Q2=A + Q4=A）：新增只读场景句，**仅**注入 core `EXECUTOR_CONTRACT_BY_KIND[research]` 纪律段，不进 contract 正文（contract 仍 4 处替换）：
  > When LSP tooling is available, explore through it before falling back to text-search sweeps: map code structure with LSP symbol outlines and resolve call signatures and members from the language server.
- G3 本机片段定制（Q3=A）：`.workloom/prompts.local/` 四片段按 target 定制侧重句（main：symbols 摸底；implement：rename/completion/signature + diagnostics 报告；check：code_action/diagnostics 报告；frontend：implement 子集 + format 按需），8 工具点名表共享，format/inlay_hints 标"按需"；具体措辞在 1.4 review 一并过目。
- G4 Pi 侧零代码改动（隐含确认）：场景语言天然覆盖 pi-lsp 的 `lsp_fix`（"quick-fixes / code actions"）与 diagnostics；Pi 的 theoretical tools / 能力探测机制不动。
- 1.2 research 步骤判定跳过：事实摸底（工具清单、两 runtime 能力面、测试断言位、token 体量）已在对齐过程中实证完毕。

## Acceptance Criteria

- AC1（测试先行接缝，Q7=A 且 2026-09-02 第二轮用户确认 A）：三个测试文件（`core/test/executor-context.test.js`、`core/test/contract-asset.test.js`、`core/test/session-context.test.js`）的基线句断言先行更新为新主句快照 + research 变体句断言 + 包含断言，红 → 绿。
- AC2：core 四 kind 纪律段（implement/check/frontend 用主句，research 用变体句）、contract 四处、norms 段全部含新基线句；单一常量来源，与注入文本一致。
- AC3：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`packages/core node --test test/*.test.js`、`packages/adapter-dsh node --test test/*.test.js` 全绿。
- AC4：契约 version 15；`.workloom/config.example.yaml` 示例段更新；本仓库 prompts.local 四片段更新并 `workloom_doctor` 验证加载。
- AC5：LSP diagnostics 验证 pass（本机硬约束）。
- 事后观察项（不入门槛）：真实会话中非 diagnostics `lsp_*` 工具使用率变化。

## Notes

- 现状锚点：core 句子在 `packages/core/src/legacy/executor-context.js` LSP_BASELINE_SENTENCE；契约 4 处为 2.1 完成标准、2.2 完成标准、`[workflow-state:in_progress]`、`[workflow-norms]` LSP 段。
- DSH 8 工具：diagnostics / format / completion / rename / code_action / symbols / signature / inlay_hints（dsh-lsp-actions 注册，executor 可继承）。Pi pi-lsp 仅 diagnostics + fix。
- 历史包袱：原任务（archive/2026-09/prompt-local-extension-dsh）刻意只写 diagnostics 以守 runtime 无关；本任务是有意扩展且守住同一约束。
