# 实施计划：执行器指令冲突治理（test-first）

## 总原则

1. 垂直切片：先红后绿，一个切片一次 implement 派发；禁止先实现补测试。
2. 不 commit（2.3 主会话控制）；不 push；不调 workloom check；不重启 dshweb（部署同步按 repo/deployment，仅 rsync）。
3. 验证：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`（先 build 后测试，core 测试消费 dist）；core `node --test test/*.test.js`、adapter-dsh `node --test test/*.test.js`、adapter-pi `bun test test/*.test.ts`。
4. 英文终稿措辞以 design.md §2-§4 为准，逐字采用；改动偏离先暂停问主会话。

## 切片 1：core 权威声明终结句 + 契约 v16（S1+S2）

1. 红：
   - `packages/core/test/executor-context.test.js`：`AUTHORITY_DECLARATION` 常量按 design §3 更新（追加冲突终结句）；既有尾部断言随常量自然生效。
   - `packages/core/test/contract-asset.test.js`：version 16；norms 两句 stage 限定与 "including implementation code" 断言；§2.1 Hard constraint 限定断言；in_progress 新句断言；principle 4 新句断言；§2.2 告知句断言；LSP 五场景句保留断言。
2. 绿：
   - `packages/core/src/legacy/executor-context.js`：`AUTHORITY_DECLARATION` 追加冲突终结句（design §3 原文）。
   - `packages/assets/workflow/workflow.md`：version 16 + design §2 七处措辞（norms 两句、§2.1、in_progress、principle 4、§2.2 告知句；LSP 段不动）。
3. 回归：core 全量测试绿；grep 确认无 stage 无限定的旧 Hard constraint 句残留（契约与 norms 域）。

## 切片 2：adapter-dsh continue 失败转译（S3）

1. 红：`packages/adapter-dsh/test/executor.test.js`——模拟 followup 抛 `... belongs to another parent session ...`：断言工具结果文本含 "Dispatch a fresh executor" 引导语义且 isError；`locateContinueChildId` 各失败路径（no record / cross-kind）不回归。
2. 绿：`packages/adapter-dsh/src/executor.ts` followup 调用段捕获含 `belongs to another parent session` 的错误 → 转译为 design §4.2 引导文案；注释标注对上游错误文案的依赖。
3. 回归：adapter-dsh 全量测试绿。

## 切片 3：全量回归与报告

`pnpm lint` / `pnpm -r typecheck` / `pnpm -r build` + 三包全量测试全绿；grep 一致性巡检（契约与 norms 域无旧全称句残留、LSP 五场景句原样）；按固定格式报告（改动清单、验证结果、未完成项）。若有失败必须先修（本任务范围内）再报告。
