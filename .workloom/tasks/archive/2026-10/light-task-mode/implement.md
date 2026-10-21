# 轻量任务模式 — implement

按 test-first 红绿推进，每个阶段先写失败用例再实现到绿。全部改动落在任务 worktree（`.workloom/worktree/10-21-light-task-mode`）。

## 阶段 1：mode 数据布局（接缝一）

1. 红：`packages/core/test/task-store.test.js` 加用例——create 传 `mode: 'light'` 落 task.json；缺省为 `'full'`；存量无 mode 的 task.json 读入归一化为 `'full'`；非法 mode 值 create 报错。
2. 绿：task-store.js（createTask 写字段 + normalizeTaskRecord 补缺省）、task-ops.ts（入参与校验）、surface.ts（PARAM_DESCRIPTIONS.mode + TOOL_SNIPPETS 同步）。
3. 跑该测试文件确认绿。

## 阶段 2：闸门分支（接缝二）

1. 红：light 任务 start——无凭证/无 jsonl/无 marker 但 prd 有 H1+Goal 时通过；缺 H1 或 Goal 占位仍拦截；check 免 jsonl 直接记录；full 任务既有用例逐字不动（护栏）。
2. 绿：task-gates.js light 分支 + task-store.js 两处调用点（start 643/650、check 769-771）。
3. 跑相关测试文件确认绿。

## 阶段 3：派发拒绝（接缝三）

1. 红：对 light 任务派任一 kind 返回 err（文案含主会话包办语义）；`force: true` + reason 豁免且 overrides 记 `light_dispatch`；full 任务派发不受影响。
2. 绿：task-store.js 派发记录路径（744 行附近）加 mode 检查；task-gates.js GATES/GATE_TOOLS 加 `light_dispatch`；task-gates.d.ts 同步。
3. 跑相关测试文件确认绿。

## 阶段 4：注入切换与资产（接缝四）

1. 红：workflow-service 测试——light 任务 breadcrumb 取自 light 文件、full 任务逐字不变、light 轨不叠加 overlay；session-context 测试——light 任务概览行来自 light 步骤集、full/无任务逐字不变（护栏）。
2. 绿：
   - 新建 `packages/assets/workflow/workflow-light.md`（design §4）；
   - workflow-service.ts 抽生效契约解析子链 + `assembleWorkflowProjection` + `lightContractText` 入参；
   - 主契约 workflow.md 文本增补（1.0 否定标准与轻量轨、norms 豁免句；version 不动）；
   - 双 adapter 装配改调 `assembleWorkflowProjection`、breadcrumb 传 `lightContractText`、create schema 加 mode。
3. 资产解析用例：workflow-light.md 通过 parseContract（三块齐全、步骤 id 无重复、无 norms 块）。
4. 跑相关测试文件确认绿。

## 阶段 5：workloom-continue SKILL.md

- 路由步骤前加必要性重估（design §7）。

## 阶段 6：收口验证

1. `pnpm lint`、`pnpm -r typecheck`、core 与受影响包的 `node --test` 全量、adapter-pi 按 `.workloom/spec/adapter-pi/verify` 口径。
2. `pnpm -r build` 重建 dist（core 必重建；adapter src 改了则各自重建），核对 dist 与 src 同步。
3. 报告：改动文件清单 + 各验证结果 + 红绿证据。

## 纪律

- 禁止 git commit / git push（提交由主会话负责）。
- 主契约 version 与 `domain/protocol.js` 的 WORKFLOW_PROTOCOL_VERSION 不动。
- 报错文案英文，代码注释中文，资产文本英文，SKILL.md 遵循其现有语言风格。
