---
version: 1
task: tasks/11-03-check-case-coverage
---

# CASE: 为 check 流程增加 CASE 文档与覆盖率验证

## References

- PRD: `prd.md`
- Implementation: 父任务无自有 PLAN（R23 已确认豁免）；以下按 task.children 顺序引用三个子任务的 PLAN，主路径为归档位置。
  - `.workloom/tasks/archive/2026-11/full-task-case-coverage/plan.md`（task.children 声明为 `tasks/11-03-full-task-case-coverage/plan.md`，实际目录已归档）
  - `.workloom/tasks/archive/2026-11/case-active-skill/plan.md`（task.children 声明为 `tasks/11-03-case-active-skill/plan.md`，实际目录已归档）
  - `.workloom/tasks/archive/2026-11/case-archived-skill/plan.md`（task.children 声明为 `tasks/11-03-case-archived-skill/plan.md`，实际目录已归档）
- Code target: `workloom/11-03-check-case-coverage @ a602791 + P1 工作区修复（uncommitted；worktree .workloom/worktree/11-03-check-case-coverage，base main）`
- Source task: `none`

## Scope

- Requirements: `R1–R23`
- Acceptance criteria: `AC1–AC21`
- Out of scope:
  - `重跑三个子任务的真实模型评测、技能对比与不带技能组材料；父任务只核对已归档结论与关键证据。`
  - `生成评分、benchmark 或静态审阅页；父任务不新增这三类产物。`
  - `修改已归档子任务目录、状态、CASE、RESULT 与覆盖率原始报告。`
  - `子任务内部的逐文件实现细节；它们由各自已确认的 CASE 覆盖。`
  - `DSH profile 依赖锁重钉、宿主重启与线上生效；按 deployment 规范由用户执行。`

## Static Review

### SR1 流程步骤、版本与任务分流

- Covers: `AC1、AC2`
- Target: `packages/assets/workflow/workflow.md#frontmatter-and-phase-2`
- Checks:
  1. front-matter `version: 25` 与 `packages/core/src/domain/protocol.js` 的 `WORKFLOW_PROTOCOL_VERSION` 相等。
  2. Phase 2 的 `####` 步骤依次为 `2.1 Implement`、`2.2 Design CASE`、`2.3 Check`、`2.4 Commit`，无缺号或重排。
  3. 轻量任务仍由主会话实施与自查，不进入 CASE 设计或执行步骤。
  4. 1.4 与 planning 指引要求完整实施任务必须有 PLAN，只有已声明子任务的父任务豁免；父任务在全部子任务归档后才 check 与 archive。
  5. 2.2 声明容器任务按 task.children 顺序列出子任务 PLAN。
- Expected: 五项文本均可定位，且与 R1、R2、R16、R19、R23 的约束一致。

### SR2 CASE 模板、结构校验与确认摘要

- Covers: `AC4、AC5、AC16、AC19`
- Target: `packages/core/src/domain/case.js#inspectCaseStructure`
- Checks:
  1. 固定六章、References/Scope/Coverage 字段、SR/C 连号、AC 全量溯源与子任务 PLAN 顺序均有校验与问题码。
  2. 模板资产 `packages/assets/templates/case.md` 的章节、字段、编号与 PRD 的 CASE Document Format 一致。
  3. `computeCaseHash` 对全文计算 SHA-256 小写 hex；`evaluateCaseExecutionGate` 在未确认或摘要过期时拒绝执行。
  4. `workloom_task_case` confirm 只在校验无问题且 expectedCaseHash 匹配后记录摘要与 designSession。
- Expected: 四项实现成立；`packages/core/test/case.test.js` 与 `packages/assets/test/case-templates.test.js` 覆盖对应错误码。

### SR3 CASE 结果、覆盖率与失败路径

- Covers: `AC6、AC7、AC8、AC17、AC20`
- Target: `packages/core/src/domain/case.js#evaluateCaseOutcomeGate`
- Checks:
  1. RESULT 固定七章、元数据、caseHash、会话链、逐项 passed、标准验证 exit 0 与末尾 `Open issues` 为 `- none` 全部校验。
  2. 覆盖率只接受 `generated` 或 `not_applicable`；`not_applicable` 要求可覆盖文件为空、总行数为 N/A、排除项与原因非空；`failed` 与缺失拒绝。
  3. 任一 SR/C 非 passed 即拒绝通过；blocked 用例使后续保持 pending，整体不能为 passed。
  4. CASE 设计、RESULT 与原始报告分文件保存；执行结果不改写已确认的 case.md。
- Expected: 上述分支均有实现与单元测试，错误码与 PRD 的 CASE Result Format 一一对应。

### SR4 check 与 archive 门禁及父任务归档顺序

- Covers: `AC9、AC18`
- Target: `packages/core/src/domain/task-store.js#archiveTaskInternal`
- Checks:
  1. `checkTaskInternal` 先求值 CASE outcome gate，核心失败不可 force；通过后记录 `case.result` 摘要。
  2. `archiveTaskInternal` 要求 RESULT 已记录且与当前一致，并要求存在 check 记录；核心失败不可 force。
  3. workflow 与 workflow spec 要求归档前 check 通过、相关派发静止、全部子任务已归档。
- Expected: 门禁顺序与错误文案一致；`packages/core/test/case.test.js` 的 check/archive 拒绝用例通过。

### SR5 DSH adapter 对外行为

- Covers: `AC2、AC14、AC16、AC17`
- Target: `packages/adapter-dsh/src/tasks.ts#taskCaseTool`
- Checks:
  1. 注册 `workloom_task_case`，review/confirm 参数、expectedCaseHash 与 summary 完整，主会话限制生效。
  2. check 派发支持 `case-design` 与 `execution` 两种 purpose；CASE 未确认或过期时 execution 被拒绝。
  3. CASE 两份模板注入 check 派发，技能清单包含两个补写技能。
  4. `src` 与 `dist` 在同一实现提交内更新。
- Expected: adapter-dsh 的 case、case-executor 与 skills 测试通过，dist 与 src 同步。

### SR6 Pi adapter 对外行为

- Covers: `AC2、AC14、AC16、AC17`
- Target: `packages/adapter-pi/src/tasks.ts#taskCaseTool`
- Checks:
  1. Pi 注册同名 `workloom_task_case` 工具，并透传 `executeTaskCase` 与会话 key。
  2. `purpose` 参数透传；check 派发注入两份 CASE 模板。
  3. skill 同步清单包含两个补写技能，Pi 构建副本由 `sync-skills` 生成。
- Expected: adapter-pi 的 case、case-executor 与 skills 测试通过，对外行为与 DSH 一致。

### SR7 workloom-case-active 技能与验收证据

- Covers: `AC10、AC13、AC21`
- Target: `packages/assets/skills/workloom-case-active/SKILL.md#whole-file`
- Checks:
  1. 范围只含 planning 与 in_progress 的 full 任务；completed、archive 与 light 明确分流或拒绝。
  2. 实施未完成时在确认后等待，实施完成时立即执行；复用原 designSession，blocked 停止后续并上报。
  3. 与正常流程共用 CASE 结构、RESULT 结构、覆盖率展示与问题分级；P2 自修，P0/P1 交主会话。
  4. evals 至少 3 个真实提示词（实际 5 个带技能运行），保存验收结论与关键证据；不把不带技能材料作为通过依据。
- Expected: 技能正文与 R10、R11、R15、R22 一致；`packages/adapter-dsh/test/skills.test.js` 等注册测试通过。

### SR8 workloom-case-archived 技能与验收证据

- Covers: `AC11、AC12、AC13、AC21`
- Target: `packages/assets/skills/workloom-case-archived/SKILL.md#whole-file`
- Checks:
  1. 把历史任务复制为独立完整新任务，原归档目录、状态与历史 CASE/RESULT 保持不变。
  2. 默认验证当前目标分支，允许用户指定提交号或分支；新任务记录代码基准并重新形成 PRD 与 PLAN。
  3. 材料优先级为 `plan.md`、`design.md` + `implement.md`、仅 PRD；仅 PRD 时在 CASE 明确标注实施文档缺失。
  4. evals 至少 3 个真实提示词（实际 5 个带技能运行），保存验收结论与关键证据；不新增评分、benchmark 或静态审阅页。
- Expected: 技能正文与 R12、R13、R14、R15、R22 一致；两个技能共用同一 CASE 与结果结构。

### SR9 父任务记录、并行派发与 test-first 证据

- Covers: `AC3、AC15、AC18、AC19`
- Target: `.workloom/tasks/11-03-check-case-coverage/task.json#children-and-dispatches`
- Checks:
  1. children 顺序为 full-task-case-coverage、case-active-skill、case-archived-skill，三个归档任务的 `status`、`check.passedAt`、`case.result` 均存在。
  2. 主流程子任务的 dispatches 显示 CASE 设计与实施在同一时刻并行派发，CASE 修订继续同一 check child。
  3. 三个子任务的 case.md 与 case-result.md 摘要值、覆盖率原始报告与证据路径可核对。
  4. 子任务 case-result 或 case-evidence 记录核心、DSH、Pi 的先红后绿证据；文档与提示词调整不机械套用 test-first。
- Expected: 四项证据成立；任一摘要、状态或证据缺失阻塞父任务最终验收。

### SR10 归档子任务 PLAN 的 CASE 复核回退

- Covers: `AC5、AC18`
- Target: `packages/core/src/service/case-service.ts#reviewCase`
- Checks:
  1. 先读 `task.children` 的当前路径；缺失时按任务名调用 `findArchivedTaskPath` 回退读取归档目录的 `plan.md`。
  2. 当前路径与归档路径都缺失时才保留 `parent_plan_missing`，错误消息仍使用原 child 路径。
  3. 回退只读，不修改 task.json、children、归档目录或 CASE 内容。
  4. 结构校验、确认摘要与最终门禁逻辑保持不变。
- Expected: 子任务归档后父任务 review 不再报 `parent_plan_missing`；两处都缺失时仍明确拒绝。

### SR11 归档任务查找语义

- Covers: `AC5、AC18`
- Target: `packages/core/src/domain/task-store.js#findArchivedTaskPath`
- Checks:
  1. 只在 `tasks/archive/<YYYY-MM>/` 下查找，月份目录按名降序，同名取最新月份。
  2. 候选名先原样匹配，再剥离活动目录的 `MM-DD-` 前缀后匹配归档 slug。
  3. 归档根缺失或未命中时返回 null；命中时返回 `.workloom` 相对路径，不产生写操作。
  4. `packages/core/dist/domain/task-store.js` 与 src 同步（同一工作区变更或同一提交）。
- Expected: 查找语义与 JSDoc 一致，跨月份确定取最新，失败返回 null。

### SR12 归档查找的类型声明与导出

- Covers: `AC5、AC14、AC18`
- Target: `packages/core/src/domain/task-store.d.ts#findArchivedTaskPath`
- Checks:
  1. 参数、返回类型与 JSDoc 与实现一致，导出名可从 core 包类型面到达。
  2. `packages/core/dist/domain/task-store.d.ts` 与手写锚点同步，`dist-dts` 测试通过。
  3. 不引入与既有任务记录类型冲突的字段或可选性变化。
- Expected: typecheck 与 build 通过，手写声明与 dist 锚点无差异。

### SR13 归档父任务复核的回归测试

- Covers: `AC5、AC15、AC18`
- Target: `packages/core/test/case.test.js#子任务归档后父任务 CASE review 从归档目录解析 PLAN`
- Checks:
  1. 夹具同时覆盖归档目录 slug 与活动目录 `MM-DD-` 前缀两种布局。
  2. 归档存在时 `structureIssues` 为空且 `readyToConfirm` 为 true。
  3. 删除归档后仍返回两条 `parent_plan_missing`，消息使用原 child 路径。
  4. 使用真实临时任务目录与 git 仓库，不依赖本机真实归档数据。
- Expected: 新测试在 core 套件内通过，既有 CASE 测试断言不被弱化。

## Runtime Cases

### C1 全量标准验证

- Covers: `AC14、AC15`
- Preconditions:
  1. 在 `.workloom/worktree/11-03-check-case-coverage` 内执行，`node_modules` 已安装。
  2. 代码基准为 a602791 + P1 工作区修复（或修复提交后的等价状态），worktree 中 core 的 src/dist 已同步。
- Steps:
  1. 运行 `pnpm lint`。
  2. 运行 `pnpm -r typecheck`。
  3. 运行 `pnpm -r build`。
  4. 运行 `cd packages/core && node --test test/*.test.js`。
  5. 运行 `cd packages/adapter-dsh && node --test test/*.test.js`。
  6. 运行 `cd packages/adapter-pi && bun test test/*.test.ts`。
  7. 运行 `cd packages/assets && node --test test/*.test.js skills/workloom-case-active/scripts/task-fingerprint.test.mjs skills/workloom-case-archived/scripts/archived-tasks.test.mjs`。
  8. 汇总每条命令的 exit code、失败数与测试统计到证据文件。
- Expected:
  1. 全部命令 exit 0，lint 无 error/warning，typecheck 无报错，build 成功。
  2. 测试包含 CASE 相关套件（core 的 case/protocol/contract-asset、DSH 与 Pi 的 case/case-executor/skills、assets 的 case-templates），全部 pass。
- Evidence:
  - `case-evidence/c1-lint.log`
  - `case-evidence/c1-typecheck.log`
  - `case-evidence/c1-build.log`
  - `case-evidence/c1-core-test.log`
  - `case-evidence/c1-dsh-test.log`
  - `case-evidence/c1-pi-test.log`
  - `case-evidence/c1-assets-test.log`
  - `case-evidence/c1-summary.txt`
- Cleanup: `none（构建产物差异只记录，不提交）。`

### C2 流程版本与双 adapter 一致性

- Covers: `AC2、AC16`
- Preconditions:
  1. 代码基准 a602791 的 worktree 可读。
- Steps:
  1. 读取 workflow 的 front-matter version 与 Phase 2 步骤列表，断言 version 为 25、步骤为 2.1–2.4。
  2. 读取 `packages/core/dist/domain/protocol.js` 的 `WORKFLOW_PROTOCOL_VERSION`，断言同为 25。
  3. 断言 DSH 与 Pi 的 tasks 源码都注册 `TOOL_NAMES.taskCase`，且各自 skills 清单都包含两个补写技能。
  4. 对比 `packages/core/src` 与 `packages/core/dist` 的本次变更（工作区或最近提交），确认修复文件成对更新，无陈旧产物。
- Expected:
  1. 版本、步骤、工具名与技能清单全部一致。
  2. core 与 adapter-dsh 的 dist 与 src 同步；工作区修复提交后，最近实现提交一致。
- Evidence:
  - `case-evidence/c2-version-adapter-consistency.txt`
- Cleanup: `none`

### C3 子任务归档状态与顺序

- Covers: `AC9、AC18`
- Preconditions:
  1. 三个子任务目录已位于 `.workloom/tasks/archive/2026-11/`。
- Steps:
  1. 用 `jq` 读取父任务 task.json 的 children 数组，断言顺序为完整任务、未归档补写、已归档补写。
  2. 逐个读取三个子任务的 task.json，断言 `status: completed`、`completedAt` 非空、`check.passedAt` 与 `check.summary` 非空、`case.result` 存在。
  3. 检查父任务 dispatches，断言除当前 check 外没有 running 记录，且没有仍在等待的相关派发。
  4. 保存核对结果与关键字段摘要，供主会话在记录 check 后复核归档前置。
- Expected:
  1. 三个子任务按声明顺序全部归档，且都有 check 通过记录。
  2. 父任务侧满足归档前置的静态条件：子任务齐全、children 顺序正确、除本轮 check 外派发静止；父任务 check 记录由主会话在本 CASE 通过后写入。
- Evidence:
  - `case-evidence/c3-child-archive.json`
  - `case-evidence/c3-summary.txt`
- Cleanup: `none`

### C4 CASE、RESULT、覆盖率与技能验收证据核对

- Covers: `AC6、AC7、AC8、AC10、AC13、AC19、AC20、AC21`
- Preconditions:
  1. 三个归档子任务目录可读，`sha256sum` 与 `jq` 可用。
- Steps:
  1. 对每个子任务比较 `sha256sum case.md` 与 task.json 的 `case.caseHash`，比较 `sha256sum case-result.md` 与 `case.result.resultHash`。
  2. 校验每个 case-result 的覆盖率状态、总体行覆盖率、变更文件行覆盖率与未覆盖行；未覆盖行与原始报告在 `coverage/` 内可定位。
  3. 解析 case-result 中引用的 `coverage/` 与 `case-evidence/` 路径，断言文件都存在。
  4. 检查两个技能的 evals：每组至少 3 个真实提示词、带技能运行结果、验收结论与关键证据；父任务不新增评分、benchmark 或静态审阅页。
- Expected:
  1. 三组摘要值与文件内容一致，覆盖率报告与证据路径全部可解析。
  2. 两个技能都满足至少 3 组真实带技能验收，且父任务没有新增评分、benchmark 或静态审阅页。
- Evidence:
  - `case-evidence/c4-sha256.txt`
  - `case-evidence/c4-evidence-check.txt`
- Cleanup: `none`

### C5 父任务最终验收前置状态

- Covers: `AC1、AC3、AC18`
- Preconditions:
  1. 当前 check 会话可读父任务 task.json 与任务目录。
- Steps:
  1. 断言父任务 `status` 为 in_progress、`stage` 为 check、`alignment.prdHash` 与当前 prd.md 的摘要一致。
  2. 断言任务目录没有 plan.md，且父任务确为已声明子任务的容器任务。
  3. 断言父任务 children 中的三个任务名与 `.workloom/tasks/archive/2026-11/` 下的三个目录按名称一一对应，且除本轮 check 外没有 running 的相关派发。
  4. 记录最终验收结论的前置状态，供主会话在记录 check 时引用。
- Expected:
  1. 父任务满足最终验收前置条件：无 PLAN、子任务已按名称归档、alignment 与 prd.md 摘要一致、除本轮 check 外派发已静止。
  2. 本轮 check 结束并由主会话记录后，归档前复核 check.summary 非空且没有相关 running 派发；该复核不属于本用例的执行结果。
- Evidence:
  - `case-evidence/c5-parent-state.json`
  - `case-evidence/c5-summary.txt`
- Cleanup: `none`

### C6 归档后父任务 CASE review 回归

- Covers: `AC5、AC18`
- Preconditions:
  1. worktree 含 P1 修复且 core 的 src/dist 同步；父任务 children 仍指向归档前路径，三个子任务目录已位于 `.workloom/tasks/archive/2026-11/`。
  2. 当前 `case.md` 已是本次更新后的版本。
- Steps:
  1. 在 `packages/core` 运行 `node --test test/case.test.js`，确认归档父任务 review 的新测试通过。
  2. 从仓库根运行 `node --input-type=module -e "import { executeTaskCase } from './.workloom/worktree/11-03-check-case-coverage/packages/core/dist/service/case-service.js'; const [err, res] = executeTaskCase(process.cwd(), 'unused', { action: 'review', taskPath: 'tasks/11-03-check-case-coverage' }); console.log(JSON.stringify({ err: err?.message ?? null, readyToConfirm: res?.readyToConfirm, blockers: res?.confirmBlockers, caseHash: res?.caseHash }))"`。
  3. 核对 `readyToConfirm` 为 true、`blockers` 为空，且 `caseHash` 与当前 `case.md` 的摘要一致。
  4. 通过临时夹具复现“归档缺失”分支，确认仍返回 `parent_plan_missing`；不修改真实归档与任务记录。
- Expected:
  1. 新测试通过；父任务 review 不再返回 `parent_plan_missing`，`readyToConfirm` 为 true。
  2. 归档缺失时仍明确拒绝；真实归档目录与父任务 task.json 零变化。
- Evidence:
  - `case-evidence/c6-case-test.log`
  - `case-evidence/c6-archived-parent-review.log`
- Cleanup: `none（review 与临时夹具均只读，临时目录由脚本清理）`

## Coverage

- Tool: `Node v24.18.1 内置覆盖率（--experimental-test-coverage --test-reporter=lcov --enable-source-maps）`
- Instrumentation: `运行覆盖修复路径的 core CASE 测试文件 test/case.test.js；dist 经 source map 归因到 src；只保留本次变更的两个可执行文件。全量 core 套件作为 C1 标准验证单独执行，不混入覆盖率统计；测试、d.ts 锚点、dist 与 .workloom 元数据不混入。`
- Aggregate command:
  ```bash
  set -euo pipefail
  REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
  WT="$REPO/.workloom/worktree/11-03-check-case-coverage"
  TASK="$REPO/.workloom/tasks/11-03-check-case-coverage"
  mkdir -p "$TASK/coverage"
  (cd "$WT/packages/core" && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'test/case.test.js') \
    > "$TASK/coverage/lcov-core.info" 2> "$TASK/coverage/coverage-test.log"
  node "$TASK/coverage/filter-lcov.mjs" "$TASK/coverage"
  ```
- Scope:
  - `packages/core/src/service/case-service.ts`
  - `packages/core/src/domain/task-store.js`
- Exclusions:
  - `packages/core/src/domain/task-store.d.ts`: 类型声明锚点，无运行代码；由 SR12 与 dist-dts 测试覆盖。
  - `packages/core/test/`: 测试代码，由 C1 与 C6 的真实运行覆盖。
  - `packages/core/dist/`: tsc 构建产物，经 source map 归因到 src；不重复统计。
  - `packages/assets/workflow/workflow.md`: 子任务交付的流程资产，只读验收目标；覆盖率见 full-task-case-coverage。
  - `packages/core/src/domain/case.js`: 子任务交付的 CASE 结构与门禁实现，只读验收目标；覆盖率见 full-task-case-coverage。
  - `packages/adapter-dsh/src/tasks.ts`: 子任务交付的 DSH 工具面，只读验收目标；覆盖率见 full-task-case-coverage。
  - `packages/adapter-pi/src/tasks.ts`: 子任务交付的 Pi 工具面，只读验收目标；覆盖率见 full-task-case-coverage。
  - `packages/assets/skills/workloom-case-active/SKILL.md`: 技能文档资产，只读验收目标；运行行为由 case-active-skill 的 CASE 覆盖。
  - `packages/assets/skills/workloom-case-archived/SKILL.md`: 技能文档资产，只读验收目标；运行行为由 case-archived-skill 的 CASE 覆盖。
  - `.workloom/tasks/`: 任务记录、历史 CASE/RESULT 与证据文件，不计入代码覆盖率。
- Raw outputs:
  - `coverage/lcov-core.info`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
  - `coverage/uncovered.txt`
  - `coverage/coverage-test.log`
  - `coverage/core-test.log`
  - `coverage/filter-lcov.mjs`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C5 |
| AC2 | SR1, SR5, SR6 | C2 |
| AC3 | SR9 | C5 |
| AC4 | SR2, SR7, SR8 | - |
| AC5 | SR2, SR5, SR6, SR10, SR11, SR12, SR13 | C6 |
| AC6 | SR3 | C4 |
| AC7 | SR3 | C4 |
| AC8 | SR3 | C4 |
| AC9 | SR4 | C3 |
| AC10 | SR7 | C4 |
| AC11 | SR8 | - |
| AC12 | SR8 | - |
| AC13 | SR7, SR8 | C4 |
| AC14 | SR5, SR6, SR12 | C1 |
| AC15 | SR9, SR13 | C1 |
| AC16 | SR2, SR5, SR6 | C2 |
| AC17 | SR3, SR5, SR6 | - |
| AC18 | SR4, SR9, SR10, SR11, SR13 | C3, C5, C6 |
| AC19 | SR2, SR9 | C4 |
| AC20 | SR3 | C4 |
| AC21 | SR7, SR8 | C4 |
