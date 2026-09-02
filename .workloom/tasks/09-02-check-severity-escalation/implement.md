# 实施计划：check 分级制度与小修大决断（test-first）

## 总原则

1. 垂直切片：先红后绿，一个切片一次 implement 派发；禁止先实现补测试。
2. 不 commit（2.3 主会话控制）；不 push；不调 workloom check。
3. 验证：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`；core `node --test test/*.test.js`、adapter-dsh `node --test test/*.test.js`（先 build）、adapter-pi `bun test test/*.test.ts`。
4. 改动按 design.md §2–§4；偏离先暂停问主会话。

## 切片 1：core 纪律段末置权威化 + 分级改写（S1）

1. 红：`packages/core/test/executor-context.test.js`——① 注入顺序：userPrompt 之后紧接 `## Executor contract` 权威段（旧断言"userPrompt 后跟 kind 纪律段标题"更新为"后跟 Executor contract 段"）；② 权威声明句存在（"This section is authoritative... wins"）；③ check 段含 P0/P1/P2 分级（P0 阻断/红线、P1 重要/偏离/非本次引入、P2 机械性）与"P2 自修、P0/P1 上报"；④ Open issues 行格式 `[P0|P1|P2]`、无问题 `- none`；⑤ leaf 去重语义：userPrompt 含 leaf 关键词时不追加权威段；kind 标题去重分支删除后无残留断言。
2. 绿：`packages/core/src/legacy/executor-context.js`（注入顺序调整、权威声明、check 纪律段分级改写、去重规则简化）+ `.d.ts`。
3. 回归：core 全量测试绿。

## 切片 2：契约 v14（S2）

1. 红：`packages/core/test/contract-asset.test.js`——version 14；§2.2 含 P0/P1/P2 定义、主会话派发指引（禁"只读审查/仅报告/不要改代码"、禁引导分级、prompt 须含"发现即修（P2）+分级上报（P0/P1）"）、P0 权属（只能修或用户确认后调基线）、Open issues `[P0|P1|P2]`；principle 5 澄清句（子任务 check 非只读、"修复由容器决定"不成立）。
2. 绿：`packages/assets/workflow/workflow.md`（version 14 + §2.2 增补 + principle 5 澄清）。
3. 回归：core 全量测试绿；全库 grep 确认无"只读审查"类残留文案（生产/测试）。

## 切片 3：Pi 角色总述补分级句（S3）

1. 红：`packages/adapter-pi/test/agents.test.ts`——check total 含 P0-P2 分级句（如 "Classify findings P0/P1/P2: fix P2 yourself, escalate P0/P1"）。
2. 绿：`packages/adapter-pi/src/agent-definitions.ts` check systemPrompt 补句（与纪律段互补，不重复定义）。
3. 回归：adapter-pi 全量测试绿。

## 切片 4：全量回归与报告

lint/typecheck/build + 三包全量测试全绿；grep 一致性巡检（"只读审查"、"修复由容器决定"、"do not merely report" 旧句仅限契约新句与测试断言）；按固定格式报告（改动清单、验证结果、未完成项）。

**实现者注意**：本任务自身即将成为新纪律的首个实战例——你被派发时，本任务 stage=check 会在派发完成后写入；你的 check 复核轮将按 P0/P1/P2 自行分级（P1 上报、P2 自修），主会话不做分级引导。
