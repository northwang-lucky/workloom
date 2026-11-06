tasks/11-06-simplify-document-confirmations:mw479qqvkk5lo5f8

# core 确认流程调研：PRD / PLAN / CASE 内容确认与哈希解耦的改造面

调研任务：`tasks/11-06-simplify-document-confirmations`（子任务 1）。只读调研，不修改实现代码。本任务当前处于 `planning` 且尚无 `plan.md`（research 派发早于 PLAN 编写，正好符合 R3 的新顺序），因此以 `prd.md` 与实际源码为准，没有可加载的 plan artifact。

> 范围：`packages/core` 的确认流程、任务记录、启动/检查/归档限制、CASE 执行与旧结果复用。`packages/assets` 与两个 adapter 只列必须同步修改的接缝，正文改造属于「资产与 adapter」那条姊妹调研任务。
> 证据口径：结论均以 `path:line` 标注（相对仓库根）；标注「建议」的段落是未实现的方案建议，不是现状。

## 现状总览：确认与授权由 task.json 的三个记录加两处文档哈希共同驱动

| 机制 | 记录字段与写入方 | 门禁读取点 | 锚点 |
| --- | --- | --- | --- |
| PRD 内容确认 | `task.json.alignment = {passedAt, summary, prdHash}`，由 `workloom_task_align action=confirm` 写入 | start 门禁比对 `prdHash`；`in_progress` 任务的 stale 门禁再比对一次 | `packages/core/src/domain/task-store.d.ts:50-57`、`packages/core/src/domain/task-store.js:905-955` |
| PLAN | 没有确认记录，只有结构校验（H1、`## Steps`、步骤四要素、AC 覆盖） | start 门禁 | `packages/core/src/domain/task-gates.js:331-376` |
| CASE 设计/确认 | `task.json.case = {required, designSession, confirmedAt, caseHash, summary, result}`，confirm 由 `workloom_task_case` 写入 | `workloom_execute purpose=execution` 前置、check 的 RESULT 校验、archive | `packages/core/src/domain/case.d.ts:21-28`、`packages/core/src/domain/task-store.js:964-990` |
| CASE 执行结果 | `task.case.result = {caseHash, resultHash, passedAt}`，由 `workloom_task_check` 写入 | archive 的 `requireResultRecord` | `packages/core/src/domain/task-store.js:856-872`、`packages/core/src/domain/case.js:710-718` |
| 确认失效判定 | 两处全文 SHA-256：PRD 用 `computePrdHash`，CASE/RESULT 用 `computeCaseHash`，同一归一化规则 | stale 门禁、执行前置、结果复用 | `packages/core/src/domain/alignment.js:58-78`、`packages/core/src/domain/case.js:72-74` |

结论：R2/R4/R8 要删的不是一个参数，而是「文档哈希是确认有效性的唯一凭据」这条设计链；删除后每个门禁都必须换成非哈希判据（记录是否存在、文档结构是否成立、会话链是否成立）。

## PRD 确认链：哈希只负责判定「确认是否失效」，删除后 start 门禁退化为「凭据存在即通过」

`evaluateAlignmentGate` 是唯一把凭据与当前文档绑定的地方：

```js
// packages/core/src/domain/alignment.js:109-115
export function evaluateAlignmentGate(status, alignment, currentPrdHash) {
  if (!GATED_STATUSES.has(status)) return []
  if (alignment === null) {
    return status === PLANNING_STATUS ? [ALIGNMENT_MISSING] : []
  }
  return alignment.prdHash === currentPrdHash ? [] : [ALIGNMENT_STALE]
}
```

| 符号 | 当前位置 | 当前行为 | 需要调整 | 相关测试 |
| --- | --- | --- | --- | --- |
| `normalizeContentEol` / `computeContentHash` / `normalizePrdEol` / `computePrdHash` | `packages/core/src/domain/alignment.js:49-78` | PRD 与 CASE 共用的 SHA-256 工具，行尾 CRLF/CR 归一为 LF | 全部删除；`case.js:9` 对 `computeContentHash` 的唯一引用随之消失 | `packages/core/test/alignment.test.js:43-72` |
| `evaluateAlignmentGate(status, alignment, currentPrdHash)` | `packages/core/src/domain/alignment.js:109-115` | planning 无凭据拦截、hash 失配判 stale；in_progress 无凭据放行 | 签名去掉 `currentPrdHash`，判据改为「凭据为 null 才拦截」；stale 分支整体删除 | `packages/core/test/alignment.test.js:90-129` |
| `ALIGNMENT_STALE` 文案 | `packages/core/src/domain/alignment.js:40-42` | 指引重新 confirm | 删除；`ALIGNMENT_MISSING` 文案改为「内容尚未确认」口径，不再暗示哈希 | `packages/core/test/task-gates.test.js:471-525` |
| `executeAlignTask` review | `packages/core/src/service/alignment-service.ts:132-154` | 返回 `prd` 全文 + `prdHash` + 结构问题 + 现有凭据 | 删除 `prdHash` 字段；保留 `prd` 快照（用户确认的是内容）与 `readyToConfirm` | `packages/core/test/task-ops.test.js:392-510` |
| `executeAlignTask` confirm | `packages/core/src/service/alignment-service.ts:166-219` | 强制 `expectedPrdHash`，重算比对，失配拒绝；同 hash 幂等早退 | 删除 `expectedPrdHash` 参数与比对；只保留「结构 blocker → summary 非空 → 写 {passedAt, summary}」；幂等语义消失（见下文） | `packages/core/test/task-ops.test.js:530-632` |
| `recordAlignmentCredential` | `packages/core/src/domain/task-store.js:905-955` | 校验 summary/prdHash 非空；相同 prdHash 早退不刷新 passedAt | 入参只剩 `summary`；删除 hash 校验与幂等分支；每次确认都覆盖 `passedAt` | `packages/core/test/task-store.test.js:1642-1736` |
| `TaskAlignmentRecord` | `packages/core/src/domain/task-store.d.ts:50-57` | `passedAt` + `summary` + `prdHash` | 删除 `prdHash` 字段与注释里的 SHA-256 说明；`AlignmentCredentialInput` 同步收窄 | `packages/core/test/dist-dts.test.js:19-27`（手写 d.ts 与 dist 副本必须逐字一致） |

关键代码（confirm 的哈希分支，需整段删除）：

```ts
// packages/core/src/service/alignment-service.ts:191-198
const prdHash = computePrdHash(prd)
if (params.expectedPrdHash !== prdHash) {
  throw new Error(
    `${ERR_PREFIX.taskTool}: confirm rejected: prd hash mismatch ` +
      `(expected ${String(params.expectedPrdHash)} but current prd.md hashes to ${prdHash}); ` +
      're-run action=review to refresh the snapshot before confirming',
  )
}
```

需要注意的语义变化（建议）：去掉 hash 后无法再判断「同一内容重复确认」，`recordAlignmentCredential` 的早退分支必须删掉；此后 `passedAt` 的含义从「首次确认时间」变成「最近一次记录的内容确认时间」。建议在类型注释与 skill 文案里同步说明，避免审计时误读。

## 启动限制：PLAN 目前只有结构校验，没有任何「内容确认」记录可挂，这是本次唯一的新增门禁点

```js
// packages/core/src/domain/task-gates.js:298-329（节选）
export function evaluateStartGate(root, taskRelPath, task) {
  ...
  } else {
    missing.push(...inspectPrdStructure(prd).map((issue) => issue.message))
    // PLAN 门禁：完整实施任务必须有结构完整的 plan.md（父任务豁免……）
    if (!Array.isArray(task?.children) || task.children.length === 0) {
      const plan = readIfExists(join(taskDir, GATE_FILES.plan))
      missing.push(...inspectPlanStructure(plan, prd).map((issue) => issue.message))
    }
    // alignment 门禁：planning 必须有凭据且 hash 与当前 prd 一致……
    missing.push(...evaluateAlignmentGate(task?.status ?? 'planning', task?.alignment ?? null, computePrdHash(prd)))
  }
  ...
}
```

| 项 | 当前位置 | 当前行为 | 需要调整 | 相关测试 |
| --- | --- | --- | --- | --- |
| prd 结构检查 | `packages/core/src/domain/task-gates.js:303-310` | H1 + 四小节 + open-nodes 全过才放行 | 保持不变（内容确认的前提） | `packages/core/test/task-gates.test.js:444-459` |
| PLAN 结构检查 | `packages/core/src/domain/task-gates.js:311-316`、`346-376` | 非容器任务必须有 `plan.md` 且步骤四要素齐全、PRD 的每个 AC 至少被 Covers 一次 | 保留，并在其后追加「PLAN 内容已确认」判据 | `packages/core/test/case.test.js:306-320`、`packages/core/test/task-store.test.js:784-812` |
| 容器任务豁免 | `packages/core/src/domain/task-gates.js:313` | `children` 非空时不校验自身 PLAN | 豁免要同时覆盖「PLAN 确认」判据，否则容器任务被新门禁拦死 | `packages/core/test/case.test.js:306-320` |
| 轻量任务分支 | `packages/core/src/domain/task-gates.js:306-307`、`397-405` | 只要求 H1 + Goal，跳过 marker、凭据、双 jsonl | 保持豁免（见开放问题 2） | `packages/core/test/task-gates.test.js:382-438` |
| PRD 确认判据 | `packages/core/src/domain/task-gates.js:317-319` | 凭据 hash 与当前 prd 一致 | 改为「凭据存在」；stale 分支删除 | `packages/core/test/task-store.test.js:939-981` |

启动限制的现状补注：`startTask` 只在 `evaluateStartGate` 返回缺失项时拦截，force 路径同样调用该函数再按实际拦截项留痕（`packages/core/src/domain/task-store.js:719-745`）。因此**新门禁只需加进 `evaluateStartGate`**，start 服务与 force 审计无需改动。

还有一处现存矛盾需要在本次一并裁决：workflow 1.1 允许用户在最终一轮选择「B. author neither」（`packages/assets/workflow/workflow.md:41`），但 start 门禁对非容器完整任务无条件要求 `plan.md`（`packages/core/src/domain/task-gates.js:311-316`）。R7 明确「完整实现任务仍编写 PLAN」，建议删除「author neither」选项并让 PLAN 确认对完整任务无条件必需；否则 PLAN 确认只能做成条件门禁，无法满足 AC2。

## 检查与归档限制：stale 对齐是哈希的第二个读取点，删除它会同时简化两处 force 审计

| 符号 | 当前位置 | 当前行为 | 需要调整 | 相关测试 |
| --- | --- | --- | --- | --- |
| `evaluateStaleAlignmentGate` | `packages/core/src/domain/task-gates.js:280-286` | 仅 `in_progress` 且有凭据时读当前 prd 算 hash，失配返回 stale 缺失项 | 整个函数删除 | `packages/core/test/task-gates.test.js:471-525` |
| `checkTaskInternal` stale 分支 | `packages/core/src/domain/task-store.js:845-855` | stale 时拒绝写 check，force 记一条 `stale_alignment` 覆盖 | 删除该分支与 `STALE_ALIGN` 覆盖 | `packages/core/test/task-store.test.js:1767-1830` |
| `archiveTaskInternal` stale 分支 | `packages/core/src/domain/task-store.js:1495-1503` | 归档前同样拦 stale，force 单独留痕 | 删除该分支 | `packages/core/test/task-store.test.js:1835-1870` |
| `GATES.STALE_ALIGN` / `GATE_TOOLS.stale_alignment` | `packages/core/src/domain/task-gates.js:47-48`、`64-65`、`packages/core/src/domain/task-gates.d.ts:11` | 门禁枚举与工具映射各一项 | 删除枚举值与映射；`overrides` 历史数据里的旧值保持可读（类型面可放宽为历史值） | `packages/core/test/task-store.test.js:1828-1870` |
| adapter 派发前的 stale 拦截 | `packages/adapter-dsh/src/executor.ts:307-345` | 新派发与续用前调用 `evaluateStaleAlignmentGate`，force 记 `stale_alignment` | core 导出删除后 adapter 必须同步删除该段（属姊妹任务） | `packages/adapter-dsh/test/*.test.js`、`packages/adapter-pi/test/*.test.ts` |

不变的部分：check 的 CASE 硬门禁（`packages/core/src/domain/task-store.js:821-827`）与 archive 的 CASE 硬门禁（`packages/core/src/domain/task-store.js:1472-1479`）都不可 force，本次只删除其中依赖 `caseHash` 的判据，不放松 RESULT 的实质校验。

## CASE 生命周期：确认凭证、执行前置、结果记录、旧结果复用四处互锁，需统一拆成「文档存在 + 会话链 + 实际 RESULT」

记录结构与写入路径：

```ts
// packages/core/src/domain/case.d.ts:15-28
export interface TaskCaseResultRecord {
  caseHash: string
  resultHash: string
  passedAt: string
}
export interface TaskCaseRecord {
  required: boolean
  designSession: string | null
  confirmedAt: string | null
  caseHash: string | null
  summary: string | null
  result: TaskCaseResultRecord | null
}
```

| 符号 | 当前位置 | 当前行为 | 需要调整 | 相关测试 |
| --- | --- | --- | --- | --- |
| `createCaseRecord` | `packages/core/src/domain/case.js:56-65` | 保留 `confirmedAt/caseHash/summary/result` 默认键 | 只保留 `required` + `designSession`（若 `result` 一并删除，见开放问题 1） | `packages/core/test/case.test.js:321-336` |
| `recordCaseConfirmation` | `packages/core/src/domain/task-store.js:964-990` | 校验 summary/caseHash；同 hash 幂等；写 `confirmedAt/caseHash/summary` 并清空 result | 整体删除（R4：不新增复核凭证） | `packages/core/test/case.test.js:435-461` |
| `executeTaskCase` confirm | `packages/core/src/service/case-service.ts:95-134` | 强制 `expectedCaseHash`，比对后写确认 | 删除 confirm 动作与 `expectedCaseHash`；工具退化为 review-only（建议） | `packages/core/test/case.test.js:435-461` |
| `evaluateCaseExecutionGate` | `packages/core/src/domain/case.js:470-484` | 要求 case.md 存在、`caseHash` 非空且等于当前文档哈希、`designSession` 非空 | 只保留「case.md 存在 + designSession 非空」；哈希两分支删除 | `packages/core/test/case.test.js:321-336`、`packages/core/test/executor-context.test.js:1480-1545` |
| `buildExecutorIncrementalPrompt` | `packages/core/src/domain/executor-context.js:505-518` | execution 轮先校验执行前置，再在增量里追加 `Confirmed CASE hash: <hash>` | 保留前置校验（判据简化），删除追加哈希行 | `packages/core/test/executor-context.test.js:1480-1545` |
| `inlineCurrentCase` | `packages/core/src/domain/executor-context.js:530-543` | execution 轮校验前置并全量注入 case.md | 保留注入与预算检查，校验判据随执行前置简化 | `packages/core/test/executor-context.test.js:1425-1478` |
| RESULT 的 `caseHash` 关联 | `packages/core/src/domain/case.js:631` | `meta.caseHash !== task.case.caseHash` → `result_hash` | 删除该判据；`packages/assets/templates/case-result.md:4` 的 `caseHash:` 前导字段同步删除（资产任务） | `packages/core/test/case.test.js:359-377` |
| `requireResultRecord` 记录校验 | `packages/core/src/domain/case.js:710-718` | 要求 `task.case.result` 存在且 caseHash/resultHash 与当前文档一致 | 删除两处哈希比对；建议整段 `requireResultRecord` 与 `case.result` 一起删除（R8 旧结果复用），archive 只对实际文档做实质校验 | `packages/core/test/case.test.js:359-377` |
| 执行会话链 | `packages/core/src/domain/case.js:518-532`、`636-638` | `checkSession` 必须等于 designSession 或经 `fallbackOf` 可达 | 保留（R8 明确要求「当前设计与执行会话链」） | `packages/core/test/case.test.js:359-377` |
| check 写入 result 记录 | `packages/core/src/domain/task-store.js:856-872` | 写 `{caseHash, resultHash, passedAt}` | 随 `case.result` 删除一并移除（若保留 result，则只删哈希字段） | `packages/core/test/case.test.js:359-377` |
| archive 的 result 要求 | `packages/core/src/domain/task-store.js:1472-1479` | `requireResultRecord: true` | 传参删除，随函数选项一起移除 | `packages/core/test/case.test.js:413-434` |

需要注意的核心事实：CASE 的「主会话复核后直接执行」在现有代码里**没有任何独立凭证**，执行放行只看 `evaluateCaseExecutionGate`；因此 R4/R8 的改造点就是把这个函数的哈希判据删掉，并让 `workloom_execute purpose=execution` 自然放行同一 `designSession` 的续用。这也解释了为什么 AC3 可以在「不新增用户确认消息、不写凭证」的前提下通过。

还有一个跨包依赖会立刻断：CASE 复用规则与 `computeCaseHash` 的公开导出绑定在 `packages/assets/skills/workloom-case-active/SKILL.md:27`（直接在命令行 import `@workloom-ai/core` 的 `computeCaseHash`）。core 删除该导出时必须与资产任务同一批提交，否则 skill 里的命令直接报错。

## 工具面与导出面：参数文案、公开导出、手写 d.ts 三处必须同步，漏一处 core 构建测试就失败

| 位置 | 当前行为 | 需要调整 | 相关测试 |
| --- | --- | --- | --- |
| `packages/core/src/surface.ts:45-52` | taskStart 文案写「alignment credential matching the current prd」；taskAlign/taskCase 写 review 返回 hash、confirm 校验 expected hash | 改为内容确认口径；taskCase 改为 review-only | `packages/core/test/surface.test.js:254-289` |
| `packages/core/src/surface.ts:71-77` | 三个工具的签名速览含 `expectedPrdHash?` / `expectedCaseHash?` | 删除哈希参数；新增 PLAN 确认入口的参数（建议 `target`） | 同上 |
| `packages/core/src/surface.ts:118-134` | `action` / `expectedPrdHash` / `expectedCaseHash` / `caseSummary` 四条参数文案 | 删除哈希参数文案；`alignmentSummary` 复用为 PRD 与 PLAN 的确认摘要 | 同上 |
| `packages/core/src/index.ts:82-113` | 公开导出 `computeContentHash`、`computePrdHash`、`normalizeContentEol`、`normalizePrdEol`、`computeCaseHash`、`ALIGNMENT_STALE` | 删除上述导出；新增 `recordPlanConfirmation` 与相关类型导出 | `packages/core/test/dist-dts.test.js:19-27` |
| `packages/core/src/domain/task-store.d.ts:169-180`、`220-226`、`342-354` | `CaseConfirmationInput`、`case` 生命周期注释、alignment 写口注释都含 hash | 同步收窄类型与注释 | 同上 |

补充：`packages/core/scripts/copy-domain-dts.mjs` 会把手写 `src/domain/*.d.ts` 覆盖进 `dist/`，并校验生成版导出名是手写版的子集；删导出时三处（JS 实现、手写 d.ts、`dist/` 重建）必须一次改完，`pnpm --filter @workloom-ai/core build && node --test test/*.test.js` 才能全绿。

## PLAN 内容确认的接入建议：在 task.json 增独立的 PLAN 确认记录，由 align 工具按 target 写入，start 同时要求 PRD 与 PLAN 两份确认

以下为**建议方案（未实现）**，目的是给实现者一条可直接执行的路径；每条都标出它替换掉的现状锚点。

### 数据模型：新增 `planConfirmation`，与 `alignment` 同构，只保留时间与摘要

```ts
// 建议：packages/core/src/domain/task-store.d.ts
export interface TaskAlignmentRecord {
  /** 用户明确确认 PRD 内容的时间（无哈希；重复确认刷新为最近一次）。 */
  passedAt: string
  /** 确认摘要（覆盖节点、关键决策与确认结果）。 */
  summary: string
}

export interface TaskPlanConfirmationRecord {
  /** 用户明确确认 PLAN 内容的时间。 */
  passedAt: string
  /** PLAN 摘要（覆盖的 AC、关键步骤与复核结论）。 */
  summary: string
}
```

`TaskRecord` 增加一个与 `alignment` 并列的字段（`packages/core/src/domain/task-store.d.ts:220-226` 附近）：

```ts
  /** PRD 内容确认：PRD 定稿后、后续调研与 PLAN 编写前写入（R3）。 */
  alignment: TaskAlignmentRecord | null
  /** PLAN 内容确认：PLAN 复核通过后、start 之前写入（R3/R7）。 */
  planConfirmation: TaskPlanConfirmationRecord | null
```

备选方案与取舍（建议选 A）：

| 方案 | 形态 | 取舍 |
| --- | --- | --- |
| A（推荐） | `alignment` 保持 PRD 语义 + 新增 `planConfirmation` | 改动集中、旧任务读取天然兼容；字段名略不对称 |
| B | 统一为 `confirmations: {prd, plan}` | 语义更整齐，但旧 `alignment` 需要读取映射与写回迁移，波及 doctor 写回与多份测试夹具 |
| C | 在 plan.md 里写 `<!-- workloom:plan-confirmed=... -->` 标记 | 确认写进文档正文，改文档就等于改确认，与 R2「记录只保留时间与摘要」冲突；否决 |
| D | 复用 `alignment` 加 `target` 字段 | 一个槽位存不下两份确认；否决 |

### 写入路径：扩展 `workloom_task_align` 的 `target`，顺序约束在服务层硬校验

```ts
// 建议：packages/core/src/service/alignment-service.ts
export interface ExecuteAlignTaskParams {
  taskPath?: string
  /** 确认对象：prd（缺省，兼容旧调用）或 plan。 */
  target?: 'prd' | 'plan'
  action: 'review' | 'confirm'
  summary?: string
}
```

- review（`target=plan`）：读 `plan.md` 与 `prd.md`，返回 `plan` 全文、`inspectPlanStructure(plan, prd)` 的结构问题（`packages/core/src/domain/task-gates.js:346-376` 原样复用）与现有 `planConfirmation`；`readyToConfirm` 严格等价于结构问题为空。
- confirm（`target=plan`）：结构 blocker 聚合拒绝 → `summary` 非空 → **要求 `task.alignment !== null`**（R3 的顺序约束，PRD 未确认时拒绝 PLAN 确认并给出明确文案）→ 调用新窄写口原子写入。
- 新窄写口（建议放在 `packages/core/src/domain/task-store.js` 的 `recordAlignmentCredential` 旁边，同样拒绝 `completed`）：

```ts
// 建议签名
export function recordPlanConfirmation(
  root: string,
  taskRelPath: string,
  entry: { summary: string },
): [Error | null, TaskRecordWithPath | null]
```

- 幂等策略（建议）：**不做**幂等早退。没有内容哈希就无法判断「同一份 PLAN 被重复确认」，保留早退只能按 `summary` 比较，会把用户合法的新摘要静默丢弃；与删掉 `prdHash` 后的 `recordAlignmentCredential` 保持同一口径——每次 confirm 覆盖 `passedAt` 与 `summary`。
- 为什么复用 align 工具而不是新开工具：工具名、描述、速览与参数文案集中在 `packages/core/src/surface.ts`（`TOOL_NAMES`/`TOOL_DESCRIPTIONS`/`TOOL_SNIPPETS`/`PARAM_DESCRIPTIONS`），测试强制速览与工具名键对齐、文案非空（`packages/core/test/surface.test.js:29-57`）；两个 adapter 还各有一份工具 schema（`packages/adapter-dsh/src/tasks.ts:107-133`）。加工具要同步两套 schema 与整套文案，复用 `workloom_task_align` 的 `target` 成本更低。

### 启动条件：完整任务在 PLAN 结构校验之后追加「PLAN 已确认」，容器与轻量沿用现有豁免

```js
// 建议：packages/core/src/domain/task-gates.js 的 evaluateStartGate 片段
if (!Array.isArray(task?.children) || task.children.length === 0) {
  const plan = readIfExists(join(taskDir, GATE_FILES.plan))
  missing.push(...inspectPlanStructure(plan, prd).map((issue) => issue.message))
  // 新增：结构合格的 PLAN 还必须有内容确认记录（无哈希，只判有无）。
  if (task?.planConfirmation === null || task?.planConfirmation === undefined) {
    missing.push(PLAN_NOT_CONFIRMED)
  }
}
// PRD 确认：判据从「hash 一致」改为「记录存在」。
missing.push(...evaluateAlignmentGate(task?.status ?? 'planning', task?.alignment ?? null))
```

- 新增文案常量建议放在 `PLAN_MISSING` 附近（`packages/core/src/domain/task-gates.js:331-332`）：`export const PLAN_NOT_CONFIRMED = 'plan.md content has not been confirmed (run workloom_task_align with target=plan after reviewing plan.md)'`。
- 顺序建议：先结构、后确认。否则「PLAN 还没写」与「PLAN 未确认」会同时出现，主会话无法判断先修哪个。
- `startTask` 与 force 审计无需改动：`evaluateStartGate` 的返回值就是 start 的唯一拦截来源（`packages/core/src/domain/task-store.js:719-745`），force 会按实际缺失项记一条 `start` 覆盖。
- 轻量任务：`evaluateStartGate` 的 light 分支（`packages/core/src/domain/task-gates.js:306-307`）不进入 else 分支，PLAN 确认自然不适用；这是**建议保持**的现状，见开放问题 2。

### 无哈希后的失效语义：门禁只判「有无确认记录」，内容改动不再自动失效，由 R9 的流程规则兜底

| 事件 | 旧行为（有哈希） | 新行为（无哈希） | 依据 |
| --- | --- | --- | --- |
| PRD confirm 后又被改动 | start、executor 派发、check、archive 全部判 stale 并拦截 | 不再拦截；主会话按 R9 判断：用户主动提出且内容明确的变更，该消息本身即确认，同步更新 PRD 后重跑 confirm 刷新记录，不再问第二次 | `packages/core/src/domain/alignment.js:109-115`、`packages/core/src/domain/task-gates.js:280-286` |
| PLAN confirm 后又被改动 | 无既有行为（本来没有 PLAN 确认） | 不拦截；同上，主会话自行判断是否需要重新征求用户意见 | R9 |
| review executor 复核后又改 PLAN | 用户需再确认一次整份 PLAN | 只在改动触及范围、验收基线或外部接口时集中提问（R9）；纯实现细节修订由主会话直接重跑 confirm 刷新记录 | R9 |
| 重复 confirm | 同 hash 幂等、不刷新时间 | 每次都刷新 `passedAt` | 无哈希可比的必然结果 |
| 系统发现的阻塞/歧义 | 集中提问 | 不变，仍集中提问（R9 例外条款） | `packages/assets/workflow/workflow.md:41` 的提问规则不变 |

风险提示（建议在实现时写进注释）：这是**有意的取舍**。删掉哈希后，门禁无法发现「确认之后文档被悄悄改动」。缓解手段只能是流程纪律（R9）与主会话复核，不能靠新增指纹字段，否则违反 R2/R4。建议在 `start` 或 `align confirm` 的回执里带上 `passedAt`，让主会话与用户能看到「确认时间早于最近改动」这一事实，但不新增任何自动失效判定。

### 旧数据与在途任务：`alignment.prdHash` 读时忽略、写时丢弃；已在 planning 的任务会因缺 PLAN 确认被拦一次

- `normalizeTaskRecord` 当前把 `alignment` 对象原样透传（`packages/core/src/domain/task-store.js:281`），旧记录里的 `prdHash` 会继续留在文件里。建议保留读取容忍（不报错），并在下一次 confirm 覆盖时自然丢弃；不要写迁移脚本去批量改历史任务。
- 已在 planning 且已确认过 PRD 的任务：部署后第一次 start 会被新的 PLAN 确认拦一次，需要主会话复核 PLAN 后补一次 confirm。这是可接受的一次性成本；不建议 doctor 自动补写确认（会伪造用户确认）。
- 已归档任务：两个确认写口都拒绝 `completed`（`packages/core/src/domain/task-store.js:925-929`、`968-970`），所以本次改造不会、也不能改动归档内容，满足 R6 的归档不可变要求。

### 建议新增的测试（先红后绿）

1. `evaluateStartGate`：PRD 已确认、PLAN 结构合格但无 `planConfirmation` → 返回 `PLAN_NOT_CONFIRMED`（`packages/core/test/task-gates.test.js`）。
2. `startTask` 端到端：补写 `planConfirmation` 后 start 通过，且记录里只有 `passedAt` 与 `summary` 两个键（`packages/core/test/task-store.test.js`）。
3. `executeAlignTask`：`target=plan` 在 `alignment === null` 时拒绝（R3 顺序约束），错误文案给出先确认 PRD 的指引（`packages/core/test/task-ops.test.js`）。
4. `executeAlignTask`：`target=plan` 的 review 复用 `inspectPlanStructure` 的全部 issue，`readyToConfirm` 与 issue 为空等价。
5. 回归锁定：`plan.md` 在确认之后被修改，start 仍然通过（钉死 R2 的「不再用哈希判定失效」）；同样补一条 PRD 改动后 start 仍通过。
6. 豁免：容器任务（`children` 非空）与轻量任务不需要 `planConfirmation` 也能 start。
7. 一致缺失：PRD 未确认且 PLAN 未确认时，两条缺失项同时出现在错误消息里，便于一次修完。

## 测试改造清单：core 内 12 个测试文件受影响，另有 3 个 adapter 测试夹具引用 `computeCaseHash`

| 文件 | 受影响位置 | 需要的动作 |
| --- | --- | --- |
| `packages/core/test/alignment.test.js` | `:43-72` 行尾归一与 hash 工具测试；`:90-129` 门禁组合 | 删除 hash 工具测试；重写门禁测试为「无凭据拦截 / 有凭据放行」两态，删除 stale 用例 |
| `packages/core/test/task-gates.test.js` | `:444-459` full 最低 prd 拦截项；`:471-525` stale 四条 | 删除 stale 全部用例；新增 PLAN 确认缺失用例；full 拦截项校验补 `/plan\.md content has not been confirmed/` |
| `packages/core/test/task-store.test.js` | `:783-812` 两个夹具助手；`:939-981` start 凭据与 stale 端到端；`:1642-1736` 写口测试；`:1767-1870` check/archive stale | 助手改为 `{summary}` 并补 PLAN 确认；删除 stale 端到端与幂等用例；新增「记录只有两个字段」与「确认后改文档仍可 start」 |
| `packages/core/test/task-ops.test.js` | `:43-64` 夹具；`:332-340`；`:392-510` review 的 `prdHash` 校验（398/420/504）；`:530-632` confirm 全流程 | review 校验删 `prdHash`；confirm 校验改为无 hash 入参；新增 `target=plan` 的顺序与结构用例 |
| `packages/core/test/case.test.js` | `:133-140` RESULT 前导 `caseHash`；`:250-256` 任务夹具；`:321-336` 执行前置；`:359-377` 结果校验；`:435-461` service confirm | 删除 `caseHash` 夹具字段与哈希校验；执行前置改为「case.md + designSession」；service 测试改为 review-only |
| `packages/core/test/executor-context.test.js` | `:1143-1144` 夹具；`:1480-1545` 增量续用 | 夹具删 `caseHash/confirmedAt`；测试改为「未记录 designSession 才拒绝」，校验增量不再追加哈希行 |
| `packages/core/test/session-context.test.js` | `:1083-1084` 夹具字段 | 只删夹具字段，校验不变 |
| `packages/core/test/surface.test.js` | `:260-289` taskCase/taskAlign 文案与签名 | 改为内容确认口径；taskCase 只校验 review；taskAlign 校验 `target` 参数 |
| `packages/core/test/contract-asset.test.js` | `:216-234` 收敛顺序与 `same-hash repeat is idempotent`；`:745-760` author neither | 删除 hash 幂等校验；配合资产任务的新确认顺序调整校验；删除 author neither 相关校验（若采纳 R7 的无条件 PLAN） |
| `packages/core/test/worktree-lifecycle.test.js` | `:228-240` `recordAlignmentCredential` 夹具 | 入参改为 `{summary}` |
| `packages/core/test/doctor.test.js` | `:540-563` 归档任务写回 `alignment: null` | 代码无需改，重跑确认写回行为不变 |
| `packages/core/test/dist-dts.test.js` | `:19-27` 手写 d.ts 与 `dist/` 一致性 | 不作改动，作为「删导出必须同步 d.ts」的强制校验 |
| `packages/adapter-dsh/test/case-executor.test.js` | `:9`、`:30` import 与夹具 `computeCaseHash` | 属 adapter 任务；core 删导出后必须同步 |
| `packages/adapter-pi/test/case-executor.test.ts` | `:9`、`:27` | 同上 |
| `packages/adapter-pi/test/case-executor-forward.test.ts` | `:26`、`:86` | 同上 |

## 跨包协同：core 的删除动作会直接打断三处资产与两处 adapter 的现存调用，必须同批提交

- workflow 1.1/1.4/2.2/2.3 的确认叙事：`packages/assets/workflow/workflow.md:41`（唯一确认点与 stale 重入）、`:64`（review 包内含 hash）、`:74`（confirm 后接 start）、`:94`（CASE 完成条件写「用户确认 caseHash」）、`:98`（执行轮携带 caseHash）、`:161`（执行前置按哈希拦截）。新流程要拆成两次确认：PRD 定稿后确认一次，PLAN 复核后确认一次，CASE 不再要用户确认。
- alignment 技能的 confirm 步骤：`packages/assets/skills/workloom-alignment/SKILL.md:79-81`（`expectedPrdHash` 与「同 hash 幂等」）。改为内容确认 + `target=plan` 的第二次确认。
- CASE 技能与模板：`packages/assets/skills/workloom-case-active/SKILL.md:27`（旧结果复用规则，含 `computeCaseHash` 命令行）、`:37`、`:45`；`packages/assets/skills/workloom-case-archived/SKILL.md:15`、`:45`；`packages/assets/templates/case-result.md:4`（RESULT 前导 `caseHash:` 字段）。R6 要求三个入口一致，正文改写属资产任务。
- adapter 参数 schema：`packages/adapter-dsh/src/tasks.ts:107-133`、`packages/adapter-pi/src/tasks.ts` 的 `TASK_ALIGN_PARAMS` / CASE 参数；confirm 处理函数在 `packages/adapter-dsh/src/tasks.ts:301-312`、`:320-336`，`packages/adapter-pi/src/tasks.ts:165-172`、`:285-292`。core 删参数后 adapter 必须同步，否则类型检查与运行时校验都会失败。
- 依赖顺序建议：core 先合入同批（实现 + d.ts + dist 重建 + 测试），资产与 adapter 在同一提交或紧随其后的提交完成，避免 `computeCaseHash` 导出消失后 skill 命令直接报错。

## 建议实施顺序：先拆记录与门禁，再接入 PLAN 确认，最后清理文案与资产

1. 数据层：收窄 `TaskAlignmentRecord`，删除 `case` 的 `confirmedAt/caseHash/summary`（与 `case.result`，见开放问题 1），新增 `TaskPlanConfirmationRecord` 与 `TaskRecord.planConfirmation`，同步手写 `d.ts`。
2. 纯函数层：删除 hash 工具与 `evaluateAlignmentGate` 的哈希参数；删除 `evaluateStaleAlignmentGate`、`computeCaseHash`、`evaluateCaseExecutionGate` 的哈希分支、`case.js:631` 与 `710-718` 的结果哈希判据。
3. 写口层：`recordAlignmentCredential` 去掉 hash；删除 `recordCaseConfirmation`；新增 `recordPlanConfirmation`（含 completed 拒绝、summary 非空、PRD 已确认的前置）。
4. 门禁层：`evaluateStartGate` 加 PLAN 确认判据；删除 check/archive 的 stale 分支与 `GATES.STALE_ALIGN`。
5. 服务层：`alignment-service` 加 `target`、删 `expectedPrdHash`；`case-service` 退化为 review-only。
6. 注入层：`executor-context` 删除 `Confirmed CASE hash` 追加行，前置校验保留简化版。
7. 导出与文案：`index.ts`、`surface.ts`、adapter schema 与工具文案同步。
8. 验证：`cd packages/core && pnpm run build && node --test 'test/*.test.js'`；`pnpm -r typecheck`；两个 adapter 各自测试；`pnpm lint`。

## 开放问题：四项边界需要用户或实现者裁决，其中第一项影响 core 的记录结构

1. `case.result` 与 `resultHash` 是否随 `caseHash` 一并删除。R8 写「不再使用 CASE 文档哈希关联确认、执行结果或旧结果复用」，按字面覆盖「执行结果关联」与「旧结果复用」，建议删除整个 `case.result` 与 `requireResultRecord`（`packages/core/src/domain/case.js:710-718`、`packages/core/src/domain/task-store.js:856-872`、`:1472-1479`）；AC5 只点名 `caseHash`，若实现者按最小改动只删 `caseHash` 字段，`resultHash` 会留下一个只用于「文档是否被改过」的哈希，可能被 AC1 判为残留哈希机制。**建议按删除全部结果记录实现**；若最终判定只删 `caseHash`，则保留 `case.result` 但去掉其中所有哈希字段，并在实现报告的开放问题里写明取舍。
2. 轻量任务是否也要 PRD/PLAN 内容确认。PRD 的 R3/R5/R7 只约束完整流程，现状轻量任务完全跳过对齐（`packages/core/src/domain/task-gates.js:306-307`、`:397-405`）。**建议保持豁免**，否则轻量任务的最小流程会被两次确认打断。
3. workflow 1.1 的「B. author neither」与 start 门禁的 PLAN 必需相互矛盾（`packages/assets/workflow/workflow.md:41` 对 `packages/core/src/domain/task-gates.js:311-316`）。R7 明确完整任务必须写 PLAN，**建议删除该选项**；若不删，PLAN 确认只能做成条件门禁，AC2「PLAN 内容确认前任务不能启动」将出现例外。
4. `workloom_task_case` 是否保留 review-only 形态。R4 只要求不再等待用户确认与不新增凭证；保留 review 能让主会话在派发执行前跑一遍结构自检（`packages/core/src/service/case-service.ts:63-93`）。**建议保留 review、删除 confirm**；若直接删工具，需要同步工具数量与 adapter 注册，且主会话失去机器可读的结构检查。

以上四项是调研无法单独裁决的边界，需要主会话集中转交给用户；其中第 1 项会直接决定 core 的记录结构，建议在实现前定稿，其余三项按建议执行即可。

