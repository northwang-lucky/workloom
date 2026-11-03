<!-- injection: tasks/11-03-full-task-case-coverage:mw04k72tlabs52l6 -->

# DSH 与 Pi 的 CASE 接入差异：代码事实报告

> 冲突说明（只记一次）：任务提示要求写到 `research/adapter-case-integration.md`，但执行契约把写权限限定在 `.workloom/` 内，故本报告落在 `.workloom/tasks/11-03-full-task-case-coverage/research/adapter-case-integration.md`（与 `.workloom/tasks/08-26-adapter-opencode/research/` 的既有约定一致）。
> 另一个事实：本任务仍处于 `planning`（`.workloom/tasks/11-03-full-task-case-coverage/task.json:6`），任务目录没有 `plan.md`。本报告以 `prd.md` 的 Goals/Requirements/Acceptance Criteria/Notes/Alignment Decisions 与父任务 `tasks/11-03-check-case-coverage/prd.md` 的两个固定模板为依据，未按 PLAN 分层阅读。
> 范围：只读调查。`packages/core`、`packages/adapter-dsh`、`packages/adapter-pi`、`packages/assets` 与相关测试；不改实现代码。

## 结论先行：CASE 复用 align 的整条链路，机制改动集中在 core 的门禁与投影文件

`workloom_task_align`（Phase 1.1 对齐）与待建的 `workloom_task_case`（CASE 审核/确认）结构完全同构：`surface.ts` 放文案 → 两个 adapter 只做注册与投影 → core 服务编排 review/confirm → `task-store` 窄写口落盘。差别只有一处：confirm 之后还要多一层「执行结果与会话链校验」，落在 check/archive 门禁。

| 关注点 | 现状锚点 | 对 CASE 的直接含义 |
| --- | --- | --- |
| 工具名/描述/参数文案 | `packages/core/src/surface.ts:28-39`、`:42-58`、`:65-81`、`:84-148` | 新增 `taskCase` 一字排开加四组常量，adapter 不改文案 |
| DSH 注册面 | `packages/adapter-dsh/src/tasks.ts:44-178` | 新增一个 `tools.register(...)` 与一套 tool 函数 |
| Pi 注册面 | `packages/adapter-pi/src/tasks.ts:93-176` | 新增 TypeBox schema + `pi.registerTool(...)` |
| review/confirm 服务 | `packages/core/src/service/alignment-service.ts:1-257` | 复制同一编排骨架，换内容校验器 |
| 窄写口 | `packages/core/src/domain/task-store.js:857-895` | confirm 只经此口改 `task.json`，失败零写入 |
| 门禁 | `packages/core/src/domain/task-gates.js:297-322`、`packages/core/src/domain/task-store.js:783-830`、`:1348-1372` | PLAN、CASE 确认、RESULT 校验都加在这里 |
| 会话记录 | `packages/core/src/domain/task-store.d.ts:97-155` | `dispatches[].childId`/`fallbackOf` 是唯一的会话链事实源 |
| 阶段 | `packages/core/src/domain/task-store.js:1275-1287` | 现有 `(current, kind)` 签名区分不了「CASE 设计」与「最终执行」 |

```jsonc
// packages/adapter-dsh/src/tasks.ts:112-121 —— CASE 工具照抄这段参数面
action: { type: 'string', enum: ['review', 'confirm'], description: PARAM_DESCRIPTIONS.action },
taskPath: { type: 'string', description: PARAM_DESCRIPTIONS.taskPath },
expectedPrdHash: { type: 'string', description: PARAM_DESCRIPTIONS.expectedPrdHash },
summary: { type: 'string', description: PARAM_DESCRIPTIONS.alignmentSummary },
```

## 符号与调用链速查：一次工具调用穿过四层，CASE 的每一层都有现成落点

```
主会话工具调用
  → adapter 注册的 execute（dsh: tools.register / pi: registerTool）
  → core service 编排（review/confirm 两态，同步）
  → task-store 窄写口（原子写 task.json）
  → task-gates 门禁求值（start / check / archive 读同一份记录）
```

| 符号 | 位置 | 谁调用它 |
| --- | --- | --- |
| `TOOL_NAMES` / `TOOL_SNIPPETS` / `PARAM_DESCRIPTIONS` | `packages/core/src/surface.ts:28`、`:65`、`:84` | 两个 adapter 的注册面与测试 |
| `registerTaskTools(ctx)` | `packages/adapter-dsh/src/tasks.ts:44` | `apply()`（`packages/adapter-dsh/src/plugin.ts:93-120`） |
| `registerTaskTools(pi)` | `packages/adapter-pi/src/tasks.ts:103` | Pi 工厂（`packages/adapter-pi/src/index.ts:29-42`） |
| `executeAlignTask` | `packages/core/src/service/alignment-service.ts:86` | 两个 adapter 的 align tool |
| `recordAlignmentCredential` | `packages/core/src/domain/task-store.js:857` | alignment-service 的 confirm 分支 |
| `evaluateStartGate` / `inspectPrdStructure` | `packages/core/src/domain/task-gates.js:297` / `:192` | `startTaskInternal` / review / confirm / doctor |
| `checkTask` / `archiveTask` | `packages/core/src/domain/task-store.js:765` / `:1333` | `service/task-ops.ts` 的 check / archive |
| `recordExecutorDispatch` / `settleExecutorDispatch` | `packages/core/src/domain/task-store.js:997` / `:1031` | 两个 adapter 的派发与结算通道 |
| `computeTaskStage` | `packages/core/src/domain/task-store.js:1275` | `recordExecutorDispatchInternal`（`:1012-1018`） |
| `buildExecutorPrompt` | `packages/core/src/domain/executor-context.js:388` | 两个 adapter 的注入组装 |
| `buildFullInjection` | `packages/adapter-dsh/src/executor-injection.ts:37` | DSH 新派发与 failover 重注 |
| `startDispatchWithFailover` / `runFallbackChain` | `packages/adapter-dsh/src/executor-failover.ts:155` / `packages/adapter-dsh/src/executor-failover-chain.ts:92` | DSH executor 新派发 |
| `locateContinueChildId` | `packages/adapter-dsh/src/executor-continuation.ts:139` / `packages/adapter-pi/src/executor-continuation.ts:65` | 两侧 continue_executor 分支 |
| `continueExecutor` | `packages/adapter-pi/src/executor-continuation.ts:178` | Pi executor 续用分支 |
| `cleanupSessionFiles` | `packages/adapter-pi/src/pi-child-registry.ts:336` | Pi archive 工具（`packages/adapter-pi/src/tasks.ts:296-300`） |

## 工具注册面已由 core surface 单一来源承载，双 adapter 只做宿主投影

`surface.ts` 是唯一的文案与命名来源，两个 adapter 逐字引用；CASE 工具必须按同一纪律加键，否则 `surface.test.js` 的键对齐断言会红。

- 工具名常量：`packages/core/src/surface.ts:28-39`（`taskAlign: 'workloom_task_align'` 在 `:35`），注释里的「十个工具」计数需改成十一。
- 注册描述：`packages/core/src/surface.ts:42-58`；`taskCheck` 的描述写死「2.2 check pass」(`:46-47`)，步骤重编号到 2.3 时必须同步改，且 `packages/core/test/surface.test.js:260-268` 正断言 `/2\.2 check pass/`。
- Pi 专属 `promptSnippet`：`packages/core/src/surface.ts:65-81`，`surface.test.js:51-58` 强制 `TOOL_SNIPPETS` 与 `TOOL_NAMES` 键集合一致。
- 参数描述：`packages/core/src/surface.ts:84-148`（`action`/`expectedPrdHash`/`alignmentSummary` 在 `:112-120`）；CASE 需要 `action`（review/confirm）、`taskPath`、`expectedCaseHash`、`summary` 四个键，不能复用 align 的键名（描述文案不同）。
- 错误前缀：`packages/core/src/surface.ts:150-156`（`taskTool: 'workloom task tool'`）。

DSH 侧注册与主会话限制（CASE confirm 是用户决定，必须同样限制）：

```ts
// packages/adapter-dsh/src/tasks.ts:270-278（align 的主会话限制，CASE 原样复制）
if (agent !== undefined) {
  const depth = delegationDepthOf(agent)
  if (depth > 0) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: workloom_task_align can only be called from the main session ` +
        '(alignment confirm is a user decision)',
    )
  }
}
```

- DSH 的 `align` 工具注册在 `packages/adapter-dsh/src/tasks.ts:106-126`，执行函数在 `:263-291`，同步调用 `executeAlignTask`。
- Pi 对应 schema 在 `packages/adapter-pi/src/tasks.ts:68-78`，注册在 `:134-145`，执行在 `:246-262`；Pi 侧没有深度检查，理由是 child pi 以 `--no-extensions` spawn，天然看不到 workloom 工具（`packages/adapter-pi/src/tasks.ts:140-141`）。
- 两个 adapter 的任务工具注释都写「六个任务管理工具」（`packages/adapter-dsh/src/tasks.ts:41`、`packages/adapter-pi/src/tasks.ts:100`），加 CASE 后是八个（含 align）。
- `surface.ts` 的十个工具名同时被 DSH 测试当作可见工具集（`packages/adapter-dsh/test/executor.test.js:126`、`:1195`、`:1299`），CASE 工具进枚举后这些用例仍自动覆盖，无需逐处改。

## service 投影以 alignment-service 为模板，confirm 的写盘必须走 task-store 窄写口

review 只读、confirm 全量前置校验后一次原子写盘、失败零写入——这套语义在 `alignment-service.ts` 已完整实现，CASE 直接复制骨架即可。

- 入参形状：`packages/core/src/service/alignment-service.ts:66-77`（`action`/`expectedPrdHash`/`summary`）。
- 入口把同步异常转成元组：`:86-96`（`executeAlignTask`）；内部先 `requireWorkloomCwd` → `resolveTaskRelPath` → `requireProjectRoot` → `readTask`：`:105-129`。
- review 返回快照 + hash + 结构问题 + blockers + `readyToConfirm`：`:132-156`；`readyToConfirm` 严格等于 `structureIssues.length === 0`（`:154`），这正是 R6 的返回形状模板。
- confirm 的校验顺序是硬约定，CASE 照搬：必填 hash → 内容 blocker 聚合（一次只抛一个 Error，消息按固定顺序列全部项）→ 重算 hash 比对 → summary 非空 → 窄写口：`:166-215`。
- hash 算法已经存在且正好符合 R7（CRLF/CR 归一为 LF 后 SHA-256）：`packages/core/src/domain/alignment.js:49-60`，`computePrdHash` 可直接复用到 `case.md`。

```js
// packages/core/src/domain/alignment.js:49-60
export function normalizePrdEol(content) {
  return content.replace(/\r\n|\r/g, '\n')
}
export function computePrdHash(content) {
  return createHash('sha256').update(normalizePrdEol(content), 'utf8').digest('hex')
}
```

- 窄写口模式：`packages/core/src/domain/task-store.js:857-895`（`recordAlignmentCredential` 外层元组、内层抛错），同 hash 幂等早退不刷新 `passedAt`（见 `task-store.d.ts:306-319` 的类型注释）。CASE confirm 应新增 `recordCaseConfirmation(root, taskRelPath, entry)`，而不是让 service 直接 `writeFileSync(task.json)`。
- 服务必须从 core 公共入口导出：`packages/core/src/index.ts:212`（`export { executeAlignTask } from './service/alignment-service.js'`），类型在 `:350` 附近；CASE 需要同样两行导出，adapter 才能 `import { executeCaseTask } from '@workloom-ai/core'`。

## start/check/archive 三个门禁都收在 core，PLAN 与 CASE 校验只能加在这里

adapter 层不做任何业务判断，三个工具的落地路径都是 `service/task-ops.ts` → `domain/task-store.js` → `domain/task-gates.js`；新增校验若写在 adapter 会绕不过直调路径。

- `start`：`packages/core/src/service/task-ops.ts:224-240` → `packages/core/src/domain/task-store.js:700-760`，门禁求值在 `packages/core/src/domain/task-gates.js:297-322`。
- `check`：`packages/core/src/service/task-ops.ts:277-294` → `packages/core/src/domain/task-store.js:783-830`。
- `archive`：`packages/core/src/service/task-ops.ts:409-430` → `packages/core/src/domain/task-store.js:1348-1372`。
- 门禁清单是「缺失项字符串数组」的统一形状，便于一次列全：`task-gates.js:297-322`。
- force 语义：`check`/`archive` 先 `assertTaskForceReason`（`packages/core/src/domain/config.js:1202-1209`），只对**确实会拦**的 gate 写 `makeOverride`（`task-gates.js:419-426`）。R21 的「不可 force 绕过」必须实现为**在 force 分支之外硬抛**：`task-store.js:796-812` 与 `:1354-1372` 的 `if (forced)` 结构决定了「先记 override 再放行」是现状，CASE 核心问题不能进这个分支。

```js
// packages/core/src/domain/task-store.js:796-812 —— 现状：force 只留痕就放行
if (collectCheckGateMissing(projectRoot, params.taskRelPath, task).length > 0) {
  task.overrides.push(makeOverride(GATES.CHECK, params.reason))
}
```

- PLAN 校验（R1）目前**完全不存在**：`task-gates.js` 里没有任何 `plan.md` 判定，`evaluateStartGate` 只查 prd/H1/小节/marker/alignment/jsonl（`task-gates.js:297-322`）。门的形状参照 `inspectPrdStructure`（`:192-224`）：一次返回全部结构问题。plan 的「现有编写要求」定义在 `packages/assets/skills/workloom-alignment/references/plan-authoring.md:7-14`（`## Steps`，每步含 Covers/Target/Edit/Verify）与 `packages/assets/workflow/workflow.md:62-70`（1.4 Authoring bar）。
- 父任务豁免（R1）需要「已声明子任务」判据：`task.children` 在 `task-store.js:249-283` 归一化（缺字段补 `[]`），父任务创建子任务时由 `linkChildToParent` 写回（`task-store.js:540-555`）。轻量豁免沿用 `task.mode === TASK_MODES.LIGHT`（`task-gates.js:301`）。

## CASE 设计派发与最终执行必须在 stage 上可区分，现有 `(current, kind)` 维度做不到

R3 的核心冲突就一句话：`recordExecutorDispatch` 无条件把 `kind === 'check'` 派发算成 `stage = check`（`packages/core/src/domain/task-store.js:1017` + `:1275-1287`），而 CASE 设计也是 `kind=check`。

```js
// packages/core/src/domain/task-store.js:1012-1018
task.dispatches.push(buildDispatchRecord(entry))
// 与 dispatches 同点更新 stage：research/review 保持，implement/frontend → implement，check → check。
task.stage = computeTaskStage(task.stage, entry.kind)
```

- 现状事实（PRD Notes 已点名，不能靠提示词规避）：任何 check 派发都会切 stage。
- 连带约束一：`doctor` 有「stage=check 时最近一条派发必须是 check」的审计规则（`packages/core/src/service/doctor-check-rules.ts:229-247`），设计派发若切 stage，随后一次 implement 派发会把 stage 拨回 implement，doctor 会报口径不一致。
- 连带约束二：**不能靠新增 kind 解决**。续用按同 kind 校验，跨 kind 直接拒绝（`packages/adapter-dsh/src/executor-continuation.ts:163-173`、`buildCrossKindReuseRejectText` 文案在 `packages/core/src/surface.ts:196-201`）。设计轮与最终执行轮必须是同 kind 才能续用同一 child。
- 新增 kind 的连带改动面（如果仍要新增）：`EXECUTOR_KINDS`（`packages/core/src/domain/executor-context.js:36-42`）、按 kind 的 jsonl 映射（`:55-62`）、kind 纪律段（`:253-310`）、`assertKind`（`:368-377`）、`KIND_LABELS` 两份重复定义（`packages/adapter-dsh/src/executor-injection.ts:14-20`、`packages/adapter-pi/src/pi-args.ts:22-28`）、容量闸 label 反解（`packages/adapter-dsh/src/executor-capacity.ts:150-160`）、Pi 五份 agent 定义（`packages/adapter-pi/src/agent-definitions.ts:31-90`）、`PARAM_DESCRIPTIONS.kind`（`packages/core/src/surface.ts:132`）与两 adapter 参数 schema。
- 建议（未实现，需实施方拍板）：不加 kind，加「派发角色」判定，输入取自 case 状态而非提示词。可选两种：
  - A. 显式字段：`recordExecutorDispatch` 入参加 `role?: 'case-design' | 'execution'`，`computeTaskStage(current, kind, role)` 三参；派发方按当前 `case.confirmed` 与当前 `case.md` 摘要是否匹配来选 role。落 `dispatches[].role` 可在 RESULT 校验时直接取。
  - B. 隐式推导：`recordExecutorDispatchInternal` 内读 `task.case` 与 `case.md` 当前 hash，未确认/摘要过期 → 视为设计轮、stage 保持；已确认且摘要一致 → `check`。不改工具参数面，但把文件 IO 塞进记录函数，且 review/confirm 前后时序更隐晦。
  - 推荐 A：与 R19「RESULT 记录实际执行会话」需要显式区分「设计会话」和「执行会话」同源，审计可查；B 需要每次派发重新读 `case.md`，失败路径更难测。

## 同 child 续用两侧都已实现，CASE 只需「记录设计 childId 并在执行轮复用它」

两侧的 durable 续用机制已经完整，缺的只是「把哪一个 childId 当设计会话」的持久化与定位规则。

- DSH：`continue_executor` 分支在 `packages/adapter-dsh/src/executor.ts:442-520`；投递是 `ctx.subagents.sendMessage(parent, SessionId(childId), ...)`（`:513`），同一 durable session 接收下一轮；跨进程恢复由 DSH 侧的 cold resume 承担（依赖文档 `packages/adapter-dsh/node_modules/@deepseek-ai/dsh-subagent/README.md:69`：`sendMessage` 可冷恢复直接子会话，前提是启用了持久化与 Session 查询）。
- DSH 续用轮的留痕：`executor.ts:640-676` 在续用与新建两条路径后都会执行 `recordExecutorDispatch`，因此同一 `childId` 会追加多条记录（`reused` 时 `modelSource: 'spawn'`）。
- 定位规则看 `packages/adapter-dsh/src/executor-continuation.ts:139-174`：`'latest'` 取同 kind 最近一条 childId（`:154-162`），显式 id 必须存在且 kind 一致（`:163-173`）。**`latest` 在最终执行轮之后会指向「执行轮」而不是「设计轮」**，所以 CASE 的设计会话 id 不能靠 `latest`，必须在首次 check 派发时写进 `task.json`（建议字段 `case.designSession`，写一次，续用不覆盖）。
- Pi：三分支投递在 `packages/adapter-pi/src/executor-continuation.ts:173-340`——存活 idle → `prompt`、存活 streaming → `steer`、不存活 → `pi --session <id>` 重启续接（`:263-290`）；`--session` 参数插入点 `packages/adapter-pi/src/pi-args.ts:78-90`；续用轮同样追加 `dispatches`（`executor-continuation.ts:376-395`）。
- Pi 侧续用的会话文件落在 `<root>/.workloom/sessions/pi/`（`packages/adapter-pi/src/pi-child-registry.ts:74-105`），archived 时按 `dispatches[].childId` 删除（`:328-360`，由 `packages/adapter-pi/src/tasks.ts:296-300` 调用）。含义：**证据与执行摘要必须落在 `case-evidence/`，不能只留在 child 会话文件里**，否则 Pi 归档后不可追溯。
- 设计会话的 id 从哪来：现有 `dispatches` 记录只有 `kind/at/title/childId/status/...`（`packages/core/src/domain/task-store.d.ts:97-155`），没有「角色」字段；所以上面 A 方案的 `role` 字段同时解决了「stage」和「设计会话识别」两件事。

## 自动 failover 只有 DSH 有完整链路，Pi 侧没有任何 fallbackOf 记录

R8 要求「新 child 重注完整上下文 + 记录 fallbackOf 链」，这条在本仓库只对 DSH 成立；Pi 目前连 `fallback_models` 都不消费。

- 同步走链（派发当下模型不可访问）：`packages/adapter-dsh/src/executor-failover.ts:155-260`，每次失败写一条 `status: 'failed'` 的 dispatches 记录并带 `fallbackOf: previousChildId`（`:240-258`）。
- 结算后异步转移：`executor-failover.ts:322-340` 注册钩子 → `:342-540` 重派；新 child 记录 `fallbackOf: previousChildId` 与 `fallbackAttempt`（`:518-530`）。
- 走链循环与链穷尽语义：`packages/adapter-dsh/src/executor-failover-chain.ts:92-123`；失败留痕统一函数 `:188-207`。
- 重注内容：`executor-failover.ts:447-460` 用 `buildFullInjection(root, taskRelPath, kind, firstPrompt + failoverNote, ...)`，即「PRD 全文 + plan 指针 + jsonl 指针 + research 指针 + Task prompt」的整包，**不含 `case.md`**（注入结构见下节）。所以 R8 的「重注当前 CASE」需要额外处理。
- `fallbackOf`/`fallbackAttempt` 的入参校验在 core：`packages/core/src/domain/task-store.js:1221-1237`（非空 string、整数 ≥ 2），落盘在 `:1259-1260`。
- Pi：全仓储 grep `fallbackOf|fallback_models` 在 `packages/adapter-pi/src` 只命中「来源标注字面量 `'fallback'`」（`packages/adapter-pi/src/executor.ts:146-147`、`executor-continuation.ts:153-154`），没有任何转移链实现；`resolveSubagentDefaults` 虽返回 `fallbackModels`（`packages/core/src/domain/config.js:966-1015`），但全仓储唯一的消费点是 DSH `packages/adapter-dsh/src/executor.ts:551`，Pi 从不读取。Pi 的「重启续用」是 `--session`，不是换模型新 child。

```ts
// packages/adapter-dsh/src/executor-failover.ts:518-530
const [recordErr] = recordExecutorDispatch(context.root, context.taskRelPath, {
  kind: context.kind,
  title: context.title,
  childId: outcome.result.childId,
  toolsAllow: [...context.allowNames],
  model: outcome.model,
  modelSource: DISPATCH_MODEL_SOURCES.FALLBACK,
  fallbackOf: previousChildId,
  fallbackAttempt: outcome.attempt,
})
```

结论：R19 的「不同执行会话必须有 fallbackOf 链」在 DSH 可校验，在 Pi 恒不成立（Pi 换 child 只有崩溃重启路径，见 `packages/adapter-pi/src/executor-continuation.ts:263-306` 的 `get_state` 失败回退）。这是需要拍板的口径缺口，不是实现细节（见最后「待决问题」）。

## CASE 内容要进 check 执行器的上下文，注入点在 core 的 `buildExecutorPrompt`

check 执行器首轮 prompt 由 core 组装，`prd.md` 全文内联，`plan.md` 只有指针行；`case.md` 目前完全不在注入链里。

```js
// packages/core/src/domain/executor-context.js:421-455（节选）
// check/research/review 物化 prd 全文节块（验收基线/问题框架/审查对象，职责必需）；
if (params.kind === EXECUTOR_KINDS.check || ...) { ... }
// Pointer list（research 无此段）：首行固定 plan.md 纯指针行（文件缺失不出行）
if (params.kind !== EXECUTOR_KINDS.research) {
  const pointerLines = ARTIFACT_POINTER_FILES.filter(...)
```

- 物化文件常量：`packages/core/src/domain/executor-context.js:48`（`PRD_ARTIFACT`）与 `:51`（`ARTIFACT_POINTER_FILES = ['plan.md']`）；prd 全文块读取在 `:530-532`。
- 因此设计轮（同一 child）里 CASE 内容天然在上下文里；**异步 failover 的新 child 与进程冷恢复后的续用轮都不会自动拿到 `case.md` 内容**。两种补法：
  - S1（推荐）：给 check kind 加 `case.md` 全文块（有该文件才物化，位置紧跟 prd 块），并计入 `stats.inlined/bytes`；测试在 `packages/core/test/executor-context.test.js` 的 S2 用例（`:114` 起）扩展。
  - S2：只在 Pointer list 加一行 `case.md` 指针，让执行器自己读。成本低，但「确认后的 CASE 是验收基线」这种关键输入不该依赖模型自觉读取，且 failover 场景最容易漏读。
- 关联已有断言：`packages/core/test/executor-context.test.js:1136` 有「段落白名单与顺序」用例，新增段落必须同步该用例的白名单；两个 adapter 的注入快照测试（`packages/adapter-dsh/test/inject.test.js`、`packages/adapter-pi/test/inject.test.ts`）只覆盖会话上下文，不受影响。

## RESULT 的 checkSession 校验落在 check/archive 门禁，链数据只能来自 `dispatches`

`case-result.md` 的 `checkSession`、`caseHash`、状态矩阵目前没有任何解析器；可复用的只有 YAML 解析与「问题数组」门禁形状。

- YAML front-matter 解析先例：`packages/core/src/domain/workflow-contract.js:1-30` 与 `:73-120`（`yaml` 已是 core 依赖，见 `packages/core/package.json:24`）。
- 会话链事实源：`packages/core/src/domain/task-store.d.ts:97-155`（`childId`/`status`/`fallbackOf`/`fallbackAttempt`）。校验规则可纯函数化：`checkSession` 要么等于 `case.designSession`，要么存在从 `case.designSession` 出发、沿 `fallbackOf` 回溯到 `checkSession` 的链（`dispatches` 只追加条目，settle 仅回填 status/error，见 `task-store.js:1012-1018` 与 `:1031-1070`）。
- 校验落点：`check` 在 `packages/core/src/domain/task-store.js:783-830`（写 `task.check` 之前），`archive` 在 `:1348-1372`（`task.check === null` 判定旁）。两处都要新增「CASE 身份 + RESULT + 覆盖率 + Open issues」四类判定，且核心问题在 force 分支外硬抛（见前文）。
- RESULT 的逐项状态语义（blocked 后续 pending、整体 failed）应做纯函数：参照 `inspectPrdStructure` 的 `{code,message}` 数组形状（`packages/core/src/domain/task-gates.js:192-224`），便于 review/check/archive 三处复用同一分类器。
- 覆盖率三态与证据路径存在性校验属于文件系统 IO，放 `task-store`/新 service 而非 `task-gates`（后者原则上是纯求值 + 读文件，见 `task-gates.js:12` 的分层注释）。
- 证据目录不存在、路径越界（`..`）、路径指向任务目录外的情况必须显式拒绝：现有路径逃逸防护先例在 `packages/core/src/domain/executor-context.js:736-748`（越界条目返回 null 跳过）与 `packages/adapter-pi/assets/write-scope.ts:31-35`。

## 测试面固定：core 六类测试 + 双 adapter 工具与派发测试，dist 必须同 commit 重建

新增 CASE 的测试不是「加几个用例」，而是要在既有断言处同步改口径；漏改会直接红。

| 测试文件 | 现状作用 | CASE 需要新增/修改 |
| --- | --- | --- |
| `packages/core/test/task-ops.test.js` | `executeAlignTask` review/confirm 全链（`:375-625`） | 新增 `executeCaseTask` 同构用例：模板通过、各类缺失逐项报、hash 失配拒绝、幂等 |
| `packages/core/test/task-store.test.js` | `computeTaskStage` 五 kind 映射（`:1307-1360`）、dispatch 落记录（`:1894` 起） | 设计轮不切 stage、执行轮切、role/设计会话落盘、fallbackOf 链 |
| `packages/core/test/task-gates.test.js` | 各门禁求值 | PLAN 缺失/父任务豁免/轻量豁免；CASE 未确认/过期；覆盖率三态；force 不放行 |
| `packages/core/test/contract-asset.test.js` | 步骤 id 精确列表断言 `['1.0','1.1','1.2','1.3','1.4','2.1','2.2','2.3','3.1']`（`:314-316`）、版本一致断言（`:50` 等）与 v17/2.2 系列文案断言 | 步骤列表改为含 `2.2`/`2.3`/`2.4` 的新集合；2.2 文案断言迁到新编号；新增 Design CASE 正文断言 |
| `packages/core/test/surface.test.js` | 名称唯一（`:28-36`）、snippet 键对齐（`:51-58`）、`2.2 check pass`（`:260-268`） | 加 `taskCase` 键；`taskCheck` 描述改 2.3 后同步断言 |
| `packages/core/test/protocol.test.js` + `packages/core/src/domain/protocol.js:16` | `WORKFLOW_PROTOCOL_VERSION = 24` 与资产 version 相等 | 升到 25，`packages/assets/workflow/workflow.md:2` 同步 |
| `packages/core/test/dist-dts.test.js` | `src/domain/*.d.ts` 与 `dist/domain/` 字节一致 | task.json 新字段的 d.ts 锚点必须在 `src` 手写并重建 |
| `packages/adapter-dsh/test/tasks.test.js` | 工具 schema 与主会话限制（`:1-175`，align 用例 `:79-116`） | CASE 工具 schema、action 枚举、深度限制、review/confirm 投影 |
| `packages/adapter-pi/test/tasks.test.ts` | 同上（Pi 无深度检查） | CASE 工具 schema 与投影；归档清理与 childId 提取不回归 |
| `packages/adapter-dsh/test/executor.test.js`（4071 行） | 续用（`:412`、`:577-723`）、failover 同步/异步（`:3019-3300`） | 设计轮派遣的 role/stage 不变量、final 轮续用同一 childId、failover 后 `fallbackOf` 链 |
| `packages/adapter-pi/test/executor-continuation.test.ts` | 三分支续用（`:173-307`） | 设计轮与执行轮同 childId；重启续接保持 id |
| `packages/adapter-pi/test/executor.test.ts` | 派发记录字段（`:309-365`） | role 与 stage 记录一致 |

- 构建与部署纪律（实测来源）：`core` 与 `adapter-dsh` 的 `dist/` 必须与 src 同一个 commit 重建并提交，`core` 的 build 还会把 `src/domain/*.d.ts` 覆盖进 `dist/domain/`（`.workloom/spec/repo/deployment/index.md:6-8`；`packages/core/package.json:19-21`）。`adapter-pi` 的 `build` 只同步 skills（`packages/adapter-pi/package.json:17-19`），无 dist 产物。
- 版本握手：两个 adapter 在注册任何工具前校验资产版本（`packages/adapter-dsh/src/plugin.ts:93-95`、`packages/adapter-pi/src/index.ts:29-34`），版本不一致会在激活时 fail loud，因此流程资产改版与 `WORKFLOW_PROTOCOL_VERSION` 必须同批交付。
- test-first 落点（PRD 已规定）：先让 `task-gates.test.js`、`task-ops.test.js`、`task-store.test.js`、`executor.test.js`、两侧 `tasks.test.*` 红，再实现；`packages/core/test/workflow-service.test.js:371-431` 有 breadcrumb 步骤投影快照（`['1.0','1.1','2.1','2.2','2.3','3.1']` 等），步骤重编号后必须同步，否则失败在「与 CASE 无关」的快照上。

## 待决问题：四项需要主会话/用户拍板，其余可按下述事实落地

1. Pi 的 failover 口径（阻塞 R19 的双 adapter 一致）：Pi 无 `fallback_models` 消费、无 `fallbackOf` 记录（`packages/adapter-pi/src/executor.ts:344-550` 无相关分支）。要么本期只对 DSH 校验链，要么为 Pi 补一条与 DSH 对等的转移机制（工作量不小，涉及 Pi RPC 重启与容量闸）。当前代码事实无法两全。
2. 设计会话 id 的落盘方式：建议 `task.json.case.designSession`（首次 check 派发时写一次）。若改为「RESULT 里声明设计会话」，就失去「机制记录」而变成自述，与 R19 的校验意图冲突。另需确认 `case.required` 与 lifecycle 状态字段形状（R16/R17 只说 `case.required=true`，未定义 `case` 对象其余键）。
3. `case.md` 的注入策略（S1 全文块 vs S2 指针行）。S1 会改变 check 执行器注入体积与 `executor-context` 段落白名单测试；S2 成本低但 failover/冷恢复下容易漏读。建议 S1，需用户确认体积影响可接受。
4. 未验证项：`packages/adapter-dsh/node_modules/@deepseek-ai/dsh-subagent/README.md` 属于依赖文档、不在仓库跟踪范围内，冷恢复行为以本机安装版本（`@deepseek-ai/dsh-subagent` devDependency `0.2.1-rc.2`，`packages/adapter-dsh/package.json:52`）为准；升级 DSH 后需复核。
