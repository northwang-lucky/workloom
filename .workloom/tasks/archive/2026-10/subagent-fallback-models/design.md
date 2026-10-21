# subagent fallback_models 失败转移 — design

## 总览

一条链贯通：配置 `fallback_models`（core 解析）→ 派发时刻登记转移上下文
（adapter-dsh 进程内注册表）→ 两类失败触发点（派发时同步抛错 / 运行中
turn/end 结算错误）→ 白名单分类（core 纯函数）→ 按链新开会话重派
（复用新派发尾段）→ dispatches 链式留痕 + 父会话一行通知。
未配置 `fallback_models` 时全路径逐字不动（零行为变化护栏）。

## 数据布局

### 配置（core domain/config.js + config.d.ts）

- `SubagentConfigEntry` 新增 `fallbackModels?: { model: string; effort?: string }[]`
  （camelCase 内存形态；配置文件字段名 `fallback_models` 蛇形，对齐
  `max_concurrent` 既有约定）。
- `parseSubagentsEntries` 增 `fallback_models` 解析：数组元素为 map、`model`
  必填非空 string（仅 string，不支持 runtime map）、`effort` 可选 string、
  未知字段 fail loud、空数组等价缺省、链内重复 model fail loud。
  旧顶层 `subagents` 与 `subagent_profiles` 内层同一入口，天然两层支持。
- 分层合并沿用字段级独立合并：`resolveSubagentDefaults` 返回值新增
  `fallbackModels`（profile 命中条目优先于旧 subagents；model 的 runtime
  map 解析不适用于链元素——解析期已限定 string）与对应来源标记。

### dispatches 记录（core domain/task-store.js）

- 派发记录新增可选字段 `fallbackOf?: string`（前一跳 childId）与
  `fallbackAttempt?: number`（本跳序号，首跳无字段）。链由 `fallbackOf`
  回溯重建；缺字段的旧记录兼容（归一化不补）。
- 新增 store 函数 `appendDispatchErrorSuffix(root, taskRelPath, childId, suffix)`：
  向该 childId 最近一条 failed 记录的 error 行追加后缀（链穷尽时写
  ` (fallback chain exhausted: m1 → m2 → …)`）；读取/写入失败返回 err 元组，
  调用方只告警。

## 模块设计

### 1. 分类与文案（core domain/failover.js，新文件，纯 JS + JSDoc）

- `isModelInaccessibleCode(code)`：白名单判定。白名单常量
  `MODEL_INACCESSIBLE_CODES`：`TRANSPORT`、`TIMEOUT`、`UNKNOWN_MODEL`、
  `AUTH`、`INVALID_CREDENTIAL`、`MISSING_CREDENTIAL`、`ACCOUNT_QUOTA`、
  `ACCOUNT_SIGN_IN_REQUIRED`、`ACCOUNT_TOKEN_INVALID`、`RATE_LIMIT`、`QUOTA`、
  `UNSUPPORTED_REASONING_EFFORT`。其余一律 false（含 undefined/空串）。
- `buildFailoverNote({ deadModel, code, wasContinuation })`：注入追加行
  （英文）——上轮死于模型错误、工作区可能有半成品；wasContinuation 时
  追加续用增量指令丢失的说明。
- `buildFailoverNotice({ kind, title, deadModel, code, nextModel, attempt,
  total })`：父会话一行通知文本（英文）。
- `extractFailureCode(error)`：从同步异常取 code（DSH error 对象 `.code`，
  string 或非对象返回 null——null 不触发转移，保守口径）。

### 2. 转移上下文注册表（adapter-dsh executor-failover.ts，新文件）

- 进程内 `Map<childId, FailoverContext>`；`FailoverContext` = { root,
  taskRelPath, kind, title, firstPrompt（首次派发的 params.prompt），
  continued（续用轮标记），chain（首次派发解析出的完整 fallback 链），
  attempt（当前跳序号），parent（exec.agent 引用），allowNames，hasLsp }。
- `registerFailoverContext(childId, ctx…)`：新派发成功且链非空时登记；
  链空（未配置/显式 model 参数）不登记——转移天然不发生。
- `markFailoverContinued(childId)`：续用轮投递成功后只把 continued 置真，
  firstPrompt 与 chain 保持首次派发值。
- 结算成功 / 链穷尽 / 转移完成后条目随 settle 消费删除（沿用
  pendingByChildId 的同生命周期纪律，注册表不无界增长）。
- 插件重启后注册表丢失：转移能力退化为现状回报 + WARNING（prd 已声明）。

### 3. 同步派发失败走链（adapter-dsh executor.ts 内）

- `startActivation` 调用包 try/catch：catch 到错误经 `extractFailureCode` +
  `isModelInaccessibleCode` 判定；命中且链非空时进入走链循环：
  按序取 fallback 条目组装 agentOptions（`splitProviderModel` + 有条目
  effort 才携带）重试 startActivation。
- 每个失败的同步尝试写一条 failed dispatches 记录（error 行 + 下一跳的
  `fallbackOf` 关联）；成功后走正常尾段，receipt 追加
  ` (failover attempt N: <model>)` 标注。
- 链穷尽：重抛最后一个错误（维持 fail loud），消息附完整尝试链。
- 白名单登记撤销（`releaseExecutorToolfaceChild`）在每跳失败路径照常执行。

### 4. 异步结算转移（adapter-dsh executor-settle.ts 改造 + executor-failover.ts 编排）

- `captureTurnEndError` 的登记表值从单行文本扩为 `{ line, code }`
  （`extractTurnErrorText` 拆出 `extractTurnError`，返回结构化 + 单行渲染）；
  结算写 error 行的现状不变，code 额外供分类。
- `subagent/end` 监听在 settle 完成后追加转移钩子（仍同步边界内发起、
  fire-and-forget 异步执行，内部全 try/catch 只 WARNING）：
  1. 条件：stopReason === 'error' && 捕获 code 命中白名单 && 注册表有
     该 childId 的转移上下文 && 链有剩余；
  2. 读取任务：readTask 失败/任务不存在 → WARNING 放弃（任务已归档等）；
  3. 容量闸：`collectRunningExecutors` + `evaluateCapacityGate` 重估；
     撞限 → 放弃转移，原 failed 记录不动，父会话通知说明容量闸拒绝、
     可人工重派；
  4. 重派：重建全量注入（composeLocalDirectivesText + buildFullInjection，
     prompt = firstPrompt + failoverNote），预分配 childId、登记白名单、
     startActivation（spawn / 同 label / maxDepth 1 / delivery 'parent'），
     信号用新 AbortController（原工具调用的 signal 已随调用结束失效）；
  5. 留痕：recordExecutorDispatch（modelSource 标 fallback、fallbackOf
     指上一跳、fallbackAttempt=N）→ trackDispatchSettle +
     registerFailoverContext（attempt+1、链余量）→ research 种类补
     registerResearchChildId；
  6. 通知：`ctx.sessionController.resolveAgent(parent 会话 id)` →
     `createUserMessage`（source kind 经 MessageSourceMap 模块增补声明
     `workloom`）→ `agent.followup` → `ctx.sessions.flush`；通知失败只
     WARNING，不阻断转移（通道实证：schedule 包 runtime.ts 同款路径）。
- 链穷尽（条件 1 中链无剩余）：调 `appendDispatchErrorSuffix` 把完整
  尝试链接进该 failed 记录的 error 行，并向父会话投递穷尽通知。
- 转移重派自身在 fire-and-forget 里同步遇白名单失败：在任务内继续走
  剩余链（与 §3 同一代码路径抽共用函数）；耗尽按上款处理。

### 5.  receipt 与工具描述

- `buildTurnReceiptText`：TurnMeta 增可选 failover 标注（同步走链成功时
  传入），渲染 ` (failover attempt N: <model>)`。
- `TOOL_DESCRIPTIONS.executor` 增一句：配置 fallback_models 的 kind 在模型
  不可访问时自动换模型新会话重试（英文，一句）。

### 6. spec 改写（.workloom/spec/repo/workflow/index.md）

- `transport-failover` 改写：自动转移已内置（配置 fallback_models 即启用）；
  人工探针流程降级为「未配置 fallback 或链穷尽」时的兜底。
- `effort-compat` 不动；fallback 条目 effort 语义已在设计回避该坑。

## 不做（非目标复述）

- adapter-pi parity（另立任务）。
- failover 粘性 / 任务级失效记忆。
- 同模型重试（DSH 内建重试已覆盖瞬时故障）。
- 主会话协议驱动的半自动方案（已被全自动决策取代）。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| 结算监听同步边界内异步重派失控 | fire-and-forget 全 try/catch 只 WARNING；注册表消费式删除防无界增长 |
| 父会话通知通道不可用（API 变更） | 通知失败只 WARNING；dispatches 链式留痕仍可查 |
| 重启后注册表丢失 | 退化为现状回报；文档与 WARNING 如实声明 |
| fallback 条目与主模型同值（配置气味） | 不过滤、如实尝试（显式链语义诚实）；重复检测只管链内 |
| `UNSUPPORTED_REASONING_EFFORT` 触发后 fallback 条目仍带非法 effort | 条目 effort 独立校验（assertEffort 同纪律）；缺省不传由模型默认档位兜底 |
