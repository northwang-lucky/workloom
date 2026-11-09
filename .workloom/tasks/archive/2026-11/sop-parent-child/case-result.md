---
version: 1
task: tasks/11-06-sop-parent-child
codeBaseline: worktree .workloom/worktree/11-06-sop-parent-child @ branch workloom/11-06-sop-parent-child HEAD 5112cc7（work commit 未落，改动已 staged；CASE 先于 2.4 提交）codeFingerprint=ed69df581df377f65b2e6175497130c3217df27d40d79bc4487c439c3954f8b6
checkSession: 958aad09-b24c-4e33-b683-ae0444ab754f
status: passed
startedAt: 2026-11-09T09:58:37.000Z
completedAt: 2026-11-09T10:06:00.000Z
---

# CASE Result: 父子任务编排（subtasks 层、completed 终态、级联归档与集成 CASE）

## Summary

- Static review: `27/27`
- Runtime cases: `7/7; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 阶段值域：STAGES 增 completed

- Status: `passed`
- Evidence: 读 `packages/core/src/task/state/values.ts:30-42`：STAGES 八值冻结，`COMPLETED: 'completed'` 位于 CHECKING 之后；`:79` STAGE_VALUES 由 `Object.values(STAGES)` 派生；`as const` 与 `Object.freeze` 形态在位，既有七值逐字保留。
- Findings: none

### SR2 兼容读：statusOfStage 映射与 deriveStage 判定顺序

- Status: `passed`
- Evidence: 读 `packages/core/src/task/state/view.ts:141-146`：statusOfStage 增 completed→'completed'（archived 分支保留）；`:177-183`（deriveStage）先取 raw stage 命中 STAGE_VALUES 提前返回，随后才走 `status === 'completed' || isArchivePath` 兜底，planning 推导与 legacy implement/check 映射在兜底之后；`:162-171` 注释写明 completed-not-archived 语义。
- Findings: none

### SR3 迁移表：六条 completed 新边与路线注释

- Status: `passed`
- Evidence: 读 `packages/core/src/task/state/transitions.ts:62-80`：standard 三边在 :66/:68/:69、light 三边在 :75/:77/:78，守卫分别为 `archive-ready + case-outcome-ready` 或空；既有 19 条与 parent 区块零改动；`:48-59` 头注释补三模式 completed 路线与回边说明；C3 探针断言表长 25。
- Findings: none

### SR4 完成时刻：completedAt 随 completed 迁移写入

- Status: `passed`
- Evidence: 读 `packages/core/src/task/state/migrate.ts:205-240`：`:226` 写入条件为 `to === ARCHIVED || to === COMPLETED` 且 `record.completedAt === null`；其余查表/守卫/status-stage/casePhase/overrides 逻辑未动；`:196-199` 头注释补「completed 即完成时刻、归档不覆盖」。
- Findings: none

### SR5 存储常量：DIR_NAMES.subtasks 与 TASK_DIR_DATE_PREFIX 单源

- Status: `passed`
- Evidence: 读 `packages/core/src/task/storage/records.ts:23-34`：`DIR_NAMES.subtasks: 'subtasks'` 与导出 `TASK_DIR_DATE_PREFIX`（正则逐字）；`:224-228` TaskRecord 的 children 之后无 subtasks 字段；全模块无第二处 subtasks 类型声明。
- Findings: none

### SR6 顶层列表：listTasks 不递归 subtasks，归档回退改导入常量

- Status: `passed`
- Evidence: 读 `packages/core/src/task/storage/list-archive.ts:18`（从 records 导入常量）、`:118-141`（listTasks 仅枚举 tasks/ 直接子目录、跳过 archive，不递归）、`:215`（findArchivedTaskPath 去前缀回退）；C2 探针 listTasks 输出仅三个顶层任务。
- Findings: none

### SR7 创建落位：嵌套目录、全库 slug 唯一与零写入拒绝

- Status: `passed`
- Evidence: 读 `packages/core/src/task/storage/create.ts:389-401`：落位为 `join(parentRelPath, DIR_NAMES.subtasks, dirName)`（father 即 parent 任务目录；CASE 设计轮纠正的 dirname 公式已修正）；`:295-318` assertSlugUniqueActiveTree 递归活跃树、跳过 archive、去日期前缀比对；`:403-412` 校验顺序为 parent 校验→slug 查重→existsSync，全部先于写盘；`:329-341` linkChildToParent 追加嵌套路径并归一 parent；`:156-200` buildTaskRecord 无 subtasks 写入。
- Findings: none

### SR8 读取归一：存量 subtasks 键运行时剔除

- Status: `passed`
- Evidence: 读 `packages/core/src/task/storage/read-write.ts:130-133`：展开 parsed 后显式 `delete record['subtasks']`；`:134-160` 其余归一（hooks/check/case/dispatches/parent/children/autonomyLog）语义未动；C6 grep 无 `subtasks:` 字段访问。
- Findings: none

### SR9 创建指针分流：带 parent 不抢会话指针

- Status: `passed`
- Evidence: 读 `packages/core/src/task/task-ops.ts:228-237`：`hasParent` 非空时跳过 setActiveTask，无 parent 分支维持抢指针；C1 探针实测带 parent 创建后指针仍指父任务、无 parent 创建切到新任务。
- Findings: none

### SR10 完成动作：workloom_task_complete 编排

- Status: `passed`
- Evidence: 读 `packages/core/src/task/task-ops.ts:587-617`：executeCompleteTask 依次 requireWorkloomCwd→resolveTaskRelPath→force 契约→evaluateTransition 干跑→migrateTask→返回视图；`:564-586` 入参/注释；`packages/core/src/index.ts:304` 具名导出；C3 探针完成迁移与 parent 拒绝路径按表生效。
- Findings: none

### SR11 父归档级联：子 worktree 递归清理、整树搬迁与子指针清理

- Status: `passed`
- Evidence: 读 `packages/core/src/task/task-ops.ts:707-740`（cascadeChildrenCleanup 深度优先、归档回退跳过、两路不可读抛 `child task unreadable`）、`:776-781`（冲突检查后、父 cleanup 前调用）、`:797-815`（completedAt 空值守卫、子任务指针清理）、`:830`（返回 cascadedCleanups 计数）；C4 探针实测脏子 worktree 阻断与重跑整树搬迁。
- Findings: none

### SR12 注册面：taskComplete 三常量与计数

- Status: `passed`
- Evidence: 读 `packages/core/src/injection/surface.ts:26-31`（TOOL_NAMES 增 taskComplete，注释十三个工具名）、`:50-51`（描述）、`:80-81`（snippet `workloom_task_complete(taskPath?, force?, reason?) — mark the task completed without archiving`）；既有条目逐字未动。
- Findings: none

### SR13 core 导出面：executeCompleteTask

- Status: `passed`
- Evidence: 读 `packages/core/src/index.ts:299-311`：`executeCompleteTask` 与 executeCheckTask/executeFinishTask/executeArchiveTask 并列具名导出，无 `export *`；其余导出清单未动。
- Findings: none

### SR14 dsh 工具注册：第 11 个任务工具

- Status: `passed`
- Evidence: 读 `packages/dsh-workloom/src/tooling/tasks.ts:7`（注释改十一个工具的编排）、`:42-44`（注册十一个任务工具枚举含 complete）、`:116-131`（taskComplete 注册块，name/description 引 surface 常量，参数 taskPath/force/reason 可选）、`:349-361`（completeTaskTool 调 core executeCompleteTask 并投影）。
- Findings: none

### SR15 集成门禁：integration-case-passed 注释终态化、行为零变化

- Status: `passed`
- Evidence: 读 `packages/core/src/task/state/guards.ts:235-243`：JSDoc 为终态表述（父任务自身 CASE、children-archived 传递保证、不重复校验子任务凭据），函数体仍一行 `return guardCaseOutcomeReady(view, ctx)`；`:217-232` children-archived 与 isChildArchived 函数体未动（raw status=completed 与归档回退均识别）；`:259` 注册表键未变；C5 探针正向/负向与 grep「待细化」零命中。
- Findings: none

### SR16 上下文注入：活跃父任务的 children 清单行

- Status: `passed`
- Evidence: 读 `packages/core/src/injection/session-context.ts:56-59`（缩进与 CHILDREN_TASK_LIMIT=8）、`:175-190`（assembleInternal 传 root 并 push childrenLines）、`:283-300`（activeTaskContextFromRecord 增 root 与 childrenLines）、`:311-326`（childrenListLines 渲染 `  - "<title>" (<status>) at <taskRelPath>`、8 条截断、more 提示）；C2 探针逐项通过。
- Findings: none

### SR17 类型面过期注释：worktree.d.ts 对齐实际模块

- Status: `passed`
- Evidence: 读 `packages/core/src/workspace/worktree.d.ts:1-5`：头注释为「与 worktree-lifecycle.ts / worktree-integrate.ts 的 JSDoc 保持同步」；`grep -n "worktree.js"` 该文件零命中；类型声明未动。
- Findings: none

### SR18 工作流文档：subtasks 目录约定与 completed 语义

- Status: `passed`
- Evidence: 读 `packages/core/resources/workflow/workflow.md:70`：末句为 "every declared subtask is completed"，随后两句写明 `<father>/subtasks/<child>` 落位与 completed 随父归档级联；`:18`/`:165` 保留 "final acceptance and archives last"；`test/subtask-contract.test.ts` 6/6 通过。
- Findings: none

### SR19 case-active 评测夹具：删 subtasks 字段

- Status: `passed`
- Evidence: 读 `packages/core/resources/skills/workloom-case-active/evals/build-fixtures.mjs` 的 staged diff：仅删除 addTask 记录中的 `subtasks: []` 一行；文件内无 subtasks 字段引用；`node --check` 退出 0。
- Findings: none

### SR20 case-archived 评测夹具：删 subtasks 字段

- Status: `passed`
- Evidence: 读 `packages/core/resources/skills/workloom-case-archived/evals/build-fixtures.mjs` 的 staged diff：仅删除 addArchive 记录中的 `subtasks: []` 一行；文件内无 subtasks 字段引用；`node --check` 退出 0。
- Findings: none

### SR21 dsh commands 测试夹具：删 subtasks 字段

- Status: `passed`
- Evidence: 读 `packages/dsh-workloom/test/commands.test.ts` 的 staged diff：仅删除 writeCompletedTask 夹具的 `subtasks: []` 一行；文件内无 subtasks 字段引用；C7 dsh 套件 213/213 通过。
- Findings: none

### SR22 core task-store 测试：死字段断言删除与嵌套创建覆盖

- Status: `passed`
- Evidence: 读 `packages/core/test/task-store.test.ts:1592-1599`（childRelFor 改为 `join(parentRelPath, DIR_NAMES.subtasks, ...)`）、`:1635`（同 slug 冲突拒绝）、`:1727`（嵌套落位零部分状态）、`:2125-2148`（listTasks 只列顶层 + 子目录位于父目录内的正向断言）、`:2621-2646`（跨层同 slug 拒绝与父 children 零写入）；无 `task.subtasks` 断言；C1/C7 实跑通过。
- Findings: none

### SR23 core state-machine 测试：completed 边表、兼容读与回边

- Status: `passed`
- Evidence: 读 `packages/core/test/state-machine.test.ts:96-109`（STAGES 八值期望）、`:138-159`（TRANSITIONS 25 条精确数组，含六条新边）、`:1340`（六边可达）、`:1395`（completed→implementing 回边无守卫）、`:1424`（deriveStage 新枚举优先）、`:1447`（parent 无 completed 边）、`:276`（旧归档兜底回归）；定向实跑 43/43 通过。
- Findings: none

### SR24 core task-ops 测试：完成工具与级联归档

- Status: `passed`
- Evidence: 读 `packages/core/test/task-ops.test.ts:1109`（standard 完成视图与目录未动）、`:1141`（parent 拒绝与 force 契约）、`:1226-1305`（父子双 worktree 级联：子先清理、整树入档、子保持 completed、completedAt 不变、子指针清理、已归档子跳过、级联计数 1）、`:1310-1343`（子记录不可读阻断且父目录未动）；定向实跑 67/67 通过。
- Findings: none

### SR25 core session-context 测试：children 行、截断与跳过

- Status: `passed`
- Evidence: 读 `packages/core/test/session-context.test.ts:1126-1141`（parent 活跃行 children 标题/状态/路径）、`:1144-1161`（8 条截断 + `(… 2 more; run workloom_task_list)`）、`:1164-1182`（损坏与缺失子记录跳过）；定向实跑 42/42 通过。
- Findings: none

### SR26 core doctor 测试：删 subtasks 字段

- Status: `passed`
- Evidence: 读 `packages/core/test/doctor.test.ts` 的 staged diff：仅删除 baseRecord 夹具的 `subtasks: []` 一行；文件内无 subtasks 字段引用；C7 core 套件 726/726 通过。
- Findings: none

### SR27 dsh tasks 测试：complete 工具注册与投影

- Status: `passed`
- Evidence: 读 `packages/dsh-workloom/test/tasks.test.ts:304-320`：断言 workloom_task_complete 注册存在、name/description 引 surface 常量、taskPath/force/reason 类型正确、required 为空且 additionalProperties=false；C7 dsh 套件 213/213 通过。
- Findings: none

## Runtime Results

### C1 带 parent 创建：嵌套落位、指针分流与全库 slug 唯一

- Status: `passed`
- Executed at: `2026-11-09T10:00:00.000Z`
- Actions:
  1. `cd packages/core && node --test test/task-store.test.ts test/task-ops.test.ts test/active-task.test.ts`（131/131）。
  2. `node case-evidence/probes/c1-create-probe.mjs`：嵌套落位、父子双向写回、裸 parent 归一、指针分流、跨父/顶层/任意日期前缀同名拒绝、archive 不参与查重、重复创建零写入。
- Observed: 探针 38 项断言全 PASS（嵌套路径 `tasks/<father>/subtasks/<MM-DD>-<slug>`、child.parent 规范路径、父 children 与 mode=parent、带 parent 指针不动、无 parent 切指针、四形态查重拒绝且零写入）；定向套件 131/131。
- Evidence:
  - `case-evidence/c1-targeted-tests.log`
  - `case-evidence/c1-create-probe.log`
- Findings: none

### C2 顶层列表与活跃父任务 children 快照

- Status: `passed`
- Executed at: `2026-11-09T10:00:30.000Z`
- Actions:
  1. `cd packages/core && node --test test/session-context.test.ts`（42/42）。
  2. `node case-evidence/probes/c2-list-context-probe.mjs`：三父夹具（2 子含 completed、9 子、含损坏子记录）验证 listTasks、children 行、8 条截断、损坏跳过与候选节。
- Observed: listTasks 仅返回三个顶层任务；A 的两条 children 行逐字匹配 `  - "<title>" (<status>) at <path>`（planning/completed 与顺序正确）；B 渲染 8 条 + `(… 1 more; run workloom_task_list)`；C 跳过损坏记录且 `err === null`；候选节无 `/subtasks/` 与子任务标题。
- Evidence:
  - `case-evidence/c2-session-context-tests.log`
  - `case-evidence/c2-list-context-probe.log`
- Findings: none

### C3 completed 新阶段：边表、完成迁移、兼容读与返工回边

- Status: `passed`
- Executed at: `2026-11-09T10:01:00.000Z`
- Actions:
  1. `cd packages/core && node --test test/state-machine.test.ts`（43/43）。
  2. `node case-evidence/probes/c3-stage-probe.mjs`：六边与守卫、statusOfStage、checking→completed 迁移、目录未动、completed→archived 干跑、completed→implementing 回边、旧数据与新增值兼容读。
- Observed: 六条新边与两守卫/空守卫逐条匹配（表长 25）；完成视图与 raw task.json 均 stage/status=completed、completedAt 非空、目录未动且未入 archive；回边视图 implementing/in_progress 且无 bypass；D1（status=completed 无 stage）读 archived、D2（stage=completed）读 completed。
- Evidence:
  - `case-evidence/c3-state-tests.log`
  - `case-evidence/c3-stage-probe.log`
- Findings: none

### C4 父级联归档全链：子完成→父集成→集成 CASE 双轮→整树搬迁

- Status: `passed`
- Executed at: `2026-11-09T10:02:00.000Z`
- Actions:
  1. `node case-evidence/probes/c4-parent-chain-probe.mjs`（真实 git 夹具，HOME/TMPDIR 隔离，cleanup=keep-branch）：子未完成阻断父 integrating → 子 complete → 父 integrating → 设计派发/结算 reviewing/执行派发 executing → 夹具 RESULT 过 integration-case-passed → 父 check → 脏子 worktree 阻断归档 → 清理后归档成功。
  2. `cd packages/core && node --test test/task-ops.test.ts test/worktree-lifecycle.test.ts`（67/67）。
- Observed: `children-archived` 以子 raw completed 放行父 integrating；集成 CASE 门禁通过；脏子 worktree 使归档失败且父目录/父 worktree/子 worktree 均在、父仍 integrating；重跑成功，父整树落于 `tasks/archive/2026-11/parent-chain`，子位于 `subtasks/11-09-child-chain` 且保持 completed、completedAt 不变；两个 worktree 与两条会话指针均清理，`git worktree list` 仅主检出。
- Evidence:
  - `case-evidence/c4-parent-chain-probe.log`
  - `case-evidence/c4-cascade-tests.log`
- Findings: none

### C5 集成 CASE 门禁：父自身 RESULT、会话链与负向拒绝

- Status: `passed`
- Executed at: `2026-11-09T10:03:00.000Z`
- Actions:
  1. `cd packages/core && node --test test/case.test.ts test/state-machine.test.ts`（57/57）。
  2. `node case-evidence/probes/c5-integration-gate-probe.mjs`：正向、缺 RESULT、失败 RESULT、错会话、fallbackOf 链、归档边正负向；每次改写后提交夹具保持 diff 为空。
  3. `grep -n "待父子编排细化\|待细化" packages/core/src/task/state/guards.ts`（零命中）并读取 JSDoc。
  4. 读真实任务 `task.json` 与 dispatches，核对 designSession/execution 同链并写入证据。
- Observed: 正向在子任务无 check/case 凭据时仍通过（R12）；缺 RESULT/失败 RESULT/错会话分别以 `case-result.md is missing`、`RESULT status must be passed`、`checkSession is neither` 拒绝；fallbackOf 链 `exec-b → fixture-design` 通过；归档边负向消息含 `guard "integration-case-passed" failed` 且不含 archive-ready；真实任务 designSession `958aad09…` 与 execution 派发 childId 一致，case-result checkSession 取该值。
- Evidence:
  - `case-evidence/c5-case-tests.log`
  - `case-evidence/c5-integration-gate-probe.log`
  - `case-evidence/c5-real-session-chain.md`
  - `case-evidence/c5-guard-comment.log`
- Findings: none

### C6 清理与文档：subtasks 字段、worktree.d.ts 注释、workflow.md 与簿记

- Status: `passed`
- Executed at: `2026-11-09T10:03:30.000Z`
- Actions:
  1. 生产面 `grep -rn "subtasks" packages/core/src packages/dsh-workloom/src`。
  2. 测试/评测面 `grep -rnE "subtasks\s*:"` 与 `grep -rnE "\.subtasks\b"`（排除 `DIR_NAMES.subtasks` 路径常量）；两 eval 夹具 `node --check`。
  3. `worktree.d.ts` 头注释人检；`workflow.md` 1.4 段人检；`node --test test/subtask-contract.test.ts`（6/6）。
  4. 主检出 `requirements-addendum.md` 的「子任务五实现观察」节人检。
- Observed: 生产面命中仅为 records.ts 的 DIR_NAMES.subtasks 定义、read-write.ts 的 delete 与说明注释、create.ts 的路径常量引用与注释，无 `subtasks:` 字段写入与 `TaskRecord.subtasks` 类型；测试/评测面字段引用零命中（字面 `.subtasks` 唯一命中为 `DIR_NAMES.subtasks` 路径常量，按 plan S10 口径排除）；worktree.d.ts 含 worktree-lifecycle.ts/worktree-integrate.ts 且无 worktree.js；workflow.md:70 为 completed 语义与 subtasks 落位两句；簿记节含 1129 行事实、接受理由与子任务七输入。
- Evidence:
  - `case-evidence/c6-grep.log`
  - `case-evidence/c6-docs-checks.md`
  - `case-evidence/c6-subtask-contract.log`
- Findings: none

### C7 标准验证、覆盖率与代码指纹

- Status: `passed`
- Executed at: `2026-11-09T10:04:00.000Z`
- Actions:
  1. `pnpm -r build`、`pnpm -r typecheck`、`pnpm lint`、`cd packages/core && pnpm test`、`cd packages/dsh-workloom && pnpm test`。
  2. `git status --porcelain` 与 dist 状态、`git diff --name-only --no-renames --diff-filter=d HEAD --`、`git ls-files --others --exclude-standard`。
  3. `node --test --experimental-test-coverage ...` 两包 coverage 聚合，lcov 落 `<task>/coverage/`。
  4. `node <skill>/scripts/task-fingerprint.mjs <worktree>`。
- Observed: build/typecheck/lint 均 0（lint 无 error/warning）；core 726/726、dsh 213/213，0 fail，含 dist-mirror 与 dist-dts 守卫；work commit 未落，变更集为 staged 的 26 个非 dist 路径 + 38 个 dist 路径（dist 属预期待提交状态，见预写容忍条款）；覆盖率聚合 4660/4873 (95.63%)；指纹 `codeFingerprint=ed69df58…54f8b6`，worktree HEAD 5112cc7、分支 workloom/11-06-sop-parent-child。
- Evidence:
  - `case-evidence/c7-build.log`
  - `case-evidence/c7-typecheck.log`
  - `case-evidence/c7-lint.log`
  - `case-evidence/c7-core-tests.log`
  - `case-evidence/c7-dsh-tests.log`
  - `case-evidence/c7-dist-status.log`
  - `case-evidence/c7-change-set.log`
  - `case-evidence/c7-coverage.log`
  - `case-evidence/c7-coverage-summary.md`
  - `case-evidence/c7-fingerprint.log`
  - `case-evidence/c7-code-baseline.txt`
- Findings: none

## Coverage

- Status: `generated`
- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Command: `cd packages/core && node --test --experimental-test-coverage --test-coverage-include='src/**' --test-coverage-include='dist/**' --test-reporter=spec --test-reporter-destination=stdout --test-reporter=lcov --test-reporter-destination=<task>/coverage/core.lcov.info 'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'`；dsh 包同款参数写 `dsh-workloom.lcov.info`
- Overall lines: `4660/4873 (95.63%)`
- Raw reports:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/injection/session-context.ts` | `525/539` | `97.40%` | `161-162, 232-233, 286-287, 343, 345-348, 536-538` | `coverage/core.lcov.info` |
| `packages/core/src/injection/surface.ts` | `468/490` | `95.51%` | `412-413, 454-465, 475-479, 488-490` | `coverage/core.lcov.info` |
| `packages/core/src/task/state/guards.ts` | `287/289` | `99.31%` | `286-287` | `coverage/core.lcov.info` |
| `packages/core/src/task/state/migrate.ts` | `251/253` | `99.21%` | `238-239` | `coverage/core.lcov.info` |
| `packages/core/src/task/state/transitions.ts` | `88/88` | `100.00%` | `-` | `coverage/core.lcov.info` |
| `packages/core/src/task/state/values.ts` | `106/106` | `100.00%` | `-` | `coverage/core.lcov.info` |
| `packages/core/src/task/state/view.ts` | `253/253` | `100.00%` | `-` | `coverage/core.lcov.info` |
| `packages/core/src/task/storage/create.ts` | `473/492` | `96.14%` | `274-275, 277-278, 332-335, 344-348, 412-413, 488-491` | `coverage/core.lcov.info` |
| `packages/core/src/task/storage/list-archive.ts` | `206/224` | `91.96%` | `103-104, 140-150, 179-180, 204-205, 223` | `coverage/core.lcov.info` |
| `packages/core/src/task/storage/read-write.ts` | `241/243` | `99.18%` | `49-50` | `coverage/core.lcov.info` |
| `packages/core/src/task/storage/records.ts` | `328/328` | `100.00%` | `-` | `coverage/core.lcov.info` |
| `packages/core/src/task/task-ops.ts` | `1027/1062` | `96.70%` | `113-114, 230-231, 312-313, 348-349, 437-438, 537-547, 611-612, 650-651, 732-735, 958-959, 1040-1041, 1044-1045` | `coverage/core.lcov.info` |
| `packages/dsh-workloom/src/tooling/tasks.ts` | `407/506` | `80.43%` | `281-284, 318-330, 333-346, 349-361, 380, 391-393, 415-416, 434-435, 437-445, 447-449, 453-461, 464-477, 494-505` | `coverage/dsh-workloom.lcov.info` |

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/dist/` | `构建产物，C7 验 build 后与 src 镜像一致，同 commit 由主会话提交时复核` |
| `packages/dsh-workloom/dist/` | `构建产物，C7 验 build 后与 src 镜像一致，同 commit 由主会话提交时复核` |
| `packages/core/test/` | `测试夹具与新增钉住用例自身，C2/C3/C4/C5/C7 验全绿` |
| `packages/dsh-workloom/test/` | `dsh 测试夹具与 complete 注册用例自身，C5/C7 验全绿` |
| `packages/core/resources/skills/workloom-case-active/evals/build-fixtures.mjs` | `评测夹具（删 subtasks 字段），C6 以 node --check 验语法` |
| `packages/core/resources/skills/workloom-case-archived/evals/build-fixtures.mjs` | `评测夹具（删 subtasks 字段），C6 以 node --check 验语法` |
| `packages/core/resources/workflow/workflow.md` | `静态文档资源，C6 人检与 subtask-contract 测试` |
| `packages/core/src/workspace/worktree.d.ts` | `类型声明面（仅头注释），无运行时行，C6 人检` |
| `packages/core/src/index.ts` | `导出面改线（executeCompleteTask 具名导出），无独立运行时逻辑，由 build/typecheck 与 SR13 验证` |
| `**/*.js.map` | `构建映射产物，无运行时行` |

### Collection Failure

`none`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | `0` | `case-evidence/c7-build.log`（两包 build Done） |
| `pnpm -r typecheck` | `0` | `case-evidence/c7-typecheck.log`（两包 typecheck Done） |
| `pnpm lint` | `0` | `case-evidence/c7-lint.log`（无 error 与 warning） |
| `cd packages/core && pnpm test` | `0` | `case-evidence/c7-core-tests.log`（726 pass / 0 fail，含 dist-mirror 与 dist-dts 守卫） |
| `cd packages/dsh-workloom && pnpm test` | `0` | `case-evidence/c7-dsh-tests.log`（213 pass / 0 fail，含 dist-mirror 守卫） |

## Resolved Findings

- `packages/core/src/task/storage/create.ts:397` [P0] 初版落位公式 `dirname(parentRelPath)` 会把子任务建到 `tasks/subtasks/<child>`（CASE 设计轮发现，plan S4 同源）— fixed: 实现改为 `join(parentRelPath, DIR_NAMES.subtasks, dirName)`；C1（嵌套落位/父子写回）与 C4（整树搬迁）复验通过，task-store 夹具同步修正。
- case-evidence/probes/c1-create-probe.mjs:99 [P2] 首次探针跨父同名用例误用 slug（用 `dup-a` 对比 `child-alpha`）— fixed: 改用实际冲突 slug 后复跑全绿。
- case-evidence/probes/c4-parent-chain-probe.mjs:87 [P2] 首次探针 `executeStartTask` 未显式传 taskPath，活跃指针解析失败 — fixed: 显式传 taskPath 后复跑全绿。

## Open issues

- none
