tasks/11-03-full-task-case-coverage:mw04k72o2tdvt1kf

# core 侧 CASE 生命周期实现锚点：代码事实报告

Research report for task `tasks/11-03-full-task-case-coverage`（父任务 `tasks/11-03-check-case-coverage`）。本报告只读调查 core 实现面，不修改实现代码。

> 协议说明（本报告唯一的前置偏差）：分层加载协议要求先读 `plan.md`，但本任务此刻仍是 `planning`，任务目录内没有 `plan.md`（`.workloom/tasks/11-03-full-task-case-coverage/task.json:5` 为 `"status": "planning"`，调查开始时目录只有 prd.md / task.json / 两个 jsonl）。因此需求依据取本任务 `prd.md`，CASE 模板依据取父任务 PRD 的 `## CASE Document Format`（`.workloom/tasks/11-03-check-case-coverage/prd.md:57-131`）与 `## CASE Result Format`（同文件 `:133-221`）。
> 写入位置说明：执行契约把写权限限定在 `.workloom/` 内，且仓库历史研究的落点就是任务目录下的 `research/`（如 `.workloom/tasks/archive/2026-09/s1-core-worktree-lifecycle/implement.jsonl:16` 引用 `.workloom/tasks/09-30-s1-core-worktree-lifecycle/research/…`）。故本文件落在任务目录的 `research/core-case-lifecycle.md`。

## 全仓当前没有任何 CASE 实现，新增面必须从 core 的四个模块起建

- `grep -rn "caseHash|case-result|case\.required"` 在 `packages/core/src`、`packages/adapter-dsh/src`、`packages/adapter-pi/src` 零命中；`packages/core/dist` 同样零命中。即 `case.md`、`case-result.md`、`coverage/`、`workloom_task_case` 全部是新增物，不是改造既有代码。
- 因此 R6 的 review/confirm、R7 的摘要、R10/R11 的覆盖率状态、R18 的深度校验、R20 的父任务 Implementation 列表都没有任何既有实现可复用，只能新建模块并在下列固定接缝上挂载。
- 可以复用的只有「同一类问题的既有骨架」：任务记录归一化与窄写口在 `packages/core/src/domain/task-store.js`，门禁求值在 `packages/core/src/domain/task-gates.js`，review/confirm 服务在 `packages/core/src/service/alignment-service.ts`，工具注册面文案在 `packages/core/src/surface.ts`。

## task.json 的 case 记录应跟随 check/alignment 的现有归一化与建记录路径

现状的凭据记录是 `check`（`{passedAt, summary}`）与 `alignment`（`{passedAt, summary, prdHash}`），两者都靠「读取归一化补 null + 新建任务落初始值」撑住旧数据安全：

- 归一化：`normalizeTaskRecord` 对 `check` 补 null、对 `alignment` 补 null、对 `overrides` 补空数组、对 `stage` 补 `implement`、对 `mode` 补 `full` —— `packages/core/src/domain/task-store.js:249-283`（`check` 在 `:267`、`alignment` 在 `:270`）。
- 新建记录：`buildTaskRecord` 里 `check: null` 在 `:402`、`alignment: null` 在 `:405`、`stage` 在 `:408`；新增 `case` 字段必须同时改这两处，否则旧任务读取与新建任务的默认值对不齐。
- 类型声明：`TaskRecord` 的字段清单在 `packages/core/src/domain/task-store.d.ts:165-199`（`check` 在 `:191`、`alignment` 在 `:193`、`stage` 在 `:196`）；凭据形状 `TaskCheckRecord` 在 `:39-43`、`TaskAlignmentRecord` 在 `:49-56`，新 `TaskCaseRecord` 应照此声明。
- 公共导出：`packages/core/src/index.ts:102-122` 导出 task-store 的函数、`:298-331` 导出 task-store 的类型；新函数/新类型都要在这两段补出口，否则 adapter 取不到。

```js
// packages/core/src/domain/task-store.js:264-278（节选）
  return {
    ...parsed,
    hooks,
    check: parsed.check ?? null,
    alignment: parsed.alignment ?? null,
    overrides: Array.isArray(parsed.overrides) ? parsed.overrides : [],
    stage: parsed.stage ?? TaskStage.IMPLEMENT,
    mode: isTaskModeValue(parsed.mode) ? parsed.mode : TASK_MODES.FULL,
```

R17 需要的「case.required=true / 缺字段的旧 in_progress 任务」正好落在这个归一化层：`parsed.case ?? null` 保留三态（缺字段 / 有记录 / 明确 required），而不是用 `?? {required:false}` 把旧任务与显式关闭混为一谈（此判断是实现选择，未验证语义取舍）。

## PLAN 开始条件目前只校验 prd/jsonl/alignment，`plan.md` 没有任何门禁

`evaluateStartGate` 是全仓唯一的开始条件求值点（`packages/core/src/domain/task-gates.js:297-322`），当前缺失项只有四类：

1. `prd.md` 缺失（`:302-303`）；
2. 完整任务走 `inspectPrdStructure` 的 H1 → 四小节 → open-nodes（`:308-309`，分类器本体在 `:192-224`）；
3. alignment 凭据门禁（`:310-312`，`evaluateAlignmentGate` 在 `packages/core/src/domain/alignment.js:91-97`）；
4. 两个 jsonl 各需至少一条有效记录（`:315-320`，单文件求值在 `:407-411`）。

`plan.md` 在 core 里只作为 executor 注入的指针出现：`ARTIFACT_POINTER_FILES` 定义于 `packages/core/src/domain/executor-context.js:51`，指针清单渲染在 `:431-448`；没有任何函数读取或校验它的结构。R1 的「符合现有编写要求」在仓库中的权威文本是 `packages/assets/skills/workloom-alignment/references/plan-authoring.md`：

- 文档形状两段：`## Design decisions`（可选）与 `## Steps` —— `packages/assets/skills/workloom-alignment/references/plan-authoring.md:7-12`。
- 每个 step 依序携带 `Covers` / `Target` / `Edit` / `Verify` 四项 —— 同文件 `:14-23`。
- 完成判据：每一步能叫出文件、符号、精确代码与验证命令，且 prd 的每个 AC 至少出现在一个 step 的 Covers 里 —— 同文件 `:35-37`。

因此新门禁要么在 `evaluateStartGate` 里加一条读 `plan.md` 并做结构校验的分支（与 prd 分类器同风格），要么新建一个 `inspectPlanStructure(planContent)` 纯函数再被 `evaluateStartGate` 与后续技能复用。第二条更贴现有分层：纯求值在 `task-gates.js`，读盘在调用方（`task-gates.js` 里 prd 已经是这个模式，见 `:300-309`）。

```js
// packages/core/src/domain/task-gates.js:297-322（节选）
export function evaluateStartGate(root, taskRelPath, task) {
  const taskDir = insideWorkloom(root, taskRelPath)
  const missing = []
  const prd = readIfExists(join(taskDir, GATE_FILES.prd))
  const light = task?.mode === TASK_MODES.LIGHT
  if (prd === null) {
    missing.push(PRD_MISSING)
  } else if (light) {
    missing.push(...inspectLightStartPrd(prd))
  } else {
    missing.push(...inspectPrdStructure(prd).map((issue) => issue.message))
    missing.push(...evaluateAlignmentGate(task?.status ?? 'planning', task?.alignment ?? null, computePrdHash(prd)))
  }
```

## 父任务豁免与轻量任务豁免都能从现有字段与 mode 分支直接判定

- 轻量豁免：`evaluateStartGate` 已有 `mode === TASK_MODES.LIGHT` 分支，只保留 H1 + Goal（`packages/core/src/domain/task-gates.js:301-306`，细则 `:330-338`）；`TASK_MODES` 常量在 `packages/core/src/domain/task-mode.js:13-16`，读取归一化在 `packages/core/src/domain/task-store.js:276`。轻量任务不受 R1 影响，无需新判断。
- 父任务豁免：任务记录有 `parent`、`children`（`packages/core/src/domain/task-store.d.ts:181-182`，归一化在 `packages/core/src/domain/task-store.js:279-281`）。子任务写回父 `children` 的动作在 `linkChildToParent`（`packages/core/src/domain/task-store.js:540` 起，创建时调用点在 `:645-648`）。
- `subtasks` 字段在 core 中从未被写入或读取，除默认空数组（`packages/core/src/domain/task-store.js:394`、`:408` 附近仅有 `subtasks: []`；全仓 `grep subtasks` 只命中此处、类型声明 `task-store.d.ts:183` 与两处测试断言）。所以「已声明子任务」只能以 `children.length > 0` 为准；用 `subtasks` 判定会永远为空。
- 由此 R1/R20 的父任务判定可以写成纯函数：`mode === full && children.length > 0 && status/in_progress 进入最终验收` 时豁免 PLAN，且 CASE 的 Implementation 改列子任务 PLAN。父任务判定不给 start 门禁放宽——父任务仍要 start 才能进入最终验收，差别只在「缺 plan.md 时是否拒绝」。

## `case.required` 的新旧分流没有现成机制，core 内可挂的三处展示面各不相同

- 展示面一：会话上下文快照。`assembleSessionContext` 拼装 Developer / Last dispatch / Executor profiles / Git / 工作流概览（`packages/core/src/service/session-context.ts:139` 起，行顺序说明在 `:151-154`；Last dispatch 行渲染在 `:371-393`）。这是每轮自动注入、模型必然看到的唯一位置，适合放「旧任务缺 case.required 的迁移提示」一行。
- 展示面二：doctor 检查。检查清单是 12 类固定元信息（`packages/core/src/service/doctor-types.ts:101-119`），并有测试断言恒为 12 类（`packages/core/test/doctor.test.js:587`）。若把迁移提示做成 doctor issue，必须同步 `CHECK_META`、`DoctorIssueCode`（`:13-25`）与该断言；`doc-completeness` 检查（`packages/core/src/service/doctor-check-rules.ts:345-420`）是现成的「文档/记录完整性」投影样例。
- 展示面三：工具返回 note。`TASK_CREATE_NOTE` / `TASK_CREATE_LIGHT_NOTE` / `TASK_ARCHIVE_NOTE` 都在 `packages/core/src/surface.ts:253-270`，由 `task-ops` 拼进结果（archive 在 `packages/core/src/service/task-ops.ts:423-428`）。

三处都能承载「显示迁移提示」，但语义不同：session context 是每轮常驻，doctor 是按需诊断，tool note 是一次性回执。实现时建议只选一处主展示 + 一处审计（未验证的取舍，取决于主会话希望何时看到提示）。

## `workloom_task_case` 的 review/confirm 协议与 alignment-service 同构，可直接照搬骨架

`packages/core/src/service/alignment-service.ts` 已经是一套完整的「review 只读 + confirm 校验后窄写」协议，字段命名与 R6 几乎一一对应：

| alignment 现有件 | 位置 | CASE 对应物 |
| --- | --- | --- |
| `executeAlignTask(cwd, contextKey, params)` 元组包装 | `alignment-service.ts:86-96` | `executeTaskCase(...)` 同形 |
| cwd → 项目根 → taskRelPath 解析 | `:105-117` | 相同三件套 |
| `action === 'review'` 分支 | `:118-122` | `action === 'review'` |
| `AlignReviewResult{prd, prdHash, structureIssues, confirmBlockers, readyToConfirm, alignment}` | `:39-53` | 改成 CASE 快照/`caseHash`/结构问题/阻断项/`readyToConfirm` |
| 只读 review 实现 | `:132-154` | 读 `case.md`、算摘要、跑结构分类器 |
| confirm 校验顺序：必填 hash → 内容 blocker → 重算 hash 比对 → summary 非空 → 窄写口 | `:166-219` | 同序，对象换成 CASE 确认 |
| 幂等早退（同 hash 不刷新 passedAt） | `:206-217` 与窄写口 `task-store.js:890-894` | 同语义 |

`task-ops.ts` 的 `executeCheckTask` / `executeArchiveTask` 展示了「服务层校验 + core 写盘」的分工（`packages/core/src/service/task-ops.ts:258-293`、`:392-429`）；`requireWorkloomCwd` / `resolveTaskRelPath` / `requireTaskRelPath` 三个入口工具函数在 `:44-95`，新工具必须复用同一套解析，才能保持「显式 taskPath > 活跃任务」的行为一致。

工具面新增点（三处常量 + 一处注册 + 一处导出）：

- `TOOL_NAMES`（`packages/core/src/surface.ts:28-39`，注释写死「十个工具」，新增后必须改注释）、`TOOL_DESCRIPTIONS`（`:42-58`）、`TOOL_SNIPPETS`（`:65-81`，Pi 的 `promptSnippet` 依赖它，缺了模型看不到工具）、`PARAM_DESCRIPTIONS`（`:84-148`，`action` 与 `expectedPrdHash` 的现成文案在 `:113-117`，可仿写）。
- `packages/core/src/index.ts:212` 导出 `executeAlignTask` 的位置旁边补 `executeTaskCase`。
- 两个 adapter 的注册点：DSH `packages/adapter-dsh/src/tasks.ts:107-125`（schema）+ `:267-282`（handler）；Pi `packages/adapter-pi/src/tasks.ts:69-78`（`TASK_ALIGN_PARAMS`）+ `:135-145`。`surface.test.js:51` 断言 `TOOL_SNIPPETS` 与 `TOOL_NAMES` 键对齐，漏一个会直接红。

```ts
// packages/core/src/service/alignment-service.ts:118-121（review/confirm 分派）
  if (params.action === 'review') {
    return reviewAlign(root, taskRelPath, task)
  }
  return confirmAlign(root, taskRelPath, task, params)
```

## 确认摘要值可复用 alignment 的 CRLF/CR→LF + SHA-256，但函数命名与适用范围是 prd 专用

- `normalizePrdEol` 只做 `content.replace(/\r\n|\r/g, '\n')`（`packages/core/src/domain/alignment.js:49-51`），`computePrdHash` 是 `createHash('sha256').update(...).digest('hex')`（`:58-60`），已从 core 导出（`packages/core/src/index.ts:82-89`）。
- 现成测试固定了三条性质：换行归一、64 位 hex、内容不同 hash 不同（`packages/core/test/alignment.test.js:43`、`:52`、`:61`）。
- R7 要求对 `case.md` 用同一归一 + SHA-256。直接复用 `computePrdHash` 语义正确但命名误导（读代码的人会以为只能对 prd 用）。建议抽一个与文件类型无关的 `computeContentHash`/`normalizeEol`，`computePrdHash` 变成薄包装（建议，未实现）；否则会留下「prd 专用函数被拿来算 CASE」的暗坑。

## CASE 与 RESULT 的 YAML 解析可复用 yaml 依赖与 front-matter 切分，但切分函数未导出

- core 已直接依赖 `yaml`（`packages/core/package.json` 的 `dependencies: { "yaml": "^2.0.0" }`），现有三个消费方：`packages/core/src/domain/workflow-contract.js:14`、`packages/core/src/domain/migrate.js:27`、`packages/core/src/service/local-prompts.ts:25`。
- front-matter 切分实现是 `splitFrontMatter`（`packages/core/src/domain/workflow-contract.js:73-86`），但它**没有导出**；同文件导出的是 `parseDocument`（`:312-350`）与 `parseContract`（`:357-363`），且 `parseFrontMatter`（`:93-114`）把 YAML 校验硬绑在 `version`/`states` 两个 workloom 契约字段上，无法直接复用到 CASE 的 `version/task` 或 RESULT 的 `caseHash/checkSession/status`。
- 结论：R6/R18 的 CASE/RESULT YAML 校验需要一个新的通用 front-matter 解析器（抽出 `splitFrontMatter` 共享，或在新的 CASE 模块里实现同形函数），并顺带把 `parseYaml` 的异常转成结构化「YAML 字段缺失/非法」问题项。这是 R18「深度校验 YAML」的唯一自然落点。
- 摘要必须基于全文（含 front-matter），不能只算正文：父任务模板把 `version`/`task` 放在 front-matter（`.workloom/tasks/11-03-check-case-coverage/prd.md:62-65`），RESULT 的 `caseHash` 又指向「用户确认的 CASE 全文」（同文件 `:141`）。

```js
// packages/core/src/domain/workflow-contract.js:73-86（可抽出的切分逻辑）
function splitFrontMatter(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) return null
  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONT_MATTER_DELIMITER,
  )
  if (endIndex === -1) {
    throw new WorkflowContractError(FIELD_FRONT_MATTER, 'missing closing delimiter ---')
  }
  return {
    yamlText: lines.slice(1, endIndex).join('\n'),
    bodyText: lines.slice(endIndex + 1).join('\n'),
  }
}
```

## 固定章节校验需要新的 H3 解析：现有 `splitSectionBodies` 只切二级标题

- 现有切分函数 `splitSectionBodies`（`packages/core/src/domain/task-gates.js:448-463`）以 `## ` 为界，只产出「二级标题 → 正文」，且是模块私有（未导出）。它足够校验 `## References` / `## Scope` / `## Static Review` / `## Runtime Cases` / `## Coverage` / `## Traceability` 这些固定 H2。
- 但 SR/C 条目的编号与必填字段挂在 H3（模板见 `.workloom/tasks/11-03-check-case-coverage/prd.md:83-107`：`### SR1 <title>` 与 `### C1 <title>`，其下是 `- Covers:` / `- Target:` / `- Checks:` / `- Expected:` 与 `- Preconditions:` / `- Steps:` / `- Expected:` / `- Evidence:` / `- Cleanup:`）。现有代码里没有 `### ` 级别的小节切分器；`executor-context.js` 只有 `HEADING_PREFIX = '### '`（`:310`）这类标题拼接常量，不是解析器。
- 另一个现成的「结构化条目解析」样例是 jsonl 的有效记录判定：`countEffectiveJsonlRecords` 复用 `executor-context` 的 `parseJsonlEntries`（`packages/core/src/domain/task-gates.js:265-267`，解析器本体在 `packages/core/src/domain/executor-context.js:680`），坏行 fail loud 的语义在 `packages/core/test/task-gates.test.js:254-266` 有测试固定。CASE 的 SR/C 校验应沿用「一次返回全部问题、坏输入 fail loud」的风格，而不是抛第一个错就停。
- 编号与溯源校验（R4/R18：每个 AC 至少一个 SR/C、每个变更代码文件至少一个 SR）需要从 prd 抽 AC 编号、从 Traceability 表抽映射。prd 的 AC 行格式由 1.1 固定为 `AC1、AC2…`（`packages/assets/workflow/workflow.md:29-51` 的 1.1 正文与 `packages/core/test/contract-asset.test.js:765-782` 的断言），实际抽取规则（正则 `AC\d+`）没有任何既有实现，属新增。变更代码文件集合同样没有现成来源：`relatedFiles` 字段只在建记录时置空（`packages/core/src/domain/task-store.js:399`），全仓无写入方；`gitStatusSync` 只给 porcelain 文本（`packages/core/src/domain/git.js:130-146`）。

## 不可 force 的核心错误用「force 分支之外的硬前置」表达，仓库已有两处先例

- force 机制本体：`assertTaskForceReason` 要求非空 reason（`packages/core/src/domain/task-store.js:913-919`）；门禁枚举 `GATES`（`packages/core/src/domain/task-gates.js:40-50`）与工具名映射 `GATE_TOOLS`（`:57-67`）决定一条 override 记在哪个 gate 下；`makeOverride` 组装记录（`:419-426`），落盘走 `recordGateOverride`（`packages/core/src/domain/task-store.js:958-982`）。
- 先例一（状态前置不可绕）：`checkTaskInternal` 先判 `status !== in_progress` 抛错（`:786-790`），再判 `summary` 非空（`:792-795`），之后才进 `forced` 分支（`:796-811`）。这三条在任何 force 值下都抛错，且不会写 override。
- 先例二（硬阻断不豁免）：start 的 worktree 创建失败直接抛错、明确注明「worktree 失败是硬阻断非豁免项」（`packages/core/src/domain/task-store.js:727-745`）；`archiveTaskInternal` 的 worktree 清理失败同样阻断（`:1386-1395`）。
- 因此 R21 的六类核心问题（CASE 未确认/过期、RESULT 无效、用例未全过、标准验证失败、覆盖率失败、会话链缺失）应实现为 `checkTaskInternal` / `archiveTaskInternal` 里 force 分支之前的硬前置，而不是新增 `GATES` 值。新增 gate 值会同时要求 `GATE_TOOLS`、`GateValue` 类型（`packages/core/src/domain/task-gates.d.ts:14-21`）与 override 语义一起扩展，等于把「不可绕过」写成「可绕过但留痕」，与 R21 相反。
- 可对照的 force 测试写法：start 的 force 留痕（`packages/core/test/task-store.test.js:843`）、check 的 force 留痕（`:1113`）、archive 的 force 留痕（`:1193`）、前端门禁 force 留痕（`:1396`）。新核心问题应写「force: true + reason 仍拒绝，且 overrides 长度不变」的反向测试。

## 最终 check 与归档的复用校验只有一处插入点：`checkTaskInternal` 与 `archiveTaskInternal`

- 「记录 check 通过」的唯一写点是 `checkTaskInternal`（`packages/core/src/domain/task-store.js:783-827`），最终写入在 `:824` `task.check = { passedAt, summary }`，随后整份 `task.json` 落盘 `:825`。
- 「归档」的唯一写点是 `archiveTaskInternal`（`:1348-1421`）。当前门禁只有两条：无 check 凭据（`:1351-1367`）与 stale alignment（`:1368-1378`），之后才做冲突检查、worktree 清理、目录移动与 `completed` 写入（`:1379-1401`）。
- R13 要求「最终 check 与归档都必须验证 CASE 确认有效、RESULT 对应当前 CASE、所有 SR 和 C 通过、标准验证通过、覆盖率有效、无未解决问题」。两个入口都需要同一份校验，正确做法是抽一个纯求值函数（如 `evaluateCaseOutcome(task, caseContent, resultContent, evidenceDir)`）在 `task-gates.js` 求值、两个写入口消费，而不是各写一份。这与现有 `collectCheckGateMissing`（`:837-845`）+ `evaluateCheckLogGate` / `evaluateFrontendDispatchGate`（`packages/core/src/domain/task-gates.js:356-383`）的分工完全同构。
- 注意 `checkTask` 的语义是「记录通过」，不是「执行检查」：R9 的 `case-result.md` 与 R14 的「修复后全量重跑」都是文件内容约束，core 只能校验 RESULT 里的状态与证据路径，不能验证过程真实性——这一点必须在报告里如实标注为「可校验边界」而非能力承诺。

## stage 计算由派发 kind 直接驱动，是 CASE 设计 dispatch 不能进 check 阶段的唯一硬耦合

- 阶段枚举只有两值：`TaskStage.IMPLEMENT` / `TaskStage.CHECK`（`packages/core/src/domain/task-store.js:125-128`，类型 `packages/core/src/domain/task-store.d.ts:17-20`）。
- 派发写记录时**同点**改阶段：`recordExecutorDispatchInternal` 在 `:1015-1017` push 记录后立刻 `task.stage = computeTaskStage(task.stage, entry.kind)`。
- 计算规则：`research`/`review` 保持当前值，`check` → `check`，其余（`implement`/`frontend`）→ `implement`（`:1275-1287`）。`EXECUTOR_KINDS` 值域在 `packages/core/src/domain/executor-context.js:36-42`。
- 这正是本任务 PRD 里点名的现状事实（`.workloom/tasks/11-03-full-task-case-coverage/prd.md` Notes：「现有 `computeTaskStage` 对任何 check 派发都返回 check，这是需要调整的现状事实」）。R3 要求「设计 check 不提前把实施中的任务切到最终 check 阶段」，可选落点只有两个：
  - A. 在派发记录上新增可选标记（例如 `stageDeferred: true` 或 `phase: 'case-design'`），`recordExecutorDispatchInternal` 据此跳过 stage 更新；类型要加进 `DispatchRecord`（`task-store.d.ts:97-136`）与 `DispatchRecordInput`（`:138-152`），校验要加进 `buildDispatchRecord`（`task-store.js:1173-1265`）。
  - B. 给 CASE 设计新增一个 executor kind，`computeTaskStage` 对它返回当前值。代价大：`EXECUTOR_KINDS` 参与 kind 校验、工具白名单、纪律段、两个 adapter 的 schema 与上下文注入，属于跨面改动（未验证，需实现前定夺）。
- 耦合警告：`checkStageConsistency` 已把「stage=check 时最近一条派发必须是 check」写死（`packages/core/src/service/doctor-check-rules.ts:207-261`，关键分支 `:229-258`）。若设计 check 派发仍记 `kind: 'check'` 而 stage 保持 `implement`，doctor 不会报错（它只在 stage=check 时检查）；但若 stage 提前变 check、最近派发又被后续 implement 覆盖，就会产生 `Check stage with stale dispatch` 告警。改 stage 语义时必须同步复核这条 doctor 规则与其测试（`packages/core/test/doctor.test.js` 第 587 行只锁 12 类数量，不含该规则的正向断言，属于可安全调整但需补测的边界）。
- 续用定位与 R8 同会话要求已经具备：`locateContinueChildId` 用 `continue_executor=latest` 取同 kind 最近一条带 `childId` 的记录（`packages/adapter-dsh/src/executor-continuation.ts:139-186`），续用轮追加的新记录沿用同一 `childId`（Pi 侧 `packages/adapter-pi/src/executor-continuation.ts:365-395` 的 `recordContinuationDispatch`，`modelSource: 'spawn'`）。core 只需要读同 kind 的最新 `childId` 即可判定「设计会话 = 执行会话」。

```js
// packages/core/src/domain/task-store.js:1275-1287
export function computeTaskStage(current, kind) {
  if (typeof kind !== 'string' || !Object.values(EXECUTOR_KINDS).includes(kind)) {
    throw new Error(...)
  }
  if (kind === EXECUTOR_KINDS.research) return current
  if (kind === EXECUTOR_KINDS.review) return current
  if (kind === EXECUTOR_KINDS.check) return TaskStage.CHECK
  return TaskStage.IMPLEMENT
}
```

## RESULT 的 `checkSession` 与 `fallbackOf` 链可从 dispatches 直接重建

- 派发记录是 append-only 的 `dispatches[]`，每条可带 `childId`、`status`、`fallbackOf`、`fallbackAttempt`（`packages/core/src/domain/task-store.d.ts:97-136`；`fallbackOf` 语义在 `:129-135`：「前一跳 childId，链由 fallbackOf 回溯重建」）。
- 写入校验已存在：`fallbackOf` 必须非空 string、`fallbackAttempt` 必须 ≥2 的整数（`packages/core/src/domain/task-store.js:1221-1239`，记录组装 `:1248-1265`）。因此链路数据本身是可信输入，R19 只需实现「从执行会话 childId 向上回溯，能否到达设计会话 childId」的遍历。
- 链的生产方在 adapter（DSH 失败转移：`packages/adapter-dsh/src/executor-failover.ts:240/256/495/526` 传 `fallbackOf`；`executor-failover-chain.ts:189-199` 二次记录），core 侧不生成链，只消费——这决定了校验函数应放在 core 的纯求值模块，且必须容忍旧记录缺字段。
- 设计会话 childId 的可取法（建议，待实现定夺）：同 kind（check）派发中第一条/最早一条带 childId 的记录；执行会话 childId：RESULT 的 `checkSession` 值。两者不同时必须存在一条从执行到设计的 `fallbackOf` 链（逐跳匹配）。这段遍历没有任何现成实现，属新增（未验证：是否存在「首派记录被 settle 成 failed 后同一 childId 再续用」的历史数据形态，需在实现时用 `task-store.test.js:1307` 附近的派发测试夹具确认）。

## 公开测试边界集中在 core 的九个测试文件与 assets 契约测试，adapter 另有注册与派发测试

| 测试文件 | 覆盖的既有行为（CASE 改动的回归面） |
| --- | --- |
| `packages/core/test/task-gates.test.js` | start 门禁 light/full 分支（`:382`、`:393`、`:403`、`:431`、`:444`）、light 派发门禁（`:461`）、stale alignment（`:471`、`:482`、`:498`、`:513`）；新增 PLAN 门禁与父任务豁免必须在这里加红→绿 |
| `packages/core/test/task-store.test.js` | start 门禁（`:802`、`:819`、`:843`、`:865`、`:891`、`:926`、`:950`）、check 写入与门禁（`:1061`、`:1090`、`:1113`）、archive 门禁（`:1150`、`:1170`、`:1193`）、派发与 stage（`:1240`、`:1268`、`:1290`、`:1307`、`:1344`）、parent/children（`:1430`、`:1451`、`:1465`、`:1481`、`:1512`、`:1524`） |
| `packages/core/test/task-ops.test.js` | create→start→check→finish→list→archive 全链（`:151`）、check/archive 编排（`:194`、`:239`）、align review/confirm 全套（`:375`、`:399`、`:426`、`:450`、`:482`、`:500`、`:543`）；新工具编排应照这套夹具写 |
| `packages/core/test/alignment.test.js` | 归一化与 hash 三性质（`:43`、`:52`、`:61`）、门禁矩阵（`:90`-`:121`）；CASE 摘要与「确认后改动即失效」应复用同一性质测试形状 |
| `packages/core/test/surface.test.js` | 工具名唯一（`:29`）、描述非空（`:38`）、`TOOL_SNIPPETS` 与 `TOOL_NAMES` 键对齐（`:51`）、align 工具文案（`:260`）；新工具必须让这四条保持绿 |
| `packages/core/test/contract-asset.test.js` | 真实资产步骤 id 精确断言 `['1.0','1.1','1.2','1.3','1.4','2.1','2.2','2.3','3.1']`（`:313-322`）、版本一致（`:47-58`）、force reason 三条路径（`:25-33`）、轻量步骤 id（`:652-674`）；R2 的 2.2/2.3/2.4 重编号必须同步改这里 |
| `packages/core/test/protocol.test.js` | 协议常量为正整数（`:18`）、版本失配 fail loud（`:26`）、资产 front-matter 与常量一致（`:35`）；`WORKFLOW_PROTOCOL_VERSION` 在 `packages/core/src/domain/protocol.js:13`（当前 24，资产 `packages/assets/workflow/workflow.md:2` 同为 24） |
| `packages/core/test/session-context.test.js` / `workflow-service.test.js` | 工作流概览行与步骤投影断言（`session-context.test.js:194`、`:559`、`:924`；`workflow-service.test.js:398`、`:411`、`:431`）；两处用的是测试内自建契约夹具，真实资产改动不必然红，但轻量/完整裁决处需复核 |
| `packages/adapter-dsh/test/tasks.test.js`、`packages/adapter-pi/test/tasks.test.ts` | 工具 schema 与注册（如 DSH `:67`、Pi `:92` 的 check schema 断言）；新工具注册的对外行为面 |
| `packages/adapter-dsh/test/executor.test.js`、`packages/adapter-pi/test/executor*.test.ts` | 派发记录、续用、失败转移链（adapter 接缝，属另一研究切片，此处只列边界） |

真实资产现状（实现 R2 前必须知道）：完整流程 `workflow.md` 现有 2.1 Implement（`:79`）、2.2 Check（`:88`）、2.3 Commit（`:105`），全文无 2.4；轻量流程 `workflow-light.md` 步骤为 1.0（`:17`）、2.1（`:24`）、2.2（`:29`）、2.3（`:34`）、3.1（`:41`）。`workflow.md:17` 与 `:126` 的正文还硬引用了「per 2.2」「before 2.2 has passed」等旧编号，重编号时这些句子必须一起改，否则契约自相矛盾。

## 现有调用方清单（core 改动会波及的写入口）

- `recordExecutorDispatch` 的 adapter 调用方：`packages/adapter-dsh/src/executor.ts:640`、`packages/adapter-dsh/src/executor-failover.ts:518`、`packages/adapter-dsh/src/executor-failover-chain.ts:189`、`packages/adapter-pi/src/executor.ts:270-275`、`packages/adapter-pi/src/executor-dispatch.ts:328`、`packages/adapter-pi/src/executor-continuation.ts:344`。
- `settleExecutorDispatch` 的调用方：`packages/adapter-dsh/src/executor-settle.ts:144`、`packages/adapter-pi/src/executor-settle.ts:105`、`packages/adapter-pi/src/executor-dispatch.ts:239`、`packages/adapter-pi/src/executor-continuation.ts:333`。
- `computeTaskStage` 的调用方：仅 `packages/core/src/domain/task-store.js:1017` 与测试 `packages/core/test/task-store.test.js:1344`（纯函数直测）。
- `checkTask` / `archiveTask` 的服务层调用方：`packages/core/src/service/task-ops.ts:284`、`:415`；adapter 侧经 `workloom_task_check` / `workloom_task_archive` 注册（DSH `packages/adapter-dsh/src/tasks.ts:88`、`:145`；Pi `packages/adapter-pi/src/tasks.ts:125`、`:157`）。
- `readTask` 被 session-context、doctor、workflow-service、两个 adapter 广泛调用：`packages/core/src/service/session-context.ts:298`、`packages/core/src/service/doctor-tasks.ts:33` 与 `:45`、`packages/core/src/service/workflow-service.ts`、`packages/adapter-*/src/*.ts`。因此 `normalizeTaskRecord` 的任何新增字段都必须可缺省，不能改变既有调用方的分支条件。

## 建议与未验证事项（供实现前定夺，不阻塞本报告）

1. `case` 记录的字段形状（`required` / `state` / `confirmed{hash,at,summary}` / `designChildId`？）没有既有约定，属实现决策；R16 的「生命周期状态可供后续技能读取」需要在 `TaskCaseRecord` 里显式落字段，未验证哪种命名最利于后续两个技能读取。
2. 覆盖率校验的「变更代码文件」来源未定：`relatedFiles` 无写入方（`packages/core/src/domain/task-store.js:399`），`gitStatusSync` 只给文本。是用 CASE 声明的 `Scope` 列表、`implement.jsonl` 的 file 字段，还是 git diff，属未验证的设计选择。
3. `case-evidence/` 与 `coverage/` 相对路径的越界校验需要新工具函数：现有 `insideWorkloom` 只防逃出 `.workloom`（`packages/core/src/domain/locate.js:95-102`），不防逃出任务目录；R18 的「证据/覆盖率路径校验」必须在这一层再收窄一次。
4. `not_applicable` 的「全部排除文件」判定需要源码可统计性规则（R11），core 不绑定语言与工具（父 PRD 明确「采集工具由任务项目决定」，`.workloom/tasks/11-03-check-case-coverage/prd.md:236`），因此该规则只能基于 CASE 的 `Coverage.Exclusions` 自洽性校验，不能做真实可执行性判断——属能力边界，未验证是否有更严的可行做法。
5. 迁移提示的展示面（session context / doctor / tool note）三选一未定，见上文对应小节的取舍分析。
6. 本报告未运行任何测试（只读调查），因此「既有测试当前是否全绿」未验证；实现前应以 `cd packages/core && node --test test/*.test.js` 建立基线。
