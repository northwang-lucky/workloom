# S1 增量覆盖率门禁与采集脚本 — 计划（Round 3 修订）

> 修订依据：plan-review.md Round 1–3 全部处置（R1 P0×1/P1×12/P2×13，R2 P1×2/P2×6，R3 P2×4）；P1-5 口径经用户确认 B；Round 3 零阻塞发现。

## Design decisions

- **单一计算源**：core TS 模块 `task/coverage-compute.ts` 持变更行消费、三格式解析、交集与缺席检测；门禁直接 import 复算。`resources/scripts/task-diff-coverage.mjs` 薄 CLI import `../../dist/task/coverage-compute.js`（dist 同 commit 入库，core files 含 dist+resources，ESM 相对 import 成立）。
- **基线接口（P1-1/2/3）**：原语 `gitDiffChangedLines(root, baseRef)`——baseRef 非空用 `baseRef...HEAD`（三点）；baseRef=null 用两点 `git diff HEAD` + 未跟踪文件读行（工作区口径）。hunk 新侧 count 省略按 1。case-scope：branch+base_branch 非空传 base_branch；字段为空传 null；声明 ref 无效由 git err 透传 fail loud，不回退。
- **路径归一（P1-4）**：go coverprofile 剥 go.mod module 前缀（读 worktree go.mod）转 repo 相对，无 go.mod 时后缀匹配；jacoco package+sourcefile 拼路径后缀匹配 diff 路径（多候选取唯一后缀匹配，歧义 err）；lcov SF 绝对路径剥 worktree 前缀转 repo 相对。三格式夹具各覆盖路径形态。
- **缺席可执行文件硬拒（P1-5=B）**：冻结常量 `EXECUTABLE_EXTENSIONS` = {.go,.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.rs,.c,.h,.cpp,.cc,.cxx,.hpp,.hxx,.java,.kt,.kts}（封闭集合，S4 对齐如需扩展再改常量）；可执行后缀的变更文件须在报告文件集或 Exclusions（带原因），否则列入 missingExecutableFiles，门禁报 coverage_missing_file 硬拒。非可执行文件缺席不触发；unsupported 格式跳过缺席检测（Round 2 P1-1）。
- **计算输入与合并（Round 2 P1-2/P2）**：computeDiffCoverage 入参 `{root?, baseRef?, changedLines?, reports, exclusions?}`——changedLines 优先于 git 提取，root 常驻供路径归一（lcov 剥 worktree 前缀、读 go.mod）；门禁统一传 root+changedLines+exclusions。多报告按文件合并，行覆盖取并（任一报告覆盖即覆盖）；混格式分别推断。
- **阈值整数化（P2-5）**：达标判定 `covered*100 > total*90`（整数交叉乘，恰好 90% 不达标）；复算核对只比 covered/total 整数，不比显示 pct。
- **豁免链路（P0-1/P1-9）**：check 入参 coverageWaiver{reason}，fingerprint 取 RESULT codeBaseline；checkTaskInternal 经 ctx.coverageWaiver 传自身守卫；首次 check 迁移由 migrateTask 把 patch.check.coverageWaiver 透传 evaluateTransition→ctx→guardCaseOutcomeReady→门禁。复查经 task.check 回退通过时 credential 继承既有有效豁免。归档复核读 task.check.coverageWaiver，指纹须匹配当前 RESULT。
- **回退分支（P1-7/8）**：not_applicable 原因载体为零分母独立原因行（`- Reason:`），放宽 case-gates.ts:281 非空 Exclusions 约束；unsupported 格式 expected 回退 diff 文件集（减 .workloom/Exclusions），阈值仍作用自报 Overall，一致性校验只替代机械复算。
- **task-ops 行数（P2-11）**：既有 1289 行超 600；waiver 构造下沉 coverage-compute `buildWaiver`，task-ops 仅加入参 plumbing。task-ops 整体拆分属正交重构（生命周期迁移边耦合），本轮不拆，记录为后续任务。

## Steps

#### 步骤 1 — git-query 变更行原语

- Covers: AC1, AC5
- Target: `packages/core/src/workspace/git-query.ts` — 新增 `gitDiffChangedLines`、`GIT_DIFF_LINES_ARGS`
- Edit:
  ```text
  Input: GIT_DIFF_CHANGED_ARGS（git-query.ts:35-42）与 runGit/toError 模式。
  Output: gitDiffChangedLines(root, baseRef: string|null) → [err, Map<file,{start,end}[]>|null]。
  Preconditions: none
  Procedure:
    - baseRef 非空：args=['diff','--no-color','-M','--unified=0','--diff-filter=d',`${baseRef}...HEAD`,'--']。
    - baseRef=null：两点 ['diff','--no-color','-M','--unified=0','--diff-filter=d','HEAD','--'] + ls-files --others --exclude-standard；未跟踪文件读文件计行（二进制跳过），全行视为新增。
    - hunk 头 @@ -old +newStart,newCount @@：newCount 省略按 1；newCount>0 记 [newStart,newStart+newCount-1]；newCount=0 跳过；旧侧同理。
    - -M 重命名取新名归并；声明 ref 无效 → git err 透传（不回退）。
  Failure: git 非零 → err；非 git 目录 → err。
  ```
- Verify: `cd packages/core && node --test`（git.test.ts 新用例：增/改/删/重命名/单行 hunk/无分支工作区/无效 ref）。

#### 步骤 2 — coverage-compute 核心模块

- Covers: AC1, AC5
- Target: `packages/core/src/task/coverage-compute.ts`（新）
- Edit:
  ```text
  Input: gitDiffChangedLines；三格式报告文本；EXECUTABLE_EXTENSIONS 常量。
  Output: computeDiffCoverage(input) → [err, {files:[{file,covered,total,uncoveredRanges,changedRanges}], overall:{covered,total}, missingExecutableFiles:string[]}|null]；input={root?,baseRef?,changedLines?,reports,exclusions?}（changedLines 优先、root 常驻供路径归一）；export parseGoCoverprofile/parseLcov/parseJacocoXml、inferFormat、buildWaiver、meetsThreshold(covered,total)。
  Preconditions: Step 1
  Procedure:
    - 变更行 = input.changedLines ?? gitDiffChangedLines(root,baseRef)（err 透传）。
    - 逐格式解析逐文件逐行 {measurable,covered}，路径归一用 input.root（go 剥 module 前缀/后缀匹配；jacoco 后缀匹配；lcov 绝对剥 root 前缀转相对）；多报告按文件合并行覆盖取并。
    - 交集：changedRanges 展开 ∩ measurable = total；covered 子集 = covered；uncoveredRanges 压缩。
    - overall = Σcovered/Σtotal（整数）；meetsThreshold = covered*100 > total*90。
    - missingExecutableFiles = 可执行后缀变更文件 − 报告文件集 − input.exclusions；仅 supported 格式计算，unsupported 返回空。
    - inferFormat：mode:→go；SF:/DA:→lcov；jacoco <report>→jacoco-xml；否则 unsupported。
    - buildWaiver(reason,fingerprint) → {reason,fingerprint,at,source:'main'}。
  Failure: git/解析 err → [err,null]；unsupported 报告标 unsupported（门禁回退）。
  ```
- Verify: `node --test` coverage-compute.test.ts（三格式路径形态 + 交集 + 单行 hunk + 缺席可执行文件 + 空分母 + unsupported + meetsThreshold 边界）。

#### 步骤 3 — CLI 脚本与测试

- Covers: AC5, AC6
- Target: `packages/core/resources/scripts/task-diff-coverage.mjs`（新）+ `task-diff-coverage.test.mjs`（新）
- Edit:
  ```text
  Input: ../../dist/task/coverage-compute.js；task-fingerprint.mjs:31-32 entry guard（pathToFileURL(resolve(process.argv[1])).href === import.meta.url）。
  Output: CLI node task-diff-coverage.mjs <worktree> <baseRef> <report...> [--json] [--out-dir <dir>]；--out-dir 时写 changed-lines.json（变更行区间）与 diff-coverage.json（交集结果）到 dir；省略 --out-dir 仅 stdout（不写文件）。
  Preconditions: Step 2 + pnpm -r build
  Procedure:
    - import { computeDiffCoverage } from '../../dist/task/coverage-compute.js'。
    - argv 解析 → computeDiffCoverage → --out-dir <dir> 写 changed-lines.json + diff-coverage.json 到 dir；省略 --out-dir 仅 stdout 不写文件；--json 输出 JSON 否则 markdown 表 + overall。
    - entry guard 用 pathToFileURL(resolve(argv[1])).href 比对（P2-1）。
  Failure: 参数缺失 → usage 抛错；dist 缺失 → import 抛错提示先 build。
  ```
- Verify: `node --test packages/core/resources/scripts/task-diff-coverage.test.mjs`；夹具两产物核对。

#### 步骤 4 — case-structure 值域与 Options

- Covers: AC2, AC3, AC4
- Target: `packages/core/src/task/case-structure.ts` — `CASE_STRUCTURE.coverageStatuses`（L76）、`CaseStructureOptions`（L43-47）
- Edit:
  ```text
  Input: coverageStatuses=['generated','not_applicable','failed']；CaseStructureOptions {taskRelPath?,children?,changedFiles?}。
  Output: coverageStatuses 加 'below_threshold'；CaseStructureOptions 加 coverageWaiver?:{reason,fingerprint}、changedLines?:Map、exclusions?:Map（P1-10）。
  Preconditions: none
  Procedure:
    - 冻结数组追加 below_threshold。
    - CaseStructureOptions 接口加三个可选字段（定义在此文件，非 case-gates）。
  Failure: none
  ```
- Verify: `pnpm -r typecheck`；contract-asset pin 同步（Step 13）。

#### 步骤 5 — case-scope 基线

- Covers: AC1
- Target: `packages/core/src/task/case-scope.ts` — 新增 `listCaseChangedLines`
- Edit:
  ```text
  Input: task.base_branch/branch；worktreeDirectory；gitDiffChangedLines。
  Output: listCaseChangedLines(root,task) → [err, Map|null]。
  Preconditions: Step 1
  Procedure:
    - branch+base_branch 非空 → baseRef=base_branch（原语用 base_branch...HEAD，HEAD 即分支尖端）。
    - 字段为空 → baseRef=null（两点工作区 + 未跟踪）。
    - 调 gitDiffChangedLines；过滤 .workloom/；声明 ref 无效 err 透传。
  Failure: git err → 透传 fail loud。
  ```
- Verify: `node --test` case.test.ts 内 case-scope 用例（有分支/无分支/无效 ref；宿主 case.test.ts，无独立 case-scope.test.ts）。

#### 步骤 6 — case-gates 增量门禁

- Covers: AC1, AC2, AC3, AC4, AC5
- Target: `packages/core/src/task/case-gates.ts` — `evaluateCaseOutcomeGate` Coverage 段（L253-294）、not_applicable 约束（L281）、validateReferencedFiles 口径（L305）
- Edit:
  ```text
  Input: 现有 Coverage 校验；computeDiffCoverage/meetsThreshold；listCaseChangedLines；options.coverageWaiver/changedLines/exclusions。
  Output: 增量门禁——机械复算核对、阈值、缺席硬拒、below_threshold 豁免、not_applicable 零分母原因、unsupported 回退。
  Preconditions: Steps 2,4,5,7
  Procedure:
    - 变更行 = options.changedLines ?? listCaseChangedLines；报告路径相对任务目录解析（同 L305），多报告合并，报告缺失 → err。
    - 复算 = computeDiffCoverage({root: worktreeDirectory(root, task), changedLines, reports, exclusions})（root 显式取任务 worktree 供路径归一，changedLines 优先）；结果先按 .workloom/Exclusions 过滤再比对（P2-7）。
    - expected = 有可测变更行的文件；unsupported 格式 expected 回退 diff 文件集（减排除）。
    - supported 格式且 missingExecutableFiles 非空 → coverage_missing_file 硬拒（P1-5）；unsupported 跳过缺席检测（Round 2 P1-1）。
    - generated/below_threshold：核对 RESULT 逐文件 covered/total 整数与 overall（不一致 coverage_recompute，P2-5）；文件集合一致（coverage_files）。
    - meetsThreshold(overall) 过；否则 Status=below_threshold 且有效豁免（options.coverageWaiver ?? task.check?.coverageWaiver，fingerprint 匹配 RESULT codeBaseline，reason 非空）→ 过；否则 coverage_threshold。unsupported 时阈值仍校验自报 Overall（P1-8）。
    - below_threshold 须 ### Below Threshold 子节逐文件原因（coverage_below_reasons）；Summary 同步。
    - not_applicable：复算分母 0 或 expected 空 + `- Reason:` 非空（放宽 L281 非空 Exclusions 约束，P1-7）；缺原因拒绝。
  Failure: 复算不一致/阈值不达标/缺席/豁免无效 → core failure（force 硬拦）。
  ```
- Verify: `node --test` case.test.ts（90.0 拒/90.1 过/缺席硬拒/豁免匹配/指纹失效/复算不一致/not_applicable 缺原因拒/unsupported 阈值）。

#### 步骤 7 — records 豁免字段

- Covers: AC4
- Target: `packages/core/src/task/storage/records.ts` — `TaskCheckRecord`（L102-105）
- Edit:
  ```text
  Input: TaskCheckRecord {passedAt,summary}。
  Output: CoverageWaiverRecord {reason,fingerprint,at,source:'main'|'user'|'auto'}；TaskCheckRecord.coverageWaiver?:CoverageWaiverRecord。
  Preconditions: none
  Procedure:
    - 定义接口 + 可选字段；兼容读旧记录 undefined（read-write.ts:141 透传）。
  Failure: none
  ```
- Verify: `pnpm -r typecheck`。

#### 步骤 8 — check 入参与守卫透传

- Covers: AC4
- Target: `packages/core/src/task/task-ops.ts` — CheckTaskParams（L463-471）/checkTaskInternal（L500-562）/ExecuteCheckTaskParams（L952-958）/executeCheckTask（L967-987）；`packages/core/src/task/state/guards.ts` — guardCaseOutcomeReady（L217-220）/GuardContext
- Edit:
  ```text
  Input: CheckTaskParams {taskRelPath,summary,force,reason}；credential={passedAt,summary}；guardCaseOutcomeReady 无 options；复查整体覆盖 record.check（L559）。
  Output: 入参 coverageWaiver?:{reason}；GuardContext.coverageWaiver 透传门禁；复查继承既有豁免；waiver 构造调 buildWaiver（下沉，P2-11）。
  Preconditions: Steps 6,7
  Procedure:
    - CheckTaskParams/ExecuteCheckTaskParams 加 coverageWaiver?:{reason}。
    - GuardContext 加 coverageWaiver；guardCaseOutcomeReady 转 evaluateCaseOutcomeGate options.coverageWaiver。
    - checkTaskInternal：传入 → reason 校验 → 读 RESULT codeBaseline 指纹 → buildWaiver → ctx.coverageWaiver 传自身守卫（L518）。
    - credential.coverageWaiver：传入且通过用新值；未传入但门禁经 task.check 回退通过 → 继承既有有效豁免（P1-9）。
    - executeCheckTask 透传。
  Failure: reason 空/指纹缺失 → 抛错；门禁拒 → 不写凭据。
  ```
- Verify: `node --test` check 豁免（首 check 带参/复查继承/reason 空拒）。

#### 步骤 9 — migrate 豁免透传（P0-1）

- Covers: AC4
- Target: `packages/core/src/task/state/migrate.ts` — evaluateTransition（L109-119 options/ctx）、migrateTask（L209-212）
- Edit:
  ```text
  Input: evaluateTransition options {force?,reason?}，ctx={root,taskRelPath}（L119）；migrateTask 调 evaluateTransition 不传 patch，patch.check 守卫后才 Object.assign（L220）。
  Output: evaluateTransition options 加 coverageWaiver?；ctx 含 coverageWaiver；migrateTask 从 params.patch?.check?.coverageWaiver 透传 evaluateTransition。
  Preconditions: Steps 7,8
  Procedure:
    - evaluateTransition options 类型加 coverageWaiver?:{reason,fingerprint}；ctx 注入该字段（守卫经 guardCaseOutcomeReady 消费）。
    - migrateTask：evaluateTransition options 传 params.patch?.check?.coverageWaiver（首 check 迁移重评携带豁免）。
    - patch.check 仍在守卫通过后写入（语义不变）；归档/复查迁移同样经此透传既有凭据豁免。
  Failure: 豁免无效 → case-outcome-ready 硬拒（迁移拒绝，不写盘）。
  ```
- Verify: `node --test` 端到端：IMPLEMENTING 首 check + below_threshold + 有效 waiver → 迁移通过并持久化；无豁免 → 拒。

#### 步骤 10 — surface 与 dsh schema

- Covers: AC4
- Target: `packages/core/src/injection/surface.ts` — taskCheck 签名（L82-83）/TOOL_DESCRIPTIONS.taskCheck（L50-51）/PARAM_DESCRIPTIONS；`packages/dsh-workloom/src/tooling/tasks.ts` — check schema（L101-111）/checkTaskTool（L350-360）
- Edit:
  ```text
  Input: 签名 'workloom_task_check(summary?, taskPath?, force?, reason?)'；TOOL_DESCRIPTIONS.taskCheck 仅提 summary；check properties additionalProperties:false。
  Output: 加 coverageWaiver 参数（object{reason} required）描述/schema；TOOL_DESCRIPTIONS 补 coverageWaiver 选项（P2-13）；checkTaskTool 提取透传。
  Preconditions: Step 8
  Procedure:
    - surface：签名加 coverageWaiver?；PARAM_DESCRIPTIONS 加描述；TOOL_DESCRIPTIONS.taskCheck 补"可选 coverageWaiver 记录不达标豁免"。
    - tasks.ts：properties 加 coverageWaiver:{type:'object',properties:{reason:{type:'string'}},required:['reason'],additionalProperties:false}；checkTaskTool 提取 typed.coverageWaiver。
  Failure: additionalProperties:false 须同步加字段。
  ```
- Verify: `pnpm -r typecheck` + `node --test` surface.test.ts（L254-257 pin）+ dsh tasks.test.ts（L75-84 schema）。

#### 步骤 11 — 模板 Coverage 节

- Covers: AC1, AC2
- Target: `packages/core/resources/templates/case.md`（Coverage L56-69 + checker-discipline L10）、`case-result.md`（Coverage L41-67 + Summary 枚举 L17）
- Edit:
  ```text
  Input: case.md Scope/Raw outputs + L10 Result discipline 行；case-result.md Overall/Changed Files 表 + L17 Summary Coverage 枚举。
  Output: 增量口径模板 + below_threshold 全使用方（P2-3）。
  Preconditions: Steps 4,6
  Procedure:
    - case.md：Scope 改增量描述；Raw outputs 加 coverage/changed-lines.json、diff-coverage.json；L10 discipline 行同步变更行口径与 below_threshold。
    - case-result.md：Status 值域加 below_threshold；L17 Summary 枚举加 below_threshold；Changed Files 表头改变更行；加 ### Below Threshold 子节 + not_applicable `- Reason:` 行。
  Failure: none（值域与门禁一致，contract-asset pin）。
  ```
- Verify: contract-asset.test.ts（Step 13）+ 人工核对。

#### 步骤 12 — workflow 2.3 全使用方

- Covers: AC1
- Target: `packages/core/resources/workflow/workflow.md` — 2.3 采集句（L96）、凭据写入句（L111）、合格状态句（L112）
- Edit:
  ```text
  Input: L96 采集句；L111 "writes check.passedAt + check.summary"；L112 "coverage is generated or validly not_applicable"。
  Output: 三句同步增量口径 + 豁免 + below_threshold（P1-12）；R7 审核路由措辞（P2-12）。
  Preconditions: none
  Procedure:
    - L96：改增量行覆盖率采集 + >90% 门禁 + 不达标审核路由（无关代码交 developer、case 缺口交 checker、全量重跑）。
    - L111：凭据写入加 check.coverageWaiver。
    - L112：合格状态加 below_threshold + 有效豁免。
    - states/step 不变，version 不升。
  Failure: none
  ```
- Verify: contract-asset.test.ts 逐字 pin（Step 13）。

#### 步骤 13 — 测试与 fixture

- Covers: AC1, AC2, AC3, AC4, AC5, AC7
- Target: `packages/core/test/case.test.ts`（validCase L44/validResult L135/'8/10 (80%)' L198/codeBaseline L139/门禁用例 L367-467）、`packages/core/test/coverage-compute.test.ts`（新）、`packages/core/test/git.test.ts`、`packages/core/test/surface.test.ts`（L254-257）、`packages/core/test/contract-asset.test.ts`（L1078-1086）、`packages/dsh-workloom/test/tasks.test.ts`（L75-84）
- Edit:
  ```text
  Input: fixture 在 case.test.ts（非 task-artifacts.js，P2-2）；codeBaseline 'main@abc'（L139）缺指纹。
  Output: fixture 改增量口径 + 指纹；新增门禁用例；contract-asset/surface/dsh pin 同步；测试使用方枚举齐全（P2-8）。
  Preconditions: Steps 1-12
  Procedure:
    - validResult Coverage 改变更行 covered/total（95/100 基线）；codeBaseline 加 codeFingerprint=<64-hex>（P2-9）；加 coverage/changed-lines.json+diff-coverage.json+报告；options.changedLines 注入复算（P1-11）。
    - 新用例：90.0 拒/90.1 过/force+阈值拒（AC2）/缺席可执行文件硬拒/豁免匹配/指纹失效/复算不一致/not_applicable 缺原因拒（AC3）/unsupported 阈值/复查继承豁免（P1-9）/首 check 迁移端到端（P0-1）。
    - contract-asset：coverageStatuses 含 below_threshold；模板/workflow 三句 pin。
    - surface.test taskCheck 签名 pin；dsh tasks.test check schema pin；git.test 变更行用例。
    - absence-assertions 完整结构形式；红绿清单枚举全部消费方。
  Failure: 漏消费方 → 红绿缺项。
  ```
- Verify: `cd packages/core && node --test` 全绿；`cd packages/dsh-workloom && node --test` 全绿。

#### 步骤 14 — spec、dist 与自身证据

- Covers: AC6, AC7
- Target: `.workloom/spec/repo/workflow/index.md`（新条目）、`packages/core/dist`+`packages/dsh-workloom/dist`、任务 `coverage/`
- Edit:
  ```text
  Input: repo/workflow index；dist 构建；新脚本。
  Output: spec incremental-coverage 条目（口径/阈值/缺席硬拒/豁免/三格式/路径归一，英文）；dist 同 commit；自身增量证据命令实值（P2-10）。
  Preconditions: Steps 1-13 全绿
  Procedure:
    - spec 条目（英文）。
    - pnpm -r build；dist 与 src 同 commit。
    - 自身证据（双包采集，命令可复跑）：从 task.json 读 worktree_path（相对项目根，须 resolve 为绝对路径）与 base_branch；mkdir -p <worktree>/coverage。
      在 worktree 内 node --test --experimental-test-coverage --test-reporter=lcov 'packages/core/test/*.test.ts' > coverage/lcov-core.info（glob 形式与 core package.json test 脚本同形；目录形式报 MODULE_NOT_FOUND）。
      同法 'packages/dsh-workloom/test/*.test.ts' > coverage/lcov-dsh.info。
      node packages/core/resources/scripts/task-diff-coverage.mjs <worktree-abs> <base_branch> coverage/lcov-core.info coverage/lcov-dsh.info --out-dir coverage（双包报告合并，dsh 变更行入分母）。
  Failure: 自身增量 ≤90% → 按 R7 附原因审核。
  ```
- Verify: `pnpm lint`/`pnpm -r typecheck`/`pnpm -r build`/两包 `node --test` 退出 0；`git diff --check`；coverage/diff-coverage.json 存在且 meetsThreshold。
