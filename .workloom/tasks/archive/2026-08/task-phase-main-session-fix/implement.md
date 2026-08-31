# 实施计划：stage 机制与 check 阶段主会话修复窗口（test-first）

## 总原则

1. 垂直切片：每个切片先写测试（红）→ 最小实现（绿）→ 回归，禁止横向批量测试或先实现补测试（tdd skill）。
2. 一个切片 = 一次 implement subagent 派发（workloom_execute kind=implement，title 区分切片）；不 commit（2.3 主会话控制）。
3. 验证命令：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`；core `node --test test/*.test.js`；adapter-dsh `node --test test/*.test.js`；adapter-pi `bun test test/*.test.ts`（先 build）。
4. 改动按 design.md §2–§6；任何偏离先暂停问主会话。

## 切片 1：core stage 字段（S1）

1. 红：`task-store.test.js` 追加——① 无 stage 旧 task.json 归一化默认 `'implement'`；② `recordExecutorDispatch` 后 stage 更新：implement/frontend → implement、check → check、research → 保持；③ `computeTaskStage` 纯函数边界（非法 kind 与现有 assertKind 一致抛错）。
2. 绿：`task-store.d.ts` + `task-store.js`（`TaskStage` 常量、Task 字段、归一化、`computeTaskStage`、`recordExecutorDispatch` 同点写入）。
3. 回归：core 全量测试绿。

## 切片 2：gate stage=check 放行（S2）

1. 红：`gate.test.js` 追加——① 主会话 + in_progress + stage=check + 业务文件 write/edit → allow；② stage=implement → deny（既有）；③ 无 stage 旧任务（归一化 implement）→ deny；④ 既有分支（子代理豁免/`.workloom/`/root 外/gate:false/非 in_progress）不回归。
2. 绿：`gate.ts` `decideMainSessionGate` 插入 stage 判定（design.md §3）。
3. 回归：adapter-dsh 全量测试绿。

## 切片 3：core 纪律段（check 修复职责）

1. 红：`executor-context.test.js` 追加——四 kind 均注入纪律段；check 段含"发现即修"与 `## Open issues`；userPrompt 含关键词时纪律段去重。
2. 绿：`executor-context.js` / `.d.ts`（`EXECUTOR_CONTRACT_BY_KIND` + 注入位置）。
3. 回归：core 全量测试绿。

## 切片 4：Pi 角色文案对齐

1. 红：`adapter-pi/test/agents.test.ts` 断言更新——check systemPrompt 不再含纯报告收尾句（"review report is complete"），含评审+修复导向。
2. 绿：`agent-definitions.ts` check 段改写（保留角色总述，与 core 纪律段互补）。
3. 回归：adapter-pi 全量测试绿。

## 切片 5：doctor stage 一致性

1. 红：`doctor.test.js` 追加——in_progress + stage=check + 最近派发非 check → warn；stage 非法值 → warn。
2. 绿：`doctor-checks.ts`（第 9 类检查）+ `assets/commands/workloom-doctor.md` 检查清单 8→9。
3. 回归：core 全量测试绿。

## 切片 6：契约与文案（S3）

1. 红：`workflow-contract.test.js` 断言更新——version 13；§2.2 含"发现即修"、"## Open issues"、主会话修复窗口与"重派 check 全量复核"、仅存问题逐条处理；in_progress 指引含 stage=check 放行；norms Dispatch 例外句。
2. 绿：`workflow.md`（version 13 + §2.2 + `[workflow-state:in_progress]` + `[workflow-norms]`）+ `config.example.yaml` executor.gate 注释。
3. 回归：core 全量测试绿。

## 切片 7：全量回归与报告

`pnpm lint` / `pnpm -r typecheck` / `pnpm -r build` + 三包测试全绿；按固定格式报告改动文件与验证结果、未完成项。
