# subagent fallback_models 失败转移 — implement

按 test-first 红绿推进，每个阶段先写失败用例再实现到绿。全部改动落在任务
worktree（`.workloom/worktree/10-21-subagent-fallback-models`）。设计细节以
[design.md](design.md) 为准；实现前读本任务 prd.md + design.md + implement.jsonl
列出的 spec 条目。

## 阶段 1：配置解析（接缝一）

1. 红：`packages/core/test/` 配置加载测试加用例——`fallback_models` 合法加载
   （旧顶层 subagents 与 subagent_profiles 内层各一）；元素缺 model / model 非
   string / model 为 map / effort 非 string / 元素含未知字段 / 链内重复 model
   均按字段路径 fail loud；空数组等价缺省；分层合并（profile 命中条目优先于
   旧 subagents）；`resolveSubagentDefaults` 返回 `fallbackModels` 及来源。
2. 绿：config.d.ts（`SubagentConfigEntry.fallbackModels` +
   `ResolveSubagentDefaultsResult.fallbackModels`）、config.js
   （`parseSubagentsEntries` 增字段解析与校验、合并链透出）。
3. 跑 core 配置相关测试确认绿。

## 阶段 2：分类与文案纯函数（接缝二）

1. 红：新建 `packages/core/test/failover.test.js`——白名单内 code 全命中；
   白名单外（INVARIANT / 空 / undefined）不命中；`extractFailureCode` 对
   带 code 对象 / 无 code 对象 / string / null 的提取口径；
   `buildFailoverNote` / `buildFailoverNotice` 文案含关键要素
   （deadModel / code / 半成品提示 / 续用丢失说明 / 第几跳）。
2. 绿：新建 `packages/core/src/domain/failover.js`（白名单常量 +
   三函数），导出挂 core 入口，.d.ts 同步。
3. 跑该测试文件确认绿。

## 阶段 3：dispatches 链式留痕（core task-store）

1. 红：派发记录写入/读取携带 `fallbackOf` / `fallbackAttempt` 可选字段；
   `appendDispatchErrorSuffix` 向最近 failed 记录 error 行追加后缀；
   旧记录无字段兼容。
2. 绿：task-store.js（记录字段 + 新 store 函数）、相应 .d.ts。
3. 跑相关测试确认绿。

## 阶段 4：adapter-dsh 同步派发走链（接缝四）

1. 红：`packages/adapter-dsh/test/`——fake ctx 下 startActivation 第一次
  reject 带 `code: 'UNKNOWN_MODEL'`：第二次以 fallback 模型成功，receipt
  含 ` (failover attempt 2: <model>)`，dispatches 含一跳 failed 记录 +
  一跳 running 且链式关联；非白名单 code 原样抛出（护栏）；链穷尽重抛
  且消息含尝试链；显式 model 参数时白名单失败也原样抛出（不走链）。
2. 绿：executor.ts 的 startActivation 调用包 try/catch + 走链循环；
   executor-receipt.ts TurnMeta 增 failover 标注；core failover.js 的
   extractFailureCode/isModelInaccessibleCode 接入。
3. 跑该测试文件确认绿。

## 阶段 5：adapter-dsh 异步结算转移（接缝三）

1. 红：fake ctx 模拟 session/event（turn/end error，结构化 reason）+
   subagent/end——断言：以 fallback 模型重新 startActivation、注入文本含
   failoverNote、dispatches 链式留痕、`agent.followup` 被调一行通知且
   sessions.flush 被调；续用轮标记时 note 含增量丢失说明；容量闸撞限
   放弃转移并通知；链穷尽时 failed 记录 error 行接尝试链 + 穷尽通知；
   未配置 fallback 的既有 settle 用例逐字不动（零变化护栏）。
2. 绿：executor-settle.ts（登记表值扩为 { line, code }、settle 后调转移
   钩子）；新建 executor-failover.ts（注册表 + fire-and-forget 编排 +
   通知通道）；executor.ts 派发/续用两路登记注册表；source kind
   `workloom` 的 MessageSourceMap 模块增补声明。
3. 跑该测试文件确认绿。

## 阶段 6：文案、spec 与构建收尾

1. `TOOL_DESCRIPTIONS.executor` 增一句自动转移说明（surface.ts，
   双 adapter 共用该文案时确认 pi 侧投影不受行为影响——pi 本任务无行为）。
2. 改写 `.workloom/spec/repo/workflow/index.md` 的 `transport-failover`
   条目（自动内置 + 人工兜底降级）。
3. 全量验证：`pnpm lint`、`pnpm -r typecheck`、core 与 adapter-dsh 的
   `node --test`、`pnpm -r build`；dist 变更就绪（core + adapter-dsh）。
4. 回报：测试计数、改动文件清单、dist 同步状态、与 design 的偏差及理由。
