# 设计：always-on 行为规范注入会话上下文快照

## 1. 契约格式（assets workflow.md）

- 新增 `[workflow-norms]...[/workflow-norms]` 标签块（放文末、workflow-state 块之后），tag 名与既有 `workflow-state` 前缀不冲突。
- norms 内容（英文，两组）：
  1. 提问规范：用户语言 / 选项不进题 / 禁交互式提问工具 / 分批编号提问；
  2. 派发硬约束：实现文件改动全部来自 workloom_execute 派发的子代理，主会话不直接写实现。
- 1.1/2.1 的步骤正文保留完整且措辞与 norms 一致（step 详情仍是完整规范来源）。
- version 5 → 6。

## 2. core 解析（legacy/workflow-contract.js）

- 新增 norms 块的 open/close 正则（`workflow-norms`，机制与 workflow-state 块相同）；parseContract 返回结构新增 `norms: string | null`（缺失为 null，向后兼容旧契约，不告警不报错）。
- .d.ts 类型同步；测试先行（含旧契约无 norms 块的兼容用例）。

## 3. core 组装（service/session-context.ts）

- `SessionContextParams` 新增可选 `norms?: string | null`；
- `assembleInternal` 在 guidelines 段之后追加 norms 小节：标签行 `Always-on norms:` + norms 原文（norms 为 null/空白时不追加，快照结构不变）；
- 小节固定标签做成常量（与 GUIDELINES_LABEL 同风格）；
- 测试先行（追加/不追加/原文保留三用例）。

## 4. 两 adapter 透传（各一行）

- adapter-dsh `plugin.ts` 的 renderSessionContext：`assembleSessionContext` 入参补 `norms: contract.norms`；
- adapter-pi `inject.ts`：同样透传。两 adapter 无其他改动（共享 core 组装链路，自动受益）。

## 5. 测试缝（test-first）

1. 契约解析：norms 块解析（含缺失兼容、多行内容保留）；
2. 快照组装：norms 小节追加/不追加、位置在 guidelines 之后。
文案资产（workflow.md）不适用红绿，用契约解析测试覆盖。
