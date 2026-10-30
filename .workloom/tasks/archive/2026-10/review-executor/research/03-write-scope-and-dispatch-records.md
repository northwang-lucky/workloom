Injection marker: tasks/10-29-review-executor:mvubzo1wowkur3nl

# review 执行器：写入范围守卫、派发记录与门禁事实

Research report for task `tasks/10-29-review-executor`，覆盖任务清单第 4 项（写范围守卫）
与第 10 项（派发记录与门禁）。

> 执行契约冲突说明：执行契约要求先读 plan.md，本任务 planning 阶段无 plan.md，
> 以 prd.md 与源码为准（声明一次）。

## 写入范围守卫在 DSH 是按 kind 硬编码的 research 专用模块，加 review 必须把它改成「守卫 kind 集合」

DSH 守卫全文在 `packages/adapter-dsh/src/executor-guard.ts`，核心结构：

```ts
// packages/adapter-dsh/src/executor-guard.ts:83-88（重建时按 kind 过滤）
  for (const dispatch of dispatches) {
    if (dispatch?.kind === EXECUTOR_KINDS.research && typeof dispatch.childId === 'string' && dispatch.childId !== '') {
      ids.add(dispatch.childId)
    }
  }
```

```ts
// packages/adapter-dsh/src/executor-guard.ts:115-148（判定 + 拒绝串）
export function researchWriteGuard(
  state: ResearchGuardState,
): (execution: Readonly<ResearchExecutionLike>) => string | undefined {
  return (execution) => {
    if (execution.name !== WRITE_TOOL && execution.name !== EDIT_TOOL) return undefined
    ...
    if (!ids.has(agentId)) return undefined
    const filePath = (execution.arguments as { file_path?: unknown } | null | undefined)?.file_path
    if (typeof filePath !== 'string' || filePath === '') {
      return `${ERR_PREFIX.executor}: research write/edit requires a file_path argument; paths outside the project .workloom/ directory are denied`
    }
    const resolved = resolve(cwd, filePath)
    const domain = join(cwd, WORKLOOM_DIR)
    if (resolved !== domain && !resolved.startsWith(domain + sep)) {
      return `${ERR_PREFIX.executor}: write/edit denied for the research executor: ${resolved} is outside the allowed ${domain}/ directory`
    }
    return undefined
  }
}
```

接线点（三处，漏一处就会让 review 子会话逃出范围）：

| 接线点 | 位置 | 现在的内容 |
| --- | --- | --- |
| 插件激活注册守卫 | `packages/adapter-dsh/src/executor.ts:211`（`registerResearchGuard(ctx)`） | 注册一次，无需改 |
| 新派发成功登记子会话 id | `packages/adapter-dsh/src/executor.ts:695-696`（`if (params.kind === EXECUTOR_KINDS.research) registerResearchChildId(...)`） | 必须扩成 research + review |
| 失败转移新跳登记 | `packages/adapter-dsh/src/executor-failover.ts:534-535` | 必须同样扩 |
| 重启重建（扫描 task.json） | `executor-guard.ts:85` | 必须按集合过滤 |

模块内的 research 专用命名/文案清单（改名或参数化时逐一处理）：
`ResearchExecutionLike`（`executor-guard.ts:40`）、`ResearchGuardState`（43-45）、
`createResearchGuardState`（47-49）、`rebuildResearchChildIds`（58-91）、
`registerResearchChild`（98-106）、`researchWriteGuard`（115）、
`registerResearchGuard`（154-157）、`registerResearchChildId`（159-162）、
两条拒绝串里的 `research` 字样（138、143 行）。

- 守卫只覆盖 `write`/`edit` 两个工具名（`executor-guard.ts:26-27`），bash 绕过是已记录边界
  （文件头注释 13-14 行）。
- 守卫按 `<cwd>/.workloom/` 判域，`resolve` 后前缀比较，能挡 `..` 逃逸（`executor-guard.ts:139-146`）。
- 守卫状态是内存单例 + 懒重建，登记后不移除（`executor-guard.ts:152-162`）。

## Pi 侧是「同名覆盖扩展」，同样按 kind 硬编码加载，扩展本身只需换名与文案

```ts
// packages/adapter-pi/src/executor.ts:113-117
const RESEARCH_SCOPE_EXTENSION = fileURLToPath(
  new URL('../assets/research-scope.ts', import.meta.url),
)
```

```ts
// packages/adapter-pi/src/executor.ts:469-471
  const loadExtensions: string[] = []
  if (allowInfo.childHasLsp) loadExtensions.push(PI_LSP_SOURCE)
  if (params.kind === 'research') loadExtensions.push(RESEARCH_SCOPE_EXTENSION)
```

- 扩展实体：`packages/adapter-pi/assets/research-scope.ts`（全文 120 行左右），用
  `pi.registerTool({ name: 'write' | 'edit' })` 覆盖内置工具，`insideWorkloom` 判定在
  `assets/research-scope.ts:33-38`，拒绝串在 `assets/research-scope.ts:46-49`
  （`denied for the research executor`）。
- `loadExtensions` 同时进入新派发与续用两条路径（`adapter-pi/src/executor.ts:496-498` 与
  `526-531`），因此只需改 `471` 行的条件。
- 扩展加载依赖 `-e <绝对路径>`（`pi-args.ts:92-94`），`-t` 未含 write/edit 时扩展注册的同名工具
  也不可见（`assets/research-scope.ts:8-11` 注释与真机实证记录）。
- 结论：加 review 至少要动三处——扩展文件名/文案（或参数化）、`executor.ts:471` 条件、
  `package.json` files 字段无需改（`assets/` 已在包内，见 `packages/adapter-pi/package.json`）。

## 派发记录：kind 直接落 task.json，加枚举即放行；但阶段计算会把 review 当 implement

```js
// packages/core/src/domain/task-store.js:1226-1237
export function computeTaskStage(current, kind) {
  if (typeof kind !== 'string' || !Object.values(EXECUTOR_KINDS).includes(kind)) {
    throw new Error(...)
  }
  if (kind === EXECUTOR_KINDS.research) return current
  if (kind === EXECUTOR_KINDS.check) return TaskStage.CHECK
  return TaskStage.IMPLEMENT
}
```

- 写入点：`recordExecutorDispatchInternal`（`task-store.js:963-969`）
  `task.dispatches.push(buildDispatchRecord(entry)); task.stage = computeTaskStage(task.stage, entry.kind)`。
- 新建任务默认 `stage: implement`（`task-store.js:365`；旧任务归一化同样默认 implement，
  `task-store.js:230`），所以 planning 阶段派发 review 时 `current === 'implement'`，
  fall-through 返回 implement，**表面上无变化**。
- 但若在 stage=check 之后派发 review（例如补审计划），`computeTaskStage` 会把 stage 悄悄改回
  implement，doctor 的阶段一致性检查（`doctor-check-rules.ts:208-262`）只在 stage=check 时告警，
  改回 implement 后反而不会报——这是一处静默状态污染。
- 建议：在 `computeTaskStage` 增加 `if (kind === EXECUTOR_KINDS.review) return current`，与 research 同语义。
- 派发记录字段：`buildDispatchRecord`（`task-store.js:1120-1210`）落
  `{kind, at, title, status, childId?, model?, effort?, modelSource?, fallbackOf?, fallbackAttempt?, toolsAllow?, error?}`；
  kind 校验在 1131-1136 行，加枚举即接受。

## check 的前端派发门禁是「prd 小节 + 派发记录」形状，review 不需要对等门禁

```js
// packages/core/src/domain/task-gates.js:374-383
export function evaluateFrontendDispatchGate(prdContent, dispatches) {
  const body =
    prdContent === null ? undefined : splitSectionBodies(prdContent).get(UI_DESIGN_SECTION)
  if (body === undefined || isUiNotApplicableDeclaration(body)) {
    return []
  }
  const hasFrontend =
    Array.isArray(dispatches) && dispatches.some((entry) => entry.kind === EXECUTOR_KINDS.frontend)
  return hasFrontend ? [] : [FRONTEND_DISPATCH_MISSING]
}
```

- 门禁文案常量：`task-gates.js:152-153`（`no frontend dispatch recorded for a task with UI requirements`）。
- 生效点：`task-store.js:788-795` 的 `collectCheckGateMissing`，由 `checkTaskInternal`
  在记录 `workloom_task_check` 时求值（`task-store.js:716-745`）；轻量任务直接豁免（`task-store.js:790-791`）。
- 结论依据（为什么 review 不需要同类门禁）：
  1. check 门禁的判定物是「prd 小节是否声明 UI 需求」这一**必然存在的静态事实**；
     review 的触发条件是「1.4 写 plan 后默认派发、对齐轮可显式跳过」，属流程约定，
     task.json 里没有与之等价的可判定字段（除非新增字段），加门禁会引入新的写口与 override 面
     （`makeOverride`，`task-gates.js:419+`）。
  2. 现有门禁全部在 start / check 两个写入点求值（`evaluateStartGate` 297 行起、
     `evaluateCheckLogGate` 356 行起），review 发生在 start 之前，没有可挂的求值点。
  3. 需求第 2 条明确「允许显式跳过」，硬门禁与之冲突。
- `workloom_task_check` 对 dispatches 的唯一检查就是上面这条前端门禁；没有「必须有 check 派发」
  之类的检查（`checkStageConsistency` 是 doctor 的只读告警，不阻断写入）。

## 会话快照的 Last dispatch 行会显示 review，planning 阶段可见，无害但要知道

`packages/core/src/service/session-context.ts:377-395` 取 dispatches 末位渲染
`Last dispatch: <kind> <status> at <iso>`（kind 缺失才不出行）。planning 阶段派发 review 后，
快照会出现 `Last dispatch: review completed …`，不改变任何门禁。
