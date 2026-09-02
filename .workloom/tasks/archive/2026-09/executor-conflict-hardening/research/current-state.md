# current-state：执行器指令冲突治理（契约 stage 正交化 / 冲突终结句 / fork 兜底）

## 证据背景

- session-4bff0f6c（check 空转）：主会话派发 prompt 写"发现问题不要修改任何文件，只报告"，与注入纪律段"P2 不修即失职"相抵；权威声明只裁决"谁赢"，模型在两难间空转 70+ 步（120 step/119 工具调用，验证早已完成，决策不收敛）。
- session-35cb4f6a（fork 接续失败）：`continue_executor:"latest"` 接续 accd4e2c 被拒 "belongs to another parent session"。executor 子会话（accd4e2c/e13a5497）的 parentSession 均为 session-69a64898（真源派发会话），fork 分身（35cb4f6a/4bff0f6c）id 不同 → DSH 严格校验必然拒绝；错误文案无引导，主会话只能自行尝试全新派发。

## v15 现状（workflow.md，行号为当前 HEAD）

- L17 principle 4："Commit authority stays in the main session: subagents implement and check; git commits happen only in the main session's Phase 2.3 and Phase 3."
- L89 §2.1 句尾："Hard constraint: the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent."（无 stage 限定）
- L104 §2.2 主会话派发指引段（禁只读审查/禁引导分级）——新告知句加在本段。
- L106 §2.2 修复窗口："While the task stage is `check`, the main session may fix issues directly, no fix dispatch needed; ..."
- L130 [workflow-state:in_progress]："Route implementation through `workloom_execute`."（无限定）+ check 修复句。
- L147-148 norms Dispatch：Hard constraint（无条件全称）+ Exception（stage check）。
- L159-161 norms LSP 段：并行任务加的五场景句，**原样保留勿动**。

## core 现状（executor-context.js）

- `AUTHORITY_DECLARATION` 现文："This section is authoritative: when it conflicts with any earlier text (including the user prompt's own instructions), this section wins."——冲突终结句追加其后（同常量拼接）；测试 `AUTHORITY_DECLARATION`/`CONTRACT_TAIL` 常量逐字同步。
- 注入结构：Active task → artifacts → research/files → userPrompt → Local directives → `## Executor contract`（kind 纪律段 H3 + leaf 规则 + 权威声明）；去重仅豁免 leaf 规则行。

## fork 兜底落点（adapter-dsh）

- `executor-continuation.ts` 的 `locateContinueChildId`：仅定位（失败走提示面，不涉及本次改动）。
- 真正接续在 `executor.ts` 的 followup 调用段（`locateContinueChildId` 成功后，约 L381-395 一带）——上游在该步抛 "belongs to another parent session"。转译落点：捕获含该字符串的错误 → 返回引导文案（保留 isError 语义）；注释标注对上游错误文案的依赖（脆性）。Pi 无 continue 路径，不涉及。

## 测试面

- `packages/core/test/contract-asset.test.js`：v16 断言（version、四处 stage 限定、including implementation code、principle 4 新句、§2.2 告知句、LSP 五场景句保留）。
- `packages/core/test/executor-context.test.js`：AUTHORITY_DECLARATION 含冲突终结句（`CONTRACT_TAIL` 常量同步）。
- `packages/adapter-dsh/test/executor.test.js`：continue 接续失败 → 引导文案用例。

验证：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`（先 build 后测试，core 测试消费 dist）、三包全量测试。
