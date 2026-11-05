# 为 check 流程增加 CASE 文档与覆盖率验证

## Goal

把完整任务的 check 从“实施结束后的临时审查”改为“先有可审核的 CASE，再按 CASE 验收”的两阶段流程。实施与 CASE 设计并行开展；同一 check 会话先设计 CASE，后执行静态代码审查、真实运行用例和代码覆盖率采集。另提供两个技能，分别给未归档任务和已归档任务补充 CASE，并继续完成真实用例执行与覆盖率采集。

## Requirements

- R1：完整实施任务开始实施前必须具有符合现有编写要求的 `plan.md`；已声明子任务、只负责协调和最终验收的父任务豁免 PLAN，轻量任务维持现有规则。
- R2：完整任务新增 2.2 Design CASE 步骤，原 Check 和 Commit 分别调整为 2.3 和 2.4；轻量流程不采用这套 CASE 步骤。
- R3：完整任务开始实施后，主会话同时派发实施工作和 check 的 CASE 设计工作；CASE 设计以 PRD 和 PLAN 为依据。
- R4：check 在任务目录生成 `case.md`，包含静态代码审查路径、真实运行用例和覆盖率采集方式；每个真实运行用例包含前置条件、执行步骤和预期结果。
- R5：主会话审核 `case.md`，发现问题时继续原 check 会话修改；主会话认可后提交用户确认。实施工作无需等待 CASE 确认，静态审查和用例执行必须等待确认；确认后的 CASE 再修改时必须重新确认。
- R6：确认后的 CASE 设计与执行结果分开保存：`case.md` 保存设计，`case-result.md` 保存逐项结果与覆盖率摘要，`coverage/` 保存原始覆盖率报告。
- R7：实施完成后，主会话继续原 check 会话，由 check 先完成静态代码审查，再逐项执行真实运行用例，并报告发现的问题或通过结果。
- R8：真实运行用例完成后必须生成覆盖率结果，至少展示总体行覆盖率、变更代码文件的行覆盖率和未覆盖行，并保留完整明细；不设置统一数值通过门槛，可执行代码的覆盖率采集失败时 check 不得通过。
- R9：check 通过并记录结果后，任务才允许进入提交和归档；归档前没有仍在运行的相关派发。
- R10：`workloom-case-active` 技能面向 planning 和 in_progress 任务，生成或补齐 `case.md`，并完成审核与确认。
- R11：使用未归档补写技能时，实施未完成的任务等待实施完成后再执行 CASE，实施已完成的任务立即执行；两种情况下最终都必须完成真实用例和覆盖率采集。
- R12：`workloom-case-archived` 技能把历史任务复制为一个独立完整新任务，在新任务中重建并执行 CASE；原归档目录及其任务状态、历史 check 结论保持不变。
- R13：读取历史任务材料时，PRD 始终是需求依据；存在 `plan.md` 时以 PLAN 为实施依据，不存在时以旧版 `design.md` 和 `implement.md` 为实施依据；两类实施依据都缺失时允许只依据 PRD 和代码确定审查范围，并在 CASE 中明确标注。
- R14：已归档复制出的新任务默认验证当前目标分支，也允许用户指定提交号或分支；新任务记录代码基准，重新形成 PRD 和 PLAN，经用户确认后开始，完成后独立归档。
- R15：两个补写技能与正常任务流程共用 CASE 结构、执行结果结构、覆盖率展示要求和问题分级规则。
- R16：核心逻辑、流程资产、DSH adapter 和 Pi adapter 同步支持新流程；步骤集合变化时同步提升流程版本和协议常量。
- R17：新增 `workloom_task_case` 工具提供 CASE 审核和确认能力，记录确认时的 CASE 摘要值；最终 check 工具验证确认状态、结果文件和覆盖率结果。
- R18：真实用例因环境缺失或安全风险无法执行时标记为 blocked 并停止后续执行；主会话报告用户，只有用户调整环境或重新确认验收依据后才能继续，blocked 用例不能记录为通过。
- R19：当前任务作为父任务，依次拆成“主流程与覆盖率”“未归档补写技能”“已归档补写技能”三个子任务；每个子任务独立走完生命周期，父任务在三个子任务归档后完成最终验收。
- R20：`case.md` 和 `case-result.md` 分别使用本 PRD 的固定模板；大段输出、截图和日志保存到 `case-evidence/`，结果文档保存相对路径。
- R21：只有变更范围不含可统计源代码时，覆盖率才能标记 `not_applicable` 并免除百分比与原始报告；必须在结果中列出排除文件和原因，存在可统计源代码时的采集失败仍为 `failed`。
- R22：`workloom-case-active` 和 `workloom-case-archived` 各准备至少 3 个真实提示词做带技能验收，保存验收结论和关键证据，不生成评分、benchmark 或静态审阅页。不带技能组不是必需验收项，既有观察材料不参与通过判定。
- R23：当前父任务不编写 `plan.md`，只保留 PRD、子任务清单和最终验收记录；三个子任务仍分别编写符合要求的 PLAN。

## Acceptance Criteria

- AC1（覆盖 R1、R23）：验证完整任务开始条件；完整实施任务缺少有效 `plan.md` 时开始失败，提供有效 PLAN 后允许开始。带已声明子任务的父任务无 PLAN 也可进入最终验收，轻量任务仍按现有最低要求开始。
- AC2（覆盖 R2、R16）：读取完整流程与轻量流程；完整流程依次展示 2.1 Implement、2.2 Design CASE、2.3 Check、2.4 Commit，轻量流程保持原步骤。版本与协议常量一致。
- AC3（覆盖 R3）：在一个完整任务的实施阶段观察派发记录；实施派发与 CASE 设计派发可以并行运行，且两者读取同一任务的 PRD 和 PLAN。
- AC4（覆盖 R4、R15）：读取正常流程和补写技能生成的 `case.md`；文档均包含静态代码审查路径、覆盖率采集方式，以及带前置条件、执行步骤和预期结果的真实运行用例。
- AC5（覆盖 R5、R17）：让主会话对 CASE 提出修改意见；系统继续同一 check 会话修订。CASE 未确认时实施可继续，但执行被拒绝；确认后再修改会因摘要值变化而重新要求确认。
- AC6（覆盖 R6）：完成一次 CASE 执行后检查任务目录；`case.md`、`case-result.md` 和 `coverage/` 分别保存设计、结果摘要与原始报告，执行结果不会改写已确认的设计。
- AC7（覆盖 R7）：实施完成后继续同一 check 会话；其报告包含静态代码审查结果、逐项用例执行结果，以及未解决问题或通过结论。
- AC8（覆盖 R8）：真实运行用例完成后查看覆盖率结果；可以看到总体行覆盖率、变更代码文件行覆盖率、未覆盖行和完整明细。模拟可执行代码采集失败时，check 通过条件拒绝记录通过。
- AC9（覆盖 R9）：尝试在 check 未通过时归档任务；工具拒绝归档。check 通过且相关派发全部结束后，归档成功。
- AC10（覆盖 R10、R11）：分别对 planning、实施中的 in_progress、实施完成的 in_progress 任务使用 `workloom-case-active`；前两者在实施完成后继续执行，后者立即执行，最终均生成真实用例结果和覆盖率结果。
- AC11（覆盖 R12、R14）：使用 `workloom-case-archived` 创建新任务；默认代码基准为当前目标分支，指定提交号或分支时使用指定基准。新任务独立完成规划、确认、执行和归档，原归档文件的摘要值与任务状态不变化。
- AC12（覆盖 R13）：分别选择带 `plan.md`、只有 `design.md` + `implement.md`、只有 PRD 的历史任务；新任务引用正确的材料，只有 PRD 的 CASE 明确标注实施文档缺失。
- AC13（覆盖 R15）：对两个补写技能各执行一次包含失败用例的验证；其问题分级、结果记录和覆盖率缺失处理与正常 check 流程一致。
- AC14（覆盖 R16）：运行 core、adapter-dsh、adapter-pi 的相关自动化测试，以及 lint、typecheck 和 build；所有命令通过。
- AC15（test-first 边界）：先为核心任务通过条件、CASE 确认状态、同一 check 会话续用、归档限制和两个 adapter 的对外行为编写失败测试，再实现对应行为；文档与提示词调整不机械套用 test-first。
- AC16（覆盖 R17）：对确认后的 `case.md` 做一次内容修改；`workloom_task_case` 审核得到不同摘要值，旧确认不能通过最终 check，重新确认后恢复有效。
- AC17（覆盖 R18）：模拟一个因环境缺失无法执行的真实用例；结果标记为 blocked，后续用例停止，最终 check 拒绝通过。用户调整依据并重新确认后才能继续。
- AC18（覆盖 R19）：检查父任务记录；三个子任务按声明顺序分别完成并归档，父任务最后进行整体验收和归档。
- AC19（覆盖 R20）：对照本 PRD 的 CASE Document Format 和 CASE Result Format 检查实际文件；元数据、固定章节、编号、状态值、溯源表和证据相对路径全部符合模板。
- AC20（覆盖 R21）：分别验证纯文档变更和包含可统计源代码的变更；前者只有在列出全部排除文件与原因后才允许 `not_applicable`，后者采集失败必须标记 `failed` 且 check 不通过。
- AC21（覆盖 R22）：对两个技能分别运行至少 3 组带技能验收；检查提示词、验收结论和关键证据均存在，不生成评分、benchmark 或静态审阅页。不带技能材料不参与通过判定。

## CASE Document Format

章节名和字段名固定为英文，正文语言跟随 PRD。`SR` 表示静态审查项，`C` 表示真实运行用例。每个 AC 至少对应一个 SR 或 C，每个变更代码文件至少对应一个 SR；文档只描述验证设计，不写执行状态。

~~~markdown
---
version: 1
task: <task-relative-path>
---

# CASE: <task-title>

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `<branch/worktree-or-selected-ref>`
- Source task: `<archived-task-path-or-none>`

## Scope

- Requirements: `<R-numbers>`
- Acceptance criteria: `<AC-numbers>`
- Out of scope:
  - `<item>`

## Static Review

### SR1 <title>

- Covers: `<AC-numbers>`
- Target: `<file-path>#<symbol-or-whole-file>`
- Checks:
  1. `<structure/type/naming/behavior/spec-check>`
- Expected: `<decidable-code-property>`

## Runtime Cases

### C1 <title>

- Covers: `<AC-numbers>`
- Preconditions:
  1. `<environment/dependency/data/service-condition>`
- Steps:
  1. `<action-or-command>`
  2. `<action-or-command>`
- Expected:
  1. `<observable-result>`
- Evidence:
  - `<output/log/screenshot-to-capture>`
- Cleanup: `<restore-action-or-none>`

## Coverage

- Tool: `<project-appropriate-tool-and-version>`
- Instrumentation: `<how-runtime-cases-run-with-coverage>`
- Aggregate command:
  ```bash
  <command>
  ```
- Scope: `<project-source-and-changed-executable-files>`
- Exclusions:
  - `<path>: <reason>`
- Raw outputs:
  - `coverage/<tool-native-report>`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR2 | C2 |
~~~

没有 PLAN 时，`Implementation` 改列 `design.md` 和 `implement.md`；两类实施文档都缺失时，固定写 `missing; PRD and code only`。

## CASE Result Format

大段输出、截图和日志放在 `case-evidence/`，结果文档只保留摘要与相对路径。`caseHash` 必须对应用户确认的版本。总体状态为 `passed` 时，所有用例必须通过，标准验证必须通过，覆盖率必须为 `generated` 或符合条件的 `not_applicable`，且没有未解决问题。某个用例为 `blocked` 时，后续用例保持 `pending`，总体状态不能为 `passed`。

~~~markdown
---
version: 1
task: <task-relative-path>
caseHash: <confirmed-case-sha256>
codeBaseline: <branch-head-worktree-or-selected-ref>
checkSession: <check-child-session-id>
status: <in_progress|passed|failed>
startedAt: <ISO-8601>
completedAt: <ISO-8601-or-empty>
---

# CASE Result: <task-title>

## Summary

- Static review: `<passed-count>/<total-count>`
- Runtime cases: `<passed-count>/<total-count>; blocked: <count>`
- Coverage: `<generated|not_applicable|failed>`
- Standard verification: `<passed|failed|pending>`

## Static Review Results

### SR1 <title>

- Status: `<pending|passed|failed>`
- Evidence: `<inspected-code-and-observation>`
- Findings: `<file:line-or-none>`

## Runtime Results

### C1 <title>

- Status: `<pending|passed|failed|blocked>`
- Executed at: `<ISO-8601-or-empty>`
- Actions:
  1. `<actual-action-or-command>`
- Observed: `<actual-result-against-expectation>`
- Evidence:
  - `case-evidence/<log-screenshot-or-output>`
- Findings: `<file:line-or-none>`

## Coverage

- Status: `<generated|not_applicable|failed>`
- Tool: `<tool-and-version>`
- Command: `<actual-command>`
- Overall lines: `<covered>/<total> (<percentage>)`
- Raw reports:
  - `coverage/<tool-native-report>`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `<path>` | `<n>/<n>` | `<percentage>` | `<line-ranges>` | `coverage/<details>` |

### Exclusions

| Path | Reason |
| --- | --- |
| `<path>` | `<reason>` |

### Collection Failure

`<error-and-evidence-or-none>`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `<command>` | `<code>` | `<output-or-file>` |

## Resolved Findings

- `<file>:<line> [P2] <issue> — fixed: <resolution>`
- `<none-when-empty>`

## Open issues

- `<file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>`
- `<none-when-empty>`
~~~

只有变更范围不含可统计源代码时，覆盖率状态才能写 `not_applicable`，并在 Exclusions 中列出全部相关文件和原因；此时不要求百分比或原始报告。存在可统计源代码但采集失败时必须写 `failed`，check 不得通过。`Open issues` 沿用现有 check 格式并放在文档末尾。

## Subtask Candidates

1. **完整任务增加 CASE 设计、执行与覆盖率**：交付主流程步骤、CASE 工具、统一模板、同一会话续用、覆盖率结果和通过条件，以及双 adapter 支持；这是两个补写技能的共同基础。
2. **新增 workloom-case-active 技能**：交付 planning/in_progress 任务的 CASE 补写、按实施就绪状态执行、技能注册和行为验收。
3. **新增 workloom-case-archived 技能**：交付历史材料复制、独立新任务生命周期、当前或指定代码基准、旧版文档回退和行为验收。

父任务保持 planning，只在 1.4 用户确认拆分后创建子任务。三个子任务按上述顺序执行并归档，父任务最后进行整体集成验收。

## Notes

- 本任务不改变 frontend executor 的既有职责；涉及前端展示的实施仍由 frontend executor 完成。
- 本任务不涉及前端页面展示，因此无需 `## UI Design` 小节。
- 新 CASE 流程只适用于完整任务；轻量任务继续由主会话实施和自查。
- 覆盖率用于展示真实用例实际执行情况，不设置统一百分比要求；具体采集工具由任务项目决定，不在 core 中绑定单一语言或工具。
- 已归档技能只复制历史材料到新任务，不直接修改 archive 目录。抽查的历史任务通常没有最终提交号，因此默认验证当前目标分支，结果不得表述为历史当时的执行证据。
- 仓库已存在多批只有 `design.md` 和 `implement.md` 的历史任务，补写技能必须支持这类材料。
- 两个补写技能都需要继续执行真实用例和覆盖率采集，不能只生成文档。
- 父任务保持 planning，不编写 PLAN；子任务只能在 1.4 审阅包得到用户确认后创建，顺序为主流程、未归档补写、已归档补写。
- 技能对比验收只在两个技能子任务中执行；主流程子任务使用仓库自动化测试和真实场景验证，不额外生成技能对比页面。
- 相关现状：[workflow.md](../../../packages/assets/workflow/workflow.md) 的 2.1 只描述实施，2.2 在实施后才派发 check；当前没有 CASE 设计、CASE 确认和覆盖率采集环节。

## Alignment Decisions

- 已选择：完整任务必须提供 PLAN；轻量任务维持现有规则。
- 已选择：新增 2.2 Design CASE，后续步骤顺延编号。
- 已选择：实施与 CASE 设计并行；实施不等待 CASE 用户确认，执行必须等待。
- 已选择：CASE 确认后再次修改需要重新确认。
- 已选择：CASE 设计、执行结果和原始覆盖率报告分开保存。
- 已选择：覆盖率展示总体、变更代码文件和未覆盖行，不强制逐用例单独统计。
- 已选择：可执行代码必须生成覆盖率报告，但不设置统一数值门槛；采集失败不能记录 check 通过。
- 已选择：新流程只应用于完整任务。
- 已选择：未归档补写按实施就绪状态执行，已归档补写复制到独立完整新任务执行。
- 已选择：历史代码默认使用当前目标分支，允许用户指定提交号或分支。
- 已选择：历史材料优先使用 PLAN，其次使用旧版 design/implement，最后允许只依据 PRD 和代码并明确标注。
- 已选择：无法执行的真实用例标记 blocked，不得跳过或改用其他测试代替。
- 已选择：技能命名为 `workloom-case-active` 和 `workloom-case-archived`。
- 已选择：新增 `workloom_task_case` 持久记录 CASE 审核与确认摘要值。
- 已选择：关键路径采用 test-first，边界为核心任务通过条件、CASE 确认、会话续用、归档限制和 adapter 对外行为。
- 已选择：拆成三个顺序子任务，当前任务作为父任务最终验收。
- 已选择：CASE 使用 YAML 元数据、固定英文章节和字段、SR/C 编号及 AC 溯源表，正文语言跟随 PRD。
- 已选择：RESULT 使用固定元数据与状态值，保留实际动作、观察结果、证据、覆盖率、已修复问题和未解决问题。
- 已选择：大段证据保存到 `case-evidence/`，`Open issues` 沿用现有格式并置于 RESULT 末尾。
- 已选择：只有没有可统计源代码时允许覆盖率 `not_applicable`，且必须列出排除文件与原因。
- 已选择：两个技能各用至少 3 个真实提示词进行带技能验收，只报告验收结论和关键证据，不生成评分、benchmark 或静态审阅页。
- 已选择：父任务不编写 PLAN；只负责协调的父任务豁免 PLAN，三个实施子任务仍各自编写 PLAN。
- 否决：父任务编写协调 PLAN，因为会重复三个子任务的实施细节。
- 否决：只验证技能文件存在，因为无法证明技能对 CASE 质量的实际改善。
- 开放节点：无。
- 收敛摘要：已覆盖目标与价值、范围与非目标、runtime 与仓库约束、可观察验收、UI 不适用、关键路径 test-first、外部工具与技能名称、文档格式、覆盖率边界、失败路径、历史材料兼容、技能对比验收和任务拆分；所有决策均有明确结果，无剩余假设。

<!-- workloom:open-nodes=none -->
