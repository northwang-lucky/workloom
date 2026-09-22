# 修正 adapter-pi 执行器角色自述的过时注入描述

## Goal

`packages/adapter-pi/src/agent-definitions.ts` 四个 kind 的 `systemPrompt` 仍描述旧注入形态（「task context is already inlined」「budget exceeded → degrade to index lines」），与 slim-executor-context 后的现行机制（指针化 + 分层加载 + prd 仅 check/research 内联）不符，会误导执行器期待全量内联上下文。把角色自述改成与现行机制一致。

## Requirements

1. 四个 kind 的 `systemPrompt` 第二段替换为以下定稿（逐字；其余段落不动，`description` 字段不动）：
   - research：
     `Your prompt carries the task context: the PRD inline, plus pointers to any prior research products. Consult each pointer only when the current investigation step needs it, in targeted ranges; never bulk-read upfront.`
   - implement：
     `Your prompt carries the task context as pointers. Read the plan (implement.md) first; consult design.md, the PRD, and referenced files only when the current step needs them, in targeted ranges; never bulk-read the list upfront.`
   - check：
     `Your prompt carries the task context: the PRD (with its acceptance criteria) inline, plus pointers to the plan and referenced files. Read the plan (implement.md) first, then the actual code before judging; consult every other pointer only when the current check step needs it. Do not rely on summaries.`
   - frontend：
     `Your prompt carries the task context as pointers. Read the plan (implement.md) first; the PRD's UI Design section is your delivery baseline (follow its pointer); consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read upfront.`
2. 头注修正：「首派全量内联语义不变」改为「首派注入形态随 core 组装演进，现为指针化 + 分层加载」语义；「research/implement 与废弃前逐字一致」的失实历史表述删除，该区域改写为「四个 executor kind 的 description/systemPrompt 文案自写（英文），角色边界与 core 纪律段互补不重复；上下文形态描述与 core 现行指针化注入一致」语义。
3. `packages/adapter-pi/test/agents.test.ts` 新增防回归断言：四个 kind 的 systemPrompt 均不含 `'already inlined'`、`'degrade to index'`。
4. 交付按红→绿顺序：先加防回归断言（当前文案含旧关键词，断言红），再改文案与头注（转绿），同一 commit。

## Acceptance Criteria

1. 四个 `systemPrompt` 均不含 `already inlined`、`degrade to index`、`inlined budget` 旧机制表述。
2. 四个第二段与 Requirements 第 1 条定稿逐字一致。
3. 头注无「全量内联」「逐字一致」失实表述。
4. `agents.test.ts` 含第 3 条防回归断言；实现报告给出红（断言先行时失败）→绿（改文案后通过）证据。
5. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`packages/adapter-pi` 的 `bun test` 全绿；core / adapter-dsh 未改动（全量测试复跑确认无意外波及）。

## Notes

事实基线（代码核查，2026-09-22）：

- 过时表述集中在四个 `systemPrompt` 的第二段（research/implement/check/frontend 各一处变体），`description` 字段无过时内容。
- 测试 pin 现状：`agents.test.ts` 只断结构（键集、workloom 身份、「Do not dispatch subagents」、check 的 fix-oriented/P0P1P2/Open issues 行格式）；`pi-args.test.ts` 为引用相等断言，不受文案改动影响。
- 现行注入机制（措辞对齐的事实源）：`buildExecutorPrompt`（core executor-context.js）——指针清单 + 分层加载协议（必读 implement.md，其余按需定点读取，禁止 upfront 通读）+ prd 块仅 check/research + implement/frontend 的 prd 软指针。
- DSH 侧无对应角色自述（仅 Pi 有 agent-definitions），本任务只动 adapter-pi。
- 无 UI 适用性：纯文案与注释改动，无 `## UI Design` 节。

## Alignment Decisions

已确认（第 1 轮全部采纳推荐）：

1. 第二段统一改为「指针 + 分层加载」描述并按 kind 微调（定稿见 Requirements 1）。拒绝项：只删不补（对加载行为零指引）；只写「follow the loading protocol」（自述丢失形态信息，完全依赖注入到达）。
2. 头注两处失实表述顺带修正。拒绝项：不动（同一文件注释准确性受损）。
3. `agents.test.ts` 加防回归断言（`!includes('already inlined')`、`!includes('degrade to index')`）。拒绝项：不加（漂移曾真实发生，一行成本买防护）。
4. 交付按红→绿顺序（断言先行红、文案修正绿）。拒绝项：常规实现（红绿顺序顺手可得，不额外花费）。

收敛总结：4 个决策节点全部落定，无开放节点；任务为单文件文案 + 单测试文件断言的小改动，不拆子任务、不另写 design.md/implement.md（定稿文案已在本 prd 中，派发正文直接携带）。

<!-- workloom:open-nodes=none -->
