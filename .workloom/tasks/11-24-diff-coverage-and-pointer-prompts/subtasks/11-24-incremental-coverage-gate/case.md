---
version: 1
task: tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate
---

<!-- checker-discipline: how the Checker authors and revises this CASE; re-read before writing or changing any section
- SR/C writing: one entry covers one cohesive slice of one file — Target names a single file path (`<file>#<symbol>` or the whole file), every Check is a decidable yes/no structure, type, naming, behavior, or spec conformance check, and Expected states a decidable code property, never a restatement of requirement intent.
- Traceability: every AC in prd.md is covered by at least one SR or one C row in the Traceability table; an uncovered AC is a CASE defect, and Coverage Exclusions only relax statistics, never the AC mapping.
- Evidence integrity: Evidence cites real observed anchors as `<file>:<line>` instead of restating the Expected text; probe scripts live in `case-evidence/probes/` with only pointers in prose; compute `codeFingerprint` for C5 with the core package's package-relative script `scripts/task-fingerprint.mjs` (under `resources/`, never a repo-absolute path) and record the 64-hex value in the result's codeBaseline.
- Result discipline: the Standard Verification exit-code cell is bare `0`; both cells of every Exclusions row are backtick-wrapped; Overall coverage lines use the `covered/total (pct%)` form only; the last section of the result is `## Open issues` and its body is exactly `- none` when clean.
-->

# CASE: 增量覆盖率门禁与采集脚本

## References

- PRD: `prd.md`
- Implementation: `plan.md`（14 个实施步骤；行号锚点以代码基线 `main`@`4b5454f` 为准，终态以 worktree 实际变更为准）
- Code target: worktree `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-incremental-coverage-gate`（分支 `workloom/11-24-incremental-coverage-gate`，base `main`，基线提交 `4b5454f`）。下文 `<WT>` 指该 worktree 的绝对路径；`<task>` 指主检出侧任务目录 `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate`（本文件所在目录，不是 worktree 副本）；相对路径以 `<WT>` 为根。
- Source task: none（容器任务 `tasks/11-24-diff-coverage-and-pointer-prompts` 的 S1，无前置子任务）

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7、R8、R9、R10、R11、R12
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5、AC6、AC7
- Out of scope:
  - S2（派发注入纯指针化、模板 init）、S3（config 编辑 skill）、S4（覆盖率工具配置驱动）；本任务门禁按 CASE 声明与报告正文推断格式。
  - 不回测 B07、不改 zephyra、不改项目侧采集命令本身、不引入第三方 diff-cover 依赖。
  - 生产 DSH 实例操作：不重启实例、不执行 `dsh-stop`/`dsh-start`、不改 profile 与 pnpm-lock、不 push；新门禁自部署后下一个任务生效。
  - 代码提交：CASE 执行轮零 commit；`dist/` 与 src 的同 commit 由主会话在 2.4 落实，本 CASE 只验 dist 镜像守卫与变更集。
  - `packages/core/src/task/task-ops.ts` 既有 1289 行超限属任务前状态，PLAN（P2-11）决定本轮不拆分；本任务只加入参透传与豁免构造调用，不把行数超限列为本任务发现项，由主会话另立后续任务。
  - 探针、夹具与临时仓库只建在 `mktemp -d` 的临时目录并自清理；证据只写 `<task>`（`case-result.md`、`case-evidence/`、`coverage/`）。开发者已在 worktree 根留下自测用的 `coverage/` 目录（PLAN 步骤 14），执行轮不往里写、不提交，列入 Exclusions；worktree 内不新建 `case-evidence/`。

## Static Review

### SR1 git 变更行原语 gitDiffChangedLines

- Covers: `AC1、AC5`
- Target: `packages/core/src/workspace/git-query.ts#gitDiffChangedLines`
- Checks:
  1. 新增冻结常量 `GIT_DIFF_LINES_ARGS`，值恰为 `['diff', '--no-color', '-M', '--unified=0', '--diff-filter=d']`；新增并导出 `ChangedLineRange { start: number; end: number }`（闭区间，新版本行号）。
  2. 导出同步函数 `gitDiffChangedLines(root: string, baseRef: string | null): [GitCommandError | null, Map<string, ChangedLineRange[]> | null]`（返回元组，非 Promise）；git 经同步助手执行（`execFileSync`，`LC_ALL=C`，stderr 走管道保留在错误文案中），参数在固定前缀后依次追加 ref 参数与 `--`。
  3. ref 参数：`baseRef` 非空时为 `${baseRef}...HEAD`（三点，merge-base 口径）；`baseRef === null` 时为 `HEAD`（两点），并追加 `ls-files --others --exclude-standard` 的未跟踪文件，逐文件读行计数（二进制文件跳过），全部行视为新增区间。
  4. hunk 头解析 `@@ -a,b +c,d @@`：新侧 count 省略按 1；`d > 0` 时记录 `[c, c + d - 1]`；`d === 0`（纯删除行）不记录。
  5. `-M` 重命名归并到新路径（Map 键为 repo 相对新路径）；同一文件的相邻或重叠区间合并为一个闭区间。
  6. ref 无效（分支已删或不存在）或 root 非 git 目录时返回 `[err, null]`，`err.stderr` 携带 git 原始文案；不回退到两点口径。
  7. `gitChangedFilesSync`、`gitStatusSync` 等既有函数与 `GIT_DIFF_CHANGED_ARGS` 逐字不变；新函数与常量有中文注释说明口径；无 magic string（ref 拼接用模板字面量，`HEAD` 与 `--` 的出现处各有注释或常量）。
- Expected: 增、改、删、重命名四种形态与两种基线口径的区间输出可逐值判定；删除行不入结果；无效 ref 返回 err 而非空 Map。

### SR2 增量覆盖率单一计算源 coverage-compute

- Covers: `AC1、AC2、AC5`
- Target: `packages/core/src/task/coverage-compute.ts#whole-file`
- Checks:
  1. 新文件落位；具名导出 `EXECUTABLE_EXTENSIONS`、`meetsThreshold`、`buildWaiver`、`inferFormat`、`parseGoCoverprofile`、`parseLcov`、`parseJacocoXml`、`computeDiffCoverage`，以及类型 `CoverageLine`、`ParsedCoverageFile`、`DiffCoverageFile`、`DiffCoverageResult`、`ComputeDiffCoverageInput`、`CoverageWaiverRecord`；只 import `node:fs`、`node:path`、`../workspace/git-query.ts` 与 `./case-structure.ts`（`ChangedLineRange` 用 `import type`），不依赖 dsh 包。
  2. `EXECUTABLE_EXTENSIONS` 为冻结封闭集合，成员恰为 `.go .ts .tsx .js .jsx .mjs .cjs .py .rs .c .h .cpp .cc .cxx .hpp .hxx .java .kt .kts`；以 `.d.ts` 结尾的路径判定为非可执行（先排除 `.d.ts` 再匹配后缀）。
  3. `meetsThreshold(covered, total)` 的实现为 `covered * 100 > total * 90`（整数交叉乘，无浮点）；`buildWaiver(reason, fingerprint)` 返回 `{ reason, fingerprint, at: <ISO-8601 当前时刻>, source: 'main' }`。
  4. `inferFormat(text)`：行首 `mode:` → `go`；同时含行首 `SF:` 与 `DA:` → `lcov`；含 `<report` → `jacoco-xml`；其余 → `unsupported`。多报告合并规则：任一 `unsupported` → `unsupported`；全部相同 → 该格式；否则 `mixed`。
  5. 路径归一（`input.root` 常驻）：go 路径先剥 `<root>/go.mod` 的 module 前缀（无 go.mod 则保留原串）；lcov 绝对 `SF:` 剥 root 前缀转 repo 相对，相对 `SF:` 原样保留；jacoco 以 `package/@name` 与 `sourcefile/@name` 拼路径。归一串不直接等于 diff 路径时做双向后缀匹配（diff 路径以候选为后缀，或候选以 diff 路径为后缀）；多候选命中返回 `[err, null]`（err 文案含歧义路径），零候选保留归一串。
  6. 三格式逐行语义：go 块 `startLine.startCol,endLine.endCol numStmt count` 展开为首末行闭区间，`count > 0` 为 covered；lcov `DA:line,hits` 中 `hits > 0` 为 covered，非法 `DA` 行返回 err；jacoco `<line nr mi ci mb cb>` 中 `ci > 0` 为 covered（java 与 kotlin 共用同一解析）。
  7. 交集：对每个变更文件把 `changedRanges` 展开为行集合，与 measurable 行集合的交为 `total`，其中 covered 行数为 `covered`；`uncoveredRanges` 为可测未覆盖行压缩后的闭区间；`changedRanges` 原样回传；`overall = { covered: Σcovered, total: Σtotal }` 均为整数；`files` 按路径排序。
  8. `missingExecutableFiles` = 可执行后缀的变更文件 − 报告文件集合 − `exclusions` 命中项，排序输出；非可执行后缀文件缺席不进入该列表；被排除的文件不进入 `files`。
  9. `format === 'unsupported'` 时直接返回 `{ files: [], overall: { covered: 0, total: 0 }, missingExecutableFiles: [], format }`，不做解析与缺席检测。
  10. `computeDiffCoverage(input)`：`input.changedLines` 存在时不调用 git；否则调用 `gitDiffChangedLines(input.root ?? '', input.baseRef ?? null)` 并透传 err；多报告按文件合并、同一行覆盖取并（任一报告 covered 即 covered）；返回形态恒为 `[err, result]`。
  11. 模块无写文件、无子进程等副作用（只读 `go.mod`）；中文注释说明设计意图；文件不超过 600 行；无 `@ts-ignore`/`@ts-expect-error`。
- Expected: 变更行混入未改动行时只有变更行进分母；三格式与多报告合并的逐文件 `covered/total` 可逐值判定；阈值边界 9/10 为 false、10/10 与 91/100 为 true；缺席可执行文件与非可执行文件可区分。

### SR3 采集脚本 task-diff-coverage CLI

- Covers: `AC5、AC6`
- Target: `packages/core/resources/scripts/task-diff-coverage.mjs#whole-file`
- Checks:
  1. 新文件落位于 `packages/core/resources/scripts/`（与 `task-fingerprint.mjs` 同目录）；ESM；只 import `../../dist/task/coverage-compute.js` 与 `../../dist/workspace/git-query.js`（必要时 `node:fs`、`node:path`、`node:url`），不 import `src/`。
  2. 命令行形态：`node task-diff-coverage.mjs <worktree> <baseRef> <report...> [--json] [--out-dir <dir>] [--exclude <pattern>]...`；位置参数至少 3 个（worktree、baseRef、一份报告），不足时抛 usage 错误并以非零码退出；`<baseRef>` 为 `-` 或空串时按 `null`（工作区口径）处理。
  3. `--exclude <pattern>` 可重复出现，pattern 语义与 CASE Exclusions 相同（目录尾斜杠前缀、精确路径、段内 `*`、跨层 `**`，经 `isExcluded` 判定），统一映射为 `computeDiffCoverage` 的 `exclusions`（Map，值固定为说明串）。
  4. `--out-dir <dir>`：在该目录写 `changed-lines.json`（对象，键为文件路径，值为 `[{ start, end }]` 区间数组，即变更行清单）与 `diff-coverage.json`（`DiffCoverageResult` 原样：`files`、`overall`、`missingExecutableFiles`、`format`）；省略 `--out-dir` 时不写任何文件。
  5. stdout：`--json` 输出与 `diff-coverage.json` 相同的 JSON；否则输出 markdown——逐文件 `covered/total` 与未覆盖变更行区间的表格、`Overall: covered/total (pct%)` 行、`Format: <format>` 行，缺席清单非空时追加 `Missing executable files: ...` 行。
  6. 入口守卫：仅当 `pathToFileURL(resolve(process.argv[1])).href === import.meta.url` 时执行主流程；主流程函数具名导出，供测试以 import 方式调用（使脚本行进入 coverage 报告）。
  7. 失败路径：报告文件缺失、git 错误、解析错误均原样抛出并以非零码退出，不输出部分结果；`--out-dir` 缺值或未知 `--` 选项抛 usage 错误。
  8. 报告路径相对当前工作目录解析，worktree 参数经 `resolve` 转绝对路径后作为 `root`；脚本内注释为中文，usage 与错误文案为英文。
- Expected: 同一夹具经 CLI 与直接调用 `computeDiffCoverage` 得到相同 `overall` 与 `files`；`--out-dir` 产物可被 `JSON.parse` 且字段齐全；`--exclude` 命中的文件不进 `files` 与缺席清单。

### SR4 CASE 结构常量与选项 CaseStructureOptions

- Covers: `AC2、AC3、AC4`
- Target: `packages/core/src/task/case-structure.ts#CaseStructureOptions`
- Checks:
  1. `CASE_STRUCTURE.coverageStatuses` 为 `['generated', 'below_threshold', 'not_applicable', 'failed']`（冻结数组，`below_threshold` 为新增成员）；`resultStatuses`、`caseSections`、`resultSections`、`srFields`、`cFields`、`coverageFields` 逐字不变。
  2. `CaseStructureOptions` 新增三个可选字段：`coverageWaiver?: { reason: string; fingerprint: string }`、`changedLines?: Map<string, ChangedLineRange[]>`、`exclusions?: Map<string, string>`；`ChangedLineRange` 以 `import type` 自 `../workspace/git-query.ts` 导入。
  3. `inspectCaseStructure` 不读取三个新字段（结构校验行为不变）；`isExcluded`、`exclusionMatches`、`parseExclusions` 语义不变并保持导出供 `coverage-compute.ts` 复用。
  4. `coverageStatuses` 的每个值都出现在 `case-result.md` 模板中（由 contract-asset 用例逐值钉住，见 SR21）。
- Expected: 值域与选项类型可逐字判定；结构校验的既有用例输出不变。

### SR5 CASE 变更行范围 listCaseChangedLines

- Covers: `AC1`
- Target: `packages/core/src/task/case-scope.ts#listCaseChangedLines`
- Checks:
  1. 新增导出同步函数 `listCaseChangedLines(root: string, task: TaskRecord): [Error | null, Map<string, ChangedLineRange[]> | null]`（返回元组，非 Promise，与守卫注册表的同步签名一致）。
  2. `baseRef` 取值：`task.branch` 与 `task.base_branch` 均为非空字符串时传 `task.base_branch`；否则传 `null`。
  3. 以 `worktreeDirectory(root, task)` 为 root 调用 `gitDiffChangedLines`，err 原样透传（不吞错、不回退）。
  4. 返回前过滤 `.workloom/` 前缀的文件（返回新 Map，不改原 Map）。
  5. `taskDirectory`、`worktreeDirectory`、`listCaseChangedFiles` 逐字不变；新函数有中文注释说明「branch 加 base_branch 用三点口径，字段为空回退工作区口径」。
- Expected: 有分支任务传 base_branch、无分支任务传 null；`.workloom/` 文件不进结果；git 错误可见。

### SR6 增量门禁 evaluateCaseOutcomeGate

- Covers: `AC1、AC2、AC3、AC5`
- Target: `packages/core/src/task/case-gates.ts#evaluateCaseOutcomeGate`
- Checks:
  1. 变更行来源：`options.changedLines` 优先；缺省时调用 `listCaseChangedLines(root, task)`；失败追加 `git_changed_lines` 问题并继续汇总其余问题，不回退到 SR 声明文件集。
  2. 报告读取：RESULT `Raw reports` 中每个 `coverage/...` 路径相对任务目录解析（越界沿用 `artifact_path_invalid`；缺失追加 `coverage_report_missing`），多份报告正文全部传入复算；`generated` 与 `below_threshold` 无任何报告时追加 `coverage_raw`。
  3. 复算调用形如 `computeDiffCoverage({ root: worktreeDirectory(root, task), changedLines, reports, exclusions })`（root 显式为任务 worktree，供路径归一；`exclusions` 来自 CASE Coverage 节）；解析 err 追加 `coverage_parse`。
  4. 复算结果同步可用：`evaluateCaseOutcomeGate` 与 `evaluateGuard('case-outcome-ready')` 保持同步返回（issues 数组与 `[err, reason]`），传入 `changedLines` 时复算不产生未等待的 Promise；C2 的 `coverage_recompute` 与 `coverage_missing_file` 用例能实际触发即为证据。
  5. 受支持格式（`go`、`lcov`、`jacoco-xml`、`mixed`）：`missingExecutableFiles` 非空追加 `coverage_missing_file`，该检测对 `generated`、`below_threshold`、`not_applicable` 三种状态统一生效；RESULT Changed Files 表逐文件 `covered/total` 与 `Overall lines` 的整数部分必须等于复算值，否则追加 `coverage_recompute`；Changed Files 文件集合必须等于复算文件集合，否则追加 `coverage_files`。
  6. 不支持格式：期望文件集合回退为变更文件集（减 `.workloom/`、Exclusions 命中项与不存在文件）；跳过缺席检测与逐文件复算；阈值仍按 RESULT 自报 `Overall lines` 的整数校验。
  7. 阈值分支：`meetsThreshold` 不达标且 Status 为 `generated` → `coverage_threshold`；达标且 Status 为 `below_threshold` → `coverage_status`；不达标且 Status 为 `below_threshold` → 豁免有效才通过，否则 `coverage_waiver`；豁免来源为 `options.coverageWaiver ?? task.check?.coverageWaiver`，有效条件为 `reason` trim 后非空且 `fingerprint` 等于 RESULT 指纹。
  8. 指纹来源：从 RESULT front-matter `codeBaseline` 字符串以正则 `codeFingerprint=([0-9a-f]{64})` 提取；不新增 front-matter 顶层键。
  9. `below_threshold` 另要求 Coverage 节存在 `### Below Threshold` 子节且至少一行形如 `- \`<file>\`: <reason>`，否则 `coverage_below_reasons`。
  10. `not_applicable`：期望文件集合须为空（否则 `coverage_not_applicable`）、Changed Files 表为空、`Overall lines` 为 N/A 形态，并要求 `- Reason:` 行非空（否则 `coverage_na_reason`）；原「Exclusions 非空」约束删除。
  11. `Summary` 的 `Coverage` 字段与 Coverage 节 `Status` 相等检查（`coverage_summary`）对 `below_threshold` 同样生效；`case-outcome-ready` 不在 `FORCEABLE_GUARD_GATES`（核对既有状态，不改）。
  12. 复算与核对逻辑抽为内部函数；文件不超过 600 行；issue code 为稳定英文 snake_case 字面量且各只出现一处；新代码注释为中文。
- Expected: 90.0% 与 90.1% 两侧、缺席、复算不一致、豁免匹配与失效、not_applicable 缺原因、unsupported 回退各产生可判定的问题码；`force` 对以上问题一律无效。

### SR7 豁免记录类型 TaskCheckRecord.coverageWaiver

- Covers: `AC4`
- Target: `packages/core/src/task/storage/records.ts#TaskCheckRecord`
- Checks:
  1. `TaskCheckRecord` 新增可选字段 `coverageWaiver?: CoverageWaiverRecord`；`passedAt`、`summary` 不变。
  2. `CoverageWaiverRecord` 在 core src 内只定义一处（`grep -rn "interface CoverageWaiverRecord" packages/core/src` 恰一行命中；records.ts 与 coverage-compute.ts 之间以 `import type` 复用，不重复定义）；字段为 `reason: string`、`fingerprint: string`、`at: string`、`source: 'main' | 'user' | 'auto'`。
  3. `TaskRecord.check: TaskCheckRecord | null` 与存储层读写（`read-write.ts`）不改；旧记录缺该字段读作 `undefined`。
  4. 字段有中文注释：豁免绑定 RESULT `codeBaseline` 中的代码指纹，代码再变更即失效。
- Expected: 类型面可逐字判定；旧 task.json 无需迁移即可读写。

### SR8 check 入参与守卫透传 checkTaskInternal

- Covers: `AC4`
- Target: `packages/core/src/task/task-ops.ts#checkTaskInternal`
- Checks:
  1. `CheckTaskParams` 与 `ExecuteCheckTaskParams` 均新增 `coverageWaiver?: { reason: string }`；`executeCheckTask` 把该字段透传给 `checkTask`。
  2. `checkTaskInternal`：`coverageWaiver` 传入且 `reason` trim 后为空时，在调用 CASE 门禁之前抛错（前缀 `TASK_ERR_PREFIX`，文案含 `coverageWaiver` 与 `reason`）。
  3. 指纹读取：从 RESULT front-matter `codeBaseline` 以 `codeFingerprint=([0-9a-f]{64})` 提取；缺失时抛错且文案指向 `resources/scripts/task-fingerprint.mjs`；以 `buildWaiver(reason, fingerprint)` 构造记录，并把 `{ reason, fingerprint }` 放入 `ctx.coverageWaiver` 后再调用 `evaluateGuard('case-outcome-ready', view, ctx)`。
  4. 凭据写入：门禁通过且传入 `coverageWaiver` → `credential.coverageWaiver` 为新构造记录；未传入但门禁经 `task.check.coverageWaiver` 回退通过 → 新凭据继承既有记录（`reason`、`fingerprint`、`at`、`source` 不变）；门禁拒绝 → 不写凭据、不写 overrides（既有语义）。
  5. 门禁拒绝文案仍含 `cannot be bypassed with force`；`force` 路径（`assertTaskForceReason`、`recordGateOverride`）逐字不变。
  6. 本文件只新增入参透传、指纹读取与 `buildWaiver` 调用，不新增与豁免无关的逻辑；`buildWaiver` 的构造逻辑位于 `coverage-compute.ts`。
- Expected: 空原因在门禁前被拒；豁免记录与凭据同次写入；复查路径继承既有豁免。

### SR9 守卫上下文 GuardContext.coverageWaiver

- Covers: `AC4`
- Target: `packages/core/src/task/state/guards.ts#GuardContext`
- Checks:
  1. `GuardContext` 新增可选字段 `coverageWaiver?: { reason: string; fingerprint: string }`；`root` 与 `taskRelPath` 不变。
  2. `guardCaseOutcomeReady` 调用 `evaluateCaseOutcomeGate` 时把 `{ coverageWaiver: ctx.coverageWaiver }` 并入选项对象（`changedLines` 与 `exclusions` 不在此传递）。
  3. `FORCEABLE_GUARD_GATES` 不含 `case-outcome-ready`（硬守卫，核对即可）；`GUARDS` 注册表与其余守卫不变。
- Expected: 上下文带豁免时门禁可见，不带时门禁按既有路径回退到 `task.check`；守卫表无新增键。

### SR10 迁移透传 evaluateTransition 与 migrateTask

- Covers: `AC4`
- Target: `packages/core/src/task/state/migrate.ts#evaluateTransition`
- Checks:
  1. `evaluateTransition` 的 `options` 类型新增 `coverageWaiver?: { reason: string; fingerprint: string }`，并把该字段注入 `GuardContext`。
  2. `migrateTask` 调用 `evaluateTransition` 时传入 `params.patch?.check?.coverageWaiver`（首次 check 从 IMPLEMENTING 迁入 CHECKING 时重评携带豁免）；`patch.check` 仍在守卫通过之后经 `Object.assign` 写入，顺序不变。
  3. 硬守卫拒绝文案仍含 `hard guards cannot be bypassed with force`；`assertForceReason`、`bypassedGates` 留痕逻辑逐字不变。
  4. 归档与复查迁移不传 `coverageWaiver` 时，门禁经 `task.check.coverageWaiver` 回退（SR6 第 7 条），迁移层不做额外判断。
- Expected: 首次 check 迁移与无豁免迁移的放行与拒绝可判定；凭据字段与迁移原子同写。

### SR11 工具文案面 taskCheck 签名与描述

- Covers: `AC4`
- Target: `packages/core/src/injection/surface.ts#TOOL_SNIPPETS.taskCheck`
- Checks:
  1. `TOOL_SNIPPETS.taskCheck` 的签名串在 `reason?` 之后追加 `coverageWaiver?`，破折号后的说明保持 `record the 2.3 check pass`。
  2. `TOOL_DESCRIPTIONS.taskCheck` 仍含 `2.3 check pass`，并补充一句说明 `coverageWaiver`（可选对象，记录不达标豁免）。
  3. `PARAM_DESCRIPTIONS` 新增键 `coverageWaiver`，英文描述说明：对象且 `reason` 必填非空；仅在 RESULT Coverage 为 `below_threshold` 且指纹匹配时被接受；随 check 凭据写入 task.json。
  4. `TOOL_NAMES` 不变（不新增工具名）；`TOOL_SNIPPETS` 键集合不变（surface.test 钉住）。
- Expected: 三个文案面均可逐字定位到 `coverageWaiver`；工具名集合与既有钉住项不变。

### SR12 dsh check 工具 schema 与透传

- Covers: `AC4`
- Target: `packages/dsh-workloom/src/tooling/tasks.ts#checkTaskTool`
- Checks:
  1. `workloom_task_check` 的 schema `properties` 新增 `coverageWaiver`：`{ type: 'object', properties: { reason: { type: 'string', description: PARAM_DESCRIPTIONS.coverageWaiver } }, required: ['reason'], additionalProperties: false }`；顶层 `additionalProperties: false` 与 `required: []` 不变。
  2. `checkTaskTool` 仅当 `typed.coverageWaiver` 为对象且其 `reason` 为字符串时透传 `{ reason }` 给 `executeCheckTask`，否则不传该字段。
  3. 文件内只有 schema 与取值透传两处改动（插件层薄投影，不自持校验逻辑）；`dist/` 由 C6 同批重建验证。
- Expected: schema 校验层拒绝缺少 `reason` 或带多余键的 `coverageWaiver`；合法对象原样到达 core。

### SR13 CASE 模板 case.md 的 Coverage 节

- Covers: `AC1、AC2`
- Target: `packages/core/resources/templates/case.md#whole-file`
- Checks:
  1. Coverage 节 `- Scope:` 的说明改为任务增量口径：分母是任务 diff 新增或修改的可执行行，删除行不计。
  2. `- Raw outputs:` 列出 `coverage/<tool-native-report>`、`coverage/changed-lines.json`、`coverage/diff-coverage.json` 三项。
  3. 顶部 checker-discipline 注释的 Result discipline 行保留 `covered/total (pct%)` 形态要求，并补两句：Changed Files 行只计变更行；`below_threshold` 须附逐文件原因。
  4. `CASE_STRUCTURE` 的全部章节与字段仍逐字出现在模板中（contract-asset 用例钉住）；模板正文为英文。
- Expected: 模板同时描述原生报告、变更行清单与交集结果三类产物；结构钉住用例不红。

### SR14 RESULT 模板 case-result.md 的 Coverage 与状态值

- Covers: `AC1、AC2、AC3、AC6`
- Target: `packages/core/resources/templates/case-result.md#whole-file`
- Checks:
  1. front-matter 键集合仍恰为 `version`、`task`、`codeBaseline`、`checkSession`、`status`、`startedAt`、`completedAt`（case-templates 钉住）；`codeBaseline` 的占位说明含 `codeFingerprint=<64-hex>`。
  2. Summary 的 `Coverage` 值域追加 `below_threshold`；Coverage 节 `Status` 值域追加 `below_threshold`。
  3. `### Changed Files` 表的说明改为变更行口径：`Covered/Total` 为变更行的 covered/total，`Uncovered lines` 为未覆盖变更行区间。
  4. 新增 `### Below Threshold` 子节模板，逐文件一行 `- \`<file>\`: <reason>`；`not_applicable` 的原因载体为独立 `- Reason:` 行。
  5. `- Overall lines:` 形态保持 `covered/total (pct%)`；`## Open issues` 仍为最后一个小节且样例为 `- none`；模板正文为英文。
- Expected: 四个覆盖率状态值在模板中均可定位；Below Threshold 与 Reason 两种原因载体并存且形态不同。

### SR15 workflow 2.3 步骤文本同步

- Covers: `AC1、AC2、AC4、AC7`
- Target: `packages/core/resources/workflow/workflow.md#2.3-check`
- Checks:
  1. 采集句（基线 L96）改为：收集任务 diff 新增或修改可执行行的增量行覆盖率，严格大于 90% 为硬门禁；不达标时 checker 附逐文件原因、developer 附说明交主会话审核——属实记录豁免，不属实退回（无关代码交 developer 删除、case 缺口交 checker 补用例、全量重跑）。
  2. 凭据句（基线 L111）在 `check.passedAt` + `check.summary` 之后补 `check.coverageWaiver`（传入时写入）。
  3. 合格状态句（基线 L112）改为 coverage is generated, below_threshold with a valid waiver, or validly not_applicable。
  4. front-matter `version` 不升，`states` 列表与 `####` 步骤集合及顺序不变（`git diff main -- packages/core/resources/workflow/workflow.md` 中不出现 `version:` 行的增删）。
  5. 文本为英文；contract-asset 与 workflow-contract 的钉住用例同步（SR21、C6）。
- Expected: 三处语义均可在新文本中定位；版本号与步骤集合与基线逐字一致。

### SR16 spec 新条目 incremental-coverage

- Covers: `AC7`
- Target: `.workloom/spec/repo/workflow/index.md#whole-file`
- Checks:
  1. 新增一条 `- incremental-coverage: ...` 条目，内容覆盖：口径（`base_branch...HEAD` 新增或修改的可执行行，删除行不计）、阈值（严格大于 90%，core CASE failure，`force` 不可绕过）、缺席硬拒（可执行变更文件须出现在报告或带原因的 Exclusions，否则 `coverage_missing_file`）、豁免（`workloom_task_check` 的 `coverageWaiver`，绑定 RESULT `codeFingerprint`，写入 `task.json.check`）、三格式机械复算（go coverprofile、lcov、jacoco-xml；其余格式回退一致性校验）、`not_applicable` 的 `- Reason:` 行。
  2. 条目形态与同文件既有条目一致（`- <kebab-name>: <text>` 单行）；既有条目不改不删。
  3. 改动落在 worktree 分支上的 spec 副本（随 2.4 合入主线），不直接改主检出的 spec 文件。
- Expected: `grep -n "incremental-coverage" .workloom/spec/repo/workflow/index.md` 恰一行命中且为英文。

### SR17 git.test.ts 变更行用例

- Covers: `AC1、AC5`
- Target: `packages/core/test/git.test.ts#whole-file`
- Checks:
  1. 新增 `gitDiffChangedLines` 用例，覆盖：三点口径下新增、修改、删除与单行 hunk（删除行不入结果）；重命名（纯 rename 不入结果，带内容修改归到新路径）；无分支工作区口径（两点 diff 加未跟踪文件读行，二进制跳过）；无效 ref 与非 git 目录均返回 err。
  2. 夹具用 `mkdtempSync` 临时仓库并在 `finally` 清理；相等判定写到具体区间数值。
  3. 既有用例不删、不改语义；新用例名含 `gitDiffChangedLines` 关键词。
- Expected: 七类形态各有可定位用例且逐值判定；无残留临时目录。

### SR18 coverage-compute.test.ts 三格式与交集用例

- Covers: `AC1、AC2、AC5`
- Target: `packages/core/test/coverage-compute.test.ts#whole-file`
- Checks:
  1. 新文件；用例覆盖：go 路径形态（剥 module 前缀与无 go.mod 后缀匹配）、lcov（绝对 `SF:` 剥 root 前缀；未改动行不进分母）、jacoco（后缀匹配、`ci > 0`、多候选歧义返回 err）、单行 hunk、缺席可执行文件（可执行入缺席清单、非可执行不触发、带原因排除不入）、`.d.ts` 不计入可执行、空分母、unsupported（标记且跳过缺席检测）、多报告合并取并、`meetsThreshold` 边界（9/10 false、90/100 false、10/10 true、91/100 true）、`buildWaiver` 与 `inferFormat`。
  2. 交集用例经 `changedLines` 入参注入（不依赖真实 git）；git 提取路径只在 git.test.ts 覆盖。
  3. 「不得包含」类检查使用完整结构形式（完整路径或整行形态），不用裸子串；用例名含格式关键词便于 `--test-name-pattern` 定位。
- Expected: 每个格式与分支至少一个可定位用例；全部用例可在 C1 日志中逐条勾选。

### SR19 case.test.ts 门禁夹具与阈值用例

- Covers: `AC1、AC2、AC3、AC4、AC5`
- Target: `packages/core/test/case.test.ts#whole-file`
- Checks:
  1. 夹具更新：`validResult` 的 `codeBaseline` 形如 `main@abc; codeFingerprint=<64 位十六进制>`；Coverage 节 `Raw reports` 指向 `coverage/lcov.info`，`makeRoot` 写入与 RESULT 数字一致的 lcov 夹具；门禁用例经 `options.changedLines` 注入复算输入。
  2. 新增门禁用例并可定位：恰好 90% 拒（`coverage_threshold`）与大于 90% 过；`checkTask` 带 `force: true` 与 `reason` 对不达标 RESULT 拒绝且 task.json 无 `check`、`overrides` 为 `[]`；`archiveTask` 带 `force: true` 同样拒绝且任务目录不移动；缺席可执行文件硬拒；非可执行文件缺席不触发；复算不一致（`coverage_recompute`）；豁免匹配通过；指纹失效拒绝（`coverage_waiver`）；`not_applicable` 缺原因拒与带原因过（`coverage_na_reason`）；unsupported 报告阈值回退；复查继承既有豁免；首次 check 迁移端到端（IMPLEMENTING 加 `below_threshold` 加有效豁免 → 迁移通过并持久化；无豁免 → 拒）；`coverageWaiver.reason` 为空拒。
  3. 既有用例按新行为更新或保留语义（例如「纯文档范围允许 not_applicable」改为零分母加 `Reason`）。
  4. 「不得包含」类检查使用完整结构形式；改动前后的用例清单覆盖全部使用方（`coverageStatuses`、模板、workflow 句、`TOOL_SNIPPETS`）。
- Expected: AC2、AC3、AC4 的每条验收路径都有可定位用例；`node --test test/case.test.ts` 全绿。

### SR20 surface.test.ts taskCheck 文案钉住

- Covers: `AC4`
- Target: `packages/core/test/surface.test.ts#whole-file`
- Checks:
  1. 钉住 `TOOL_SNIPPETS.taskCheck` 含 `coverageWaiver?`，`TOOL_DESCRIPTIONS.taskCheck` 含 `coverageWaiver`，`PARAM_DESCRIPTIONS.coverageWaiver` 为非空字符串。
  2. 既有钉住项（`2.3 check pass`、不含 grilling、键集合与 `TOOL_NAMES` 对齐）保留。
- Expected: 文案面改动时用例同步变红；改动前后键集合一致。

### SR21 contract-asset.test.ts 模板与 workflow 钉住

- Covers: `AC2、AC7`
- Target: `packages/core/test/contract-asset.test.ts#whole-file`
- Checks:
  1. `coverageStatuses` 的遍历钉住保留并对 `below_threshold` 生效（RESULT 模板含该值）。
  2. 新增 workflow.md 三句钉住：增量行覆盖率与 `>90%` 门禁、`check.coverageWaiver` 写入、`below_threshold` 加有效豁免为合格状态；「不含」类钉住用完整句式（例如 `version:` 行无增删由 C6 的 git diff 核对）。
  3. 既有钉住项不删。
- Expected: 模板或 workflow 文本回退时用例变红；C6 日志中该文件全部用例通过。

### SR22 dsh tasks.test.ts check schema 钉住

- Covers: `AC4`
- Target: `packages/dsh-workloom/test/tasks.test.ts#whole-file`
- Checks:
  1. check 工具 schema 用例新增：`properties.coverageWaiver` 存在，`required` 为 `['reason']`，`additionalProperties` 为 `false`，`reason.description` 等于 `PARAM_DESCRIPTIONS.coverageWaiver`。
  2. 透传用例：注册的 check 工具收到 `coverageWaiver: { reason }` 时，core `executeCheckTask` 收到同值（以现有 mock 方式核对）。
  3. 既有「check 工具 schema 不再含 phase/required」用例保留。
- Expected: schema 形态与透传可判定；dsh 测试全绿。

### SR23 脚本单测 task-diff-coverage.test.mjs

- Covers: `AC5、AC6`
- Target: `packages/core/resources/scripts/task-diff-coverage.test.mjs#whole-file`
- Checks:
  1. 新文件；用例覆盖：`--out-dir` 写出两份产物且内容可解析；`--json` 只输出 JSON 且省略 `--out-dir` 时不写文件；缺参抛 usage 错误；`--exclude` 命中的文件不进 `files` 与缺席清单；以子进程方式真实运行一次并核对退出码为 0。
  2. 进程内用例经 import 调用导出的主函数（脚本行进入 coverage 报告）；夹具在 `mktemp` 目录并清理。
  3. 用例名含 `CLI` 关键词；core `package.json` 的 test 脚本 glob `resources/scripts/*.test.mjs` 已覆盖该文件（核对，不改）。
- Expected: 五类用例可定位；`lcov-core.info` 含 `SF:packages/core/resources/scripts/task-diff-coverage.mjs`。

## Runtime Cases

时序纪律：所有运行时用例以 `pnpm -r build` 先行为前提（core 测试直跑 src TS，但 CLI 与 C2 至 C4 的函数级探针 import core dist）；探针源码放 `<task>/case-evidence/probes/`，夹具放 `<task>/case-evidence/fixtures/`，临时仓库经 `mktemp -d` 创建并在 `finally` 删除；任何代码修复之后，SR 与全部 C 项全量重跑。

### C1 变更行原语、三格式交集与 CLI 产物

- Covers: `AC1、AC5`
- Preconditions:
  1. 已在 `<WT>` 执行 `pnpm -r build`，`packages/core/dist/task/coverage-compute.js` 与 `packages/core/dist/workspace/git-query.js` 存在。
  2. 探针在隔离 TMPDIR 下运行，不写生产目录。
- Steps:
  1. `cd <WT>/packages/core && node --test test/git.test.ts test/coverage-compute.test.ts resources/scripts/task-diff-coverage.test.mjs`，记录退出码与用例名清单（定位关键词：`gitDiffChangedLines`、go、lcov、jacoco、`missing`、`unsupported`、`meetsThreshold`、`CLI`）。
  2. 夹具仓库（探针 `case-evidence/probes/c1-diff-coverage-probe.mjs`）：临时目录 `git init` 并配置 user.name 与 user.email；基线提交包含 `go.mod`（内容 `module example.com/demo`）、`src/a.ts`（10 行，每行一条 `export const aN = N`）、`src/b.ts`（4 行）、`pkg/c.go`（6 行）、`src/Mapper.java`（5 行）、`docs/readme.md`（3 行）。提交后做未提交改动：`src/a.ts` 只改第 3 行与第 4 行；`git mv src/b.ts src/c.ts` 并改 `src/c.ts` 第 2 行；新建未跟踪 `src/new.ts`（3 行）；改 `docs/readme.md` 第 1 行；改 `pkg/c.go` 第 5 行；改 `src/Mapper.java` 第 4 行。
  3. 报告夹具（`case-evidence/fixtures/c1/`）：
     1. `lcov.info`：`SF:src/a.ts` 的 `DA:1,1` 到 `DA:10,1`，其中第 4 行为 `DA:4,0`；`SF:src/c.ts` 的 `DA:1,0`、`DA:2,3`、`DA:3,1`、`DA:4,1`。
     2. `cover.out`：首行 `mode: set`，随后 `example.com/demo/pkg/c.go:1.1,1.10 1 0` 与 `example.com/demo/pkg/c.go:5.5,5.10 1 1`。
     3. `jacoco.xml`：`<report name="example.com/demo"><package name="src"><sourcefile name="Mapper.java"><line nr="2" mi="3" ci="0" mb="0" cb="0"/><line nr="4" mi="0" ci="5" mb="0" cb="0"/></sourcefile></package></report>`。
  4. 运行 CLI（工作区口径，无排除）：`cd <WT> && node packages/core/resources/scripts/task-diff-coverage.mjs <fixture> - <lcov.info> <cover.out> <jacoco.xml> --json --out-dir <out-1>`；再运行一次追加 `--exclude src/new.ts`，输出目录 `<out-2>`。
  5. 三点口径核对：在夹具仓库 `git add -A && git commit` 后，以基线提交 sha 为 `<baseRef>` 再运行一次，输出目录 `<out-3>`。
  6. 区间交叉核对：`git -C <fixture> show --format= --unified=0 HEAD -- src/a.ts` 的新侧 hunk 头与 `<out-3>/changed-lines.json` 的 `src/a.ts` 区间比对。
  7. 把三份产物复制到 `<task>/case-evidence/`（`c1-worktree-no-exclude.json`、`c1-worktree-exclude.json`、`c1-three-dot.json`、`c1-changed-lines.json`）。
- Expected:
  1. 步骤 1 退出码 0；用例清单含 SR1 第 3 至 6 条、SR2 第 5 至 10 条、SR23 第 1 条对应的用例名。
  2. `changed-lines.json`：`src/a.ts` 的行集合为 {3,4}；`src/c.ts` 为 {2}；`src/new.ts` 为 {1,2,3}；`docs/readme.md` 为 {1}；`pkg/c.go` 为 {5}；`src/Mapper.java` 为 {4}；不含 `src/b.ts`。
  3. `<out-1>/diff-coverage.json`：`files` 恰为 `src/Mapper.java` 1/1、`src/a.ts` 1/2（`uncoveredRanges` 为 [{start:4,end:4}]）、`src/c.ts` 1/1、`pkg/c.go` 1/1；`overall` 为 `{ covered: 4, total: 5 }`；`missingExecutableFiles` 恰为 `["src/new.ts"]`；`format` 为 `mixed`。`src/a.ts` 的 lcov 整文件为 9/10，结果只计变更行 1/2，未改动行不进分母。
  4. `<out-2>`：`missingExecutableFiles` 为 `[]`，`overall` 仍为 4/5，`files` 不变。
  5. `<out-3>` 与 `<out-1>` 的文件集合与区间一致（重命名归新路径 `src/c.ts`），`diff-coverage.json` 的 `overall` 相同。
  6. 步骤 6 的 hunk 头新侧为 `+3,2`，与区间 {3,4} 一致。
  7. 步骤 1 日志中 `meetsThreshold` 用例记录 4/5、9/10、90/100 为 false，10/10 与 91/100 为 true。
- Evidence:
  - `case-evidence/c1-unit-tests.log`
  - `case-evidence/c1-probe.log`
  - `case-evidence/c1-worktree-no-exclude.json`
  - `case-evidence/c1-worktree-exclude.json`
  - `case-evidence/c1-three-dot.json`
  - `case-evidence/c1-changed-lines.json`
  - `case-evidence/fixtures/c1/lcov.info`、`case-evidence/fixtures/c1/cover.out`、`case-evidence/fixtures/c1/jacoco.xml`
- Cleanup: 探针在 `finally` 删除夹具仓库与 `<out-1>`、`<out-2>`、`<out-3>`。

### C2 门禁阈值、缺席硬拒与 force 不可绕过

- Covers: `AC1、AC2、AC5`
- Preconditions:
  1. C1 通过；`pnpm -r build` 已执行。
  2. 探针只调用函数级接口（dist 的 `evaluateCaseOutcomeGate`）与既有单测，不向任何真实任务写入凭据。
- Steps:
  1. `cd <WT>/packages/core && node --test test/case.test.ts`，记录退出码与用例名。
  2. 在输出中定位并逐条记录以下用例（以实际用例名为准）：恰好 90% 拒绝；大于 90% 通过；`checkTask` 带 `force: true` 与 `reason` 对不达标 RESULT 拒绝，错误文案含 `cannot be bypassed with force`，task.json 无 `check` 字段且 `overrides` 为 `[]`；`archiveTask` 带 `force: true` 同样拒绝且任务目录未移动；缺席可执行文件硬拒（`coverage_missing_file`）；非可执行文件缺席不触发；复算不一致（`coverage_recompute`）；文件集合不一致（`coverage_files`）；unsupported 报告下阈值按自报 Overall 校验且缺席检测跳过。
  3. 探针 `case-evidence/probes/c2-gate-threshold-probe.mjs`：临时项目 `git init`，基线提交 `src/a.ts`（10 行），随后改写全部 10 行；任务记录 `case.required` 为 true、`worktree_path` 为空、`branch` 与 `base_branch` 为空；CASE 与 RESULT 按 SR19 夹具形态生成；lcov 夹具 `SF:src/a.ts` 的 `DA:1,1` 到 `DA:9,1` 与 `DA:10,0`；RESULT `Status: generated`、`Overall lines: 9/10 (90.0%)`、Changed Files 行 `src/a.ts` `9/10`。探针经 `options.changedLines` 注入 `{ 'src/a.ts': [{ start: 1, end: 10 }] }` 并逐场景打印问题码：
     1. 场景 A（如上）→ 期望含 `coverage_threshold`。
     2. 场景 B：lcov 改为 10 行全部 hits=1，RESULT 改 `10/10 (100.0%)` → 期望问题列表为空。
     3. 场景 C：lcov 删除 `SF:src/a.ts` 段，另加一段 `SF:src/other.ts` 的 `DA:1,1`（不在变更集内，仅保持 lcov 格式可识别），RESULT 保持场景 A → 期望含 `coverage_missing_file`；再把 RESULT 改为 `not_applicable` 并补 `- Reason:` 行 → 期望仍含 `coverage_missing_file`。
     4. 场景 D：lcov 为场景 A，RESULT 自报 `10/10 (100.0%)` → 期望含 `coverage_recompute`。
     5. 场景 E：报告正文改为 `plain text without any known format`，RESULT 自报 `9/10 (90.0%)` → 期望含 `coverage_threshold` 且不含 `coverage_missing_file`；RESULT 改 `10/10 (100.0%)` → 期望问题列表为空（期望文件集合回退为变更文件集）。
  4. 把步骤 2 的用例定位结果写入 `case-evidence/c2-case-test-checklist.md`。
- Expected:
  1. 步骤 1 退出码 0；步骤 2 清单每条都有对应用例且为 pass。
  2. 探针五个场景的问题码与期望逐项一致；场景 C 的两种状态都被拒，证明缺席检测对 `not_applicable` 同样生效。
  3. `force` 路径：check 与 archive 均拒绝，无凭据写入、无 overrides 留痕、任务目录未移动。
- Evidence:
  - `case-evidence/c2-case-tests.log`
  - `case-evidence/c2-case-test-checklist.md`
  - `case-evidence/c2-gate-threshold-probe.log`
- Cleanup: 探针在 `finally` 删除临时项目。

### C3 not_applicable 零分母原因与排除项反规避

- Covers: `AC3`
- Preconditions:
  1. C2 通过；`pnpm -r build` 已执行。
- Steps:
  1. 在 C2 步骤 1 的输出中定位 not_applicable 用例：纯文档变更（`changedFiles` 仅 `docs/guide.md`）加 `- Reason:` 非空 → 通过，且 CASE Exclusions 为空也通过；删除 `- Reason:` → `coverage_na_reason`；全部可执行变更文件被带原因排除 → `not_applicable` 加 Reason 通过。
  2. 探针 `case-evidence/probes/c3-not-applicable-probe.mjs`（函数级，同 C2 的临时项目构造）：
     1. 场景 A：只改 `docs/readme.md`；CASE Exclusions 为空；RESULT `not_applicable`、`Overall lines: N/A`、Changed Files 表为空、`- Reason: documentation-only change, no executable lines` → 期望问题列表为空。
     2. 场景 B：删除 `- Reason:` 行 → 期望含 `coverage_na_reason`。
     3. 场景 C：再加 `src/a.ts` 的 10 个变更行且报告覆盖全部（lcov 10 行 hits=1），RESULT 仍声明 `not_applicable` → 期望含 `coverage_not_applicable`。
     4. 场景 D：`src/a.ts` 变更 10 行、报告只覆盖 5 行；CASE Exclusions 加 `src/a.ts: legacy adapter shim, tracked by follow-up task`，RESULT Exclusions 表同步同一行，Status 改 `not_applicable` 并补 Reason → 期望问题列表为空。
     5. 场景 E：在场景 D 基础上把 RESULT Exclusions 表的该行删除 → 期望含 `coverage_exclusions`。
     6. 场景 F：`src/a.ts` 变更 10 行、报告覆盖 5 行、无排除、RESULT `generated` 自报 `10/10 (100.0%)` → 期望同时含 `coverage_recompute` 与 `coverage_threshold`（排除与自报都不能把 50% 抬过阈值）。
  3. 把步骤 1 的用例定位结果写入 `case-evidence/c3-case-test-checklist.md`。
- Expected:
  1. 步骤 1 的四条用例可定位且为 pass。
  2. 探针六个场景与期望逐项一致：缺原因拒绝、有可测变更行时不得声明 `not_applicable`、排除必须带原因且 CASE 与 RESULT 两处一致、数字由复算决定。
- Evidence:
  - `case-evidence/c3-not-applicable-probe.log`
  - `case-evidence/c3-case-test-checklist.md`（用例定位引用 C2 的 `c2-case-tests.log`）
- Cleanup: 探针在 `finally` 删除临时项目。

### C4 豁免链路端到端：check 入参、task.json 记录、指纹失效与 schema

- Covers: `AC4`
- Preconditions:
  1. C1 至 C3 通过；`pnpm -r build` 已执行。
  2. 探针在隔离临时项目内写入 task.json，不触碰任何真实任务记录。
- Steps:
  1. `cd <WT>/packages/core && node --test test/case.test.ts test/surface.test.ts test/contract-asset.test.ts` 与 `cd <WT>/packages/dsh-workloom && node --test test/tasks.test.ts`，记录退出码与用例名。
  2. 在输出中定位并逐条记录以下用例：首次 check 带 `coverageWaiver` 通过并把记录持久化到 task.json；复查继承既有豁免；`reason` 为空拒；指纹失效拒；`below_threshold` 缺 Below Threshold 原因行拒；首次 check 迁移端到端（IMPLEMENTING 加 `below_threshold` 加有效豁免 → 迁移通过并持久化，无豁免 → 拒）；`TOOL_SNIPPETS.taskCheck` 含 `coverageWaiver?`；dsh check schema 含 `coverageWaiver` 对象且透传。
  3. 探针 `case-evidence/probes/c4-waiver-chain-probe.mjs`（真实 `checkTask` 调用，light 模式走凭据直写路径）：临时项目 `git init`，基线提交 `src/a.ts`（10 行），随后改写全部 10 行保持未提交；`.workloom/tasks/<rel>/` 下写 `prd.md`（含一个 AC）、`case.md`（按 SR19 夹具形态，Exclusions 为空，Raw reports 指向 `coverage/lcov.info`）、`coverage/lcov.info`（`DA:1,1` 到 `DA:9,1` 与 `DA:10,0`）、`case-result.md`（`Status: below_threshold`、Summary `Coverage: below_threshold`、`Overall lines: 9/10 (90.0%)`、Changed Files 行 `src/a.ts` `9/10`、`### Below Threshold` 含一行 `- \`src/a.ts\`: line 10 is a defensive branch unreachable in tests`、`codeBaseline: main@<基线 sha>; codeFingerprint=<hex-A>`、`checkSession: design-1`）、`task.json`（`status: in_progress`、`mode: light`、`case: { required: true, designSession: design-1, phase: done }`、`branch` 与 `base_branch` 与 `worktree_path` 为空、`dispatches` 含 checker 的 case-design 与 execution 两条记录且 `childId` 为 `design-1`、`check: null`、`overrides: []`）。`<hex-A>` 为任意 64 位十六进制串。逐场景调用并打印结果：
     1. 场景 A：`checkTask(root, { taskRelPath, summary: 'probe ok', coverageWaiver: { reason: 'reviewed by main session: defensive branch' } })` → 读回 task.json。
     2. 场景 B：不传 `coverageWaiver` 再调一次 `checkTask` → 读回 task.json，与场景 A 的 `coverageWaiver` 逐字段比较。
     3. 场景 C：把 RESULT `codeBaseline` 的指纹改为 `<hex-B>`，分别以「带 `coverageWaiver`」与「带 `coverageWaiver` 加 `force: true, reason: 'try'`」调用 → 记录错误文案、task.json 字节是否变化、`overrides` 内容。
     4. 场景 D：恢复 `<hex-A>`，以 `coverageWaiver: { reason: '   ' }` 调用 → 记录错误文案与 task.json 字节是否变化。
     5. 场景 E：删除 `### Below Threshold` 子节，以合法 `coverageWaiver` 调用 → 记录错误文案。
     6. 场景 F：把 `codeBaseline` 改为 `main@<sha>`（不含指纹），以合法 `coverageWaiver` 调用 → 记录错误文案与 task.json 字节是否变化。
  4. 记录锚点：`grep -n "coverageWaiver" packages/core/src/injection/surface.ts packages/dsh-workloom/src/tooling/tasks.ts`，把行号写入 `case-evidence/c4-schema-anchors.md`。
  5. 迁移路径说明：首次 check 迁移（STANDARD 模式 IMPLEMENTING → CHECKING）由步骤 2 定位的单测覆盖，探针只覆盖凭据直写路径与门禁级指纹核对；在 RESULT 的 C4 条目中写明这一分工。
- Expected:
  1. 步骤 1 两条命令退出码 0；步骤 2 清单每条都有对应用例且为 pass。
  2. 场景 A：`err` 为 null；task.json 的 `check.summary` 为 `probe ok`，`check.passedAt` 为 ISO-8601，`check.coverageWaiver` 为 `{ reason: 'reviewed by main session: defensive branch', fingerprint: <hex-A>, at: <ISO-8601>, source: 'main' }`。
  3. 场景 B：`err` 为 null；`check.coverageWaiver` 的 `reason`、`fingerprint`、`at`、`source` 与场景 A 完全相同（继承，不刷新时间）。
  4. 场景 C：两次调用都返回错误，文案含 `cannot be bypassed with force`；task.json 字节与场景 B 之后完全相同；`overrides` 为 `[]`。
  5. 场景 D：返回错误，文案含 `coverageWaiver` 与 `reason`；task.json 字节不变。
  6. 场景 E：返回错误，文案含 `coverage_below_reasons`。
  7. 场景 F：返回错误，文案含 `task-fingerprint`；task.json 字节不变。
  8. 步骤 4 的锚点显示 `surface.ts` 至少三处命中（签名、描述、参数描述）、`tasks.ts` 至少两处命中（schema、透传）。
- Evidence:
  - `case-evidence/c4-core-tests.log`
  - `case-evidence/c4-dsh-tasks-tests.log`
  - `case-evidence/c4-test-checklist.md`
  - `case-evidence/c4-waiver-chain-probe.log`
  - `case-evidence/c4-schema-anchors.md`
- Cleanup: 探针在 `finally` 删除临时项目。

### C5 本任务自身增量覆盖率证据（新脚本）

- Covers: `AC6`
- Preconditions:
  1. C1 至 C4 通过；C6 步骤 1 的 `pnpm -r build` 已执行，dist 与 src 同代。
  2. 执行轮代码尚未提交，变更集等于 `<WT>` 内 `git status --porcelain` 的全部条目（含未跟踪文件）。
- Steps:
  1. 解析路径：`WT=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-incremental-coverage-gate`；`MAIN=$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)`；`TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate"`；`mkdir -p "$TASK/coverage" "$TASK/case-evidence"`。
  2. 采集原生报告（在 `<WT>` 根目录运行，lcov 的 `SF:` 即 repo 相对路径；glob 与两包 `package.json` 的 test 脚本同形）：执行 Coverage 节 Aggregate command 的两条 `node --test` 命令，产出 `coverage/lcov-core.info` 与 `coverage/lcov-dsh.info`，spec 输出分别存 `case-evidence/c5-core-coverage-run.log` 与 `case-evidence/c5-dsh-coverage-run.log`。
  3. 运行新脚本（工作区口径，排除集与 CASE Exclusions 逐项相同，另加 `.workloom/`）：执行 Aggregate command 的 `task-diff-coverage.mjs` 命令，产出 `coverage/changed-lines.json` 与 `coverage/diff-coverage.json`，stdout 存 `case-evidence/c5-diff-coverage-stdout.json`。
  4. 核对 `diff-coverage.json`：`format` 为 `lcov`；`missingExecutableFiles` 为 `[]`；`overall` 满足 `covered * 100 > total * 90`；`files` 的路径集合等于 `git -C "$WT" status --porcelain` 去掉 Exclusions 命中项后的可执行文件集合。
  5. 单文件交叉核对：取 `changed-lines.json` 中 `packages/core/src/task/coverage-compute.ts` 的区间（新文件为 1 到文件末行），对照 `lcov-core.info` 的 `SF:packages/core/src/task/coverage-compute.ts` 段逐行统计 `DA` 的 hits，手算 covered/total，与 `diff-coverage.json` 中该文件的 `covered`、`total` 比对；写入 `case-evidence/c5-cross-check.md`。
  6. 结果判定：`overall` 严格大于 90% 时记录数字；不大于 90% 时按 R7 在 RESULT Coverage 节附逐文件未覆盖变更行与原因、developer 说明与主会话审核结论，并在 Open issues 以 P0 上报（AC6 未达成，除非主会话审核豁免）。
  7. 可选交叉核对（非通过条件）：2.4 提交之后以 `main` 为 `<baseRef>` 复跑步骤 3，`overall` 与 `files` 应与工作区口径一致；由主会话执行或由 checker 在提交后补跑。
- Expected:
  1. `<task>/coverage/` 含 `lcov-core.info`、`lcov-dsh.info`、`changed-lines.json`、`diff-coverage.json`，且两份 JSON 可被 `JSON.parse`。
  2. 步骤 4 四项核对全部成立，`missingExecutableFiles` 为空说明全部非排除变更可执行文件都进入报告。
  3. 步骤 5 的手算值与脚本值完全相同（差异为 0）。
  4. `overall` 严格大于 90%；否则 RESULT 附 R7 审核记录并以 P0 上报。
- Evidence:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`
  - `case-evidence/c5-core-coverage-run.log`
  - `case-evidence/c5-dsh-coverage-run.log`
  - `case-evidence/c5-diff-coverage-stdout.json`
  - `case-evidence/c5-cross-check.md`
- Cleanup: none（证据保留在任务目录；worktree 内不新建 `coverage/` 或 `case-evidence/`）。

### C6 标准验证全表、dist 守卫与资产同步

- Covers: `AC7`
- Preconditions:
  1. C1 至 C5 完成；全部代码修复已落地（任何修复后重跑 C1 至 C6）。
  2. 命令在 `<WT>` 根目录执行，build 先行。
- Steps:
  1. `pnpm -r build`，输出存 `case-evidence/c6-build.log`。
  2. `pnpm -r typecheck`，输出存 `case-evidence/c6-typecheck.log`。
  3. `pnpm lint`，输出存 `case-evidence/c6-lint.log`。
  4. `cd packages/core && pnpm test`，输出存 `case-evidence/c6-core-tests.log`（含 dist-mirror、dist-dts、contract-asset、case-templates 守卫）。
  5. `cd packages/dsh-workloom && pnpm test`，输出存 `case-evidence/c6-dsh-tests.log`（含 dist-mirror 守卫）。
  6. dist 核对：`git status --porcelain packages/core/dist packages/dsh-workloom/dist` 与 `git diff --stat main -- packages/core/dist packages/dsh-workloom/dist | tail -1`，输出存 `case-evidence/c6-dist-status.log`（非空属预期：dist 随 src 同批重建，待主会话 2.4 单一 work commit 落地）。
  7. 资产同步核对（输出存 `case-evidence/c6-asset-sync.log`）：
     1. `grep -n "below_threshold" packages/core/resources/templates/case.md packages/core/resources/templates/case-result.md`：两文件均命中。
     2. `grep -n "codeFingerprint" packages/core/resources/templates/case-result.md`：命中。
     3. `git diff main -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'`：输出为空（version 不升）；`git diff --stat main -- packages/core/resources/workflow/workflow.md`：仅该文件一行。
     4. `grep -n "incremental-coverage" .workloom/spec/repo/workflow/index.md`：恰一行命中。
     5. `grep -c "coverageWaiver" packages/core/src/injection/surface.ts packages/dsh-workloom/src/tooling/tasks.ts`：两文件计数均大于 0。
     6. `wc -l packages/core/src/task/case-gates.ts packages/core/src/task/coverage-compute.ts packages/core/resources/scripts/task-diff-coverage.mjs packages/core/src/workspace/git-query.ts`：均不超过 600；同时记录 `packages/core/src/task/task-ops.ts` 行数（既有超限，属 Out of scope）。
  8. `git diff --check`：无空白错误输出。
  9. 指纹：`node packages/core/resources/scripts/task-fingerprint.mjs "$WT" | tee case-evidence/c6-fingerprint.txt`（在最后一次代码修复之后执行），输出形如 `codeFingerprint=<64 位十六进制>`。
  10. 变更集：`git status --porcelain` 与 `git diff --name-only main...HEAD`，输出存 `case-evidence/c6-change-set.log`；逐项核对——不以 `packages/core/dist/`、`packages/dsh-workloom/dist/`、`packages/core/test/`、`packages/dsh-workloom/test/`、`coverage/`、`.workloom/` 开头、不等于三项资源排除文件与脚本单测的每个变更文件，都是某个 SR 的 Target。
  11. 整文件汇总（轨道一）：运行 `node case-evidence/probes/c6-lcov-summary.mjs "$TASK/coverage/lcov-core.info" "$TASK/coverage/lcov-dsh.info"`，对步骤 10 的非排除变更可执行文件输出逐文件 `LF`/`LH` 与 hits=0 的 DA 行区间，写 `coverage/whole-file-summary.md`，供 RESULT 的 Changed Files 表与 `Overall lines` 使用。
- Expected:
  1. 步骤 1 至 5 退出码均为 0；lint 无 error 与 warning；两包测试 0 fail 且守卫用例全部通过。
  2. 步骤 6：dist 存在变更属预期状态，dist-mirror 守卫在步骤 4 与 5 中通过即证 dist 与 src 镜像一致。
  3. 步骤 7 六项核对全部成立。
  4. 步骤 8 无输出；步骤 9 得到 64 位十六进制指纹；步骤 10 的每个非排除变更文件都有 SR 目标，没有则记为 CASE 缺项交主会话修订 CASE 后重跑。
  5. 步骤 11 的汇总覆盖全部非排除变更可执行文件。
- Evidence:
  - `case-evidence/c6-build.log`
  - `case-evidence/c6-typecheck.log`
  - `case-evidence/c6-lint.log`
  - `case-evidence/c6-core-tests.log`
  - `case-evidence/c6-dsh-tests.log`
  - `case-evidence/c6-dist-status.log`
  - `case-evidence/c6-asset-sync.log`
  - `case-evidence/c6-fingerprint.txt`
  - `case-evidence/c6-change-set.log`
  - `coverage/whole-file-summary.md`
- Cleanup: none。

## Coverage

- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 `lcov` reporter；增量交集用本任务新增脚本 `packages/core/resources/scripts/task-diff-coverage.mjs`（经 core dist 的 `task/coverage-compute.js` 单一计算源）。
- Instrumentation: 双轨并行，两轨共用同一份原生报告，都以 `pnpm -r build` 先行为前提。
  1. 轨道一（门禁轨，旧格式）：运行中的插件是旧版本，本任务 RESULT 的 Coverage 节按旧口径填写——`Status: generated`，`Overall lines` 与 Changed Files 表取 lcov 的整文件行覆盖（逐文件 `LF`/`LH`，未覆盖行取 hits=0 的 `DA` 行区间，由 C6 步骤 11 的汇总给出）。旧门禁只校验 Overall 形态、Changed Files 文件集合等于非排除变更文件集、Exclusions 两处一致、原始报告存在。
  2. 轨道二（证据轨，新口径）：C5 用新脚本对同一份 lcov 报告与本任务工作区 diff 求交集，产出 `coverage/changed-lines.json`（任务 diff 变更行清单）与 `coverage/diff-coverage.json`（机器可读交集结果）；`overall` 须严格大于 90%（AC6）。该结果不进旧门禁，只作为新门禁口径在本任务自身 diff 上的真实证据。
  3. 两包测试都从 `<WT>` 根目录以 coverage 模式运行，lcov 的 `SF:` 路径即 repo 相对路径，直接匹配 diff 路径；dsh 测试经 `@workloom-ai/core` 加载 core dist，dist 文件同样进入报告，但 dist 在 Exclusions 中，两轨都不计入。
  4. 轨道二在执行轮用 `-`（工作区口径：变更尚未提交，三点 diff 为空）；2.4 提交后可用 `main` 复跑交叉核对，不作为通过条件。
- Aggregate command:
  ```bash
  WT=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-incremental-coverage-gate
  MAIN=$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate"
  mkdir -p "$TASK/coverage" "$TASK/case-evidence"
  cd "$WT"
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c5-core-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-core.info" \
    'packages/core/test/*.test.ts' \
    'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' \
    'packages/core/resources/scripts/*.test.mjs'
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c5-dsh-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-dsh.info" \
    'packages/dsh-workloom/test/*.test.ts'
  node packages/core/resources/scripts/task-diff-coverage.mjs "$WT" - \
    "$TASK/coverage/lcov-core.info" "$TASK/coverage/lcov-dsh.info" \
    --exclude 'packages/core/dist/' --exclude 'packages/dsh-workloom/dist/' \
    --exclude 'packages/core/test/' --exclude 'packages/dsh-workloom/test/' \
    --exclude 'packages/core/resources/scripts/task-diff-coverage.test.mjs' \
    --exclude 'packages/core/resources/templates/case.md' \
    --exclude 'packages/core/resources/templates/case-result.md' \
    --exclude 'packages/core/resources/workflow/workflow.md' \
    --exclude '.workloom/' --exclude 'coverage/' \
    --out-dir "$TASK/coverage" --json | tee "$TASK/case-evidence/c5-diff-coverage-stdout.json"
  node packages/core/resources/scripts/task-fingerprint.mjs "$WT" | tee "$TASK/case-evidence/c6-fingerprint.txt"
  ```
- Scope: 两轨共同的可执行变更文件集合，即本任务变更集中未排除的全部现存文件——`packages/core/src/workspace/git-query.ts`、`packages/core/src/task/coverage-compute.ts`、`packages/core/src/task/case-structure.ts`、`packages/core/src/task/case-scope.ts`、`packages/core/src/task/case-gates.ts`、`packages/core/src/task/storage/records.ts`、`packages/core/src/task/task-ops.ts`、`packages/core/src/task/state/guards.ts`、`packages/core/src/task/state/migrate.ts`、`packages/core/src/injection/surface.ts`、`packages/dsh-workloom/src/tooling/tasks.ts`、`packages/core/resources/scripts/task-diff-coverage.mjs`。实际集合以 C6 步骤 10 的 `git status --porcelain` 减去 Exclusions 为准；多出的文件须有 SR 目标，否则属 CASE 缺项，交主会话修订 CASE 后重跑。
- Exclusions:
  - packages/core/dist/: 构建产物，镜像 src；C6 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核
  - packages/dsh-workloom/dist/: 构建产物，镜像 src；C6 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核
  - packages/core/test/: 测试夹具与门禁、交集、豁免链路用例自身；C1 至 C4 与 C6 验全绿
  - packages/dsh-workloom/test/: dsh check schema 钉住与透传用例自身；C4 与 C6 验全绿
  - packages/core/resources/scripts/task-diff-coverage.test.mjs: 脚本单测自身；C1 验全绿
  - packages/core/resources/templates/case.md: CASE 模板英文文本，无运行时行；C6 以 contract-asset 与 case-templates 用例及 grep 验 below_threshold 与变更行口径
  - packages/core/resources/templates/case-result.md: RESULT 模板英文文本，无运行时行；C6 以 contract-asset 与 case-templates 用例及 grep 验 below_threshold、Below Threshold 子节与 codeFingerprint 说明
  - packages/core/resources/workflow/workflow.md: 工作流步骤 guidance 英文文本，无运行时行；C6 验三句同步、version 不升与 contract-asset 钉住
  - coverage/: 开发者按 PLAN 步骤 14 在 worktree 根产出的自测报告与交集结果（lcov、json，非代码，不进覆盖率）；CASE 执行轮证据统一写任务目录 coverage/，worktree 内该目录不提交，由主会话在 2.4 提交前删除
  Pattern semantics: a trailing `/` prefix-matches a whole directory subtree, an exact path without globs matches one file, a single `*` is anchored within its own path segment (never crosses `/`), and a `**` segment crosses directory levels (zero or more levels mid-pattern, any remaining path at the tail).
- Raw outputs:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`
  - `coverage/whole-file-summary.md`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1、SR2、SR5、SR6、SR13、SR14 | C1、C2 |
| AC2 | SR2、SR4、SR6、SR13、SR14、SR21 | C2 |
| AC3 | SR6、SR14、SR19 | C3 |
| AC4 | SR7、SR8、SR9、SR10、SR11、SR12、SR20、SR22 | C4 |
| AC5 | SR1、SR2、SR3、SR17、SR18、SR23 | C1 |
| AC6 | SR3、SR23 | C5 |
| AC7 | SR15、SR16、SR21 | C6 |

## Execution Notes

1. 旧门禁与新口径的分工：本任务 CASE/RESULT 以旧格式过旧门禁（轨道一），新脚本只产证据（轨道二）；RESULT 的 Exclusions 表必须与上文 Exclusions 逐路径逐原因相同，RESULT 中引用的每个 `case-evidence/...` 与 `coverage/...` 路径都必须真实存在（旧门禁逐个核对）。
2. CASE 对 PLAN 的两处补充约定，主会话复核时请知悉：
   1. CLI 增加 `--exclude <pattern>`（可重复）：AC6 要求用新脚本算本任务自身增量覆盖率并大于 90%，而 dist 与测试文件必然在变更集里且覆盖形态与 src 不同，没有排除入口就无法得到有意义的数字；门禁本就把 CASE Exclusions 传给同一计算源，CLI 暴露同一入参保持口径一致。
   2. `.d.ts` 不计入可执行集合：后缀匹配会把 `.d.ts` 误判为 `.ts`，任何改动类型声明锚点的任务都会被 `coverage_missing_file` 硬拒，而类型声明没有运行时行，任何工具都不会报告它。
3. CASE 对 PLAN 的一处澄清：RESULT 指纹从 `codeBaseline` 字符串里的 `codeFingerprint=<64-hex>` 提取，不新增 front-matter 顶层键（case-templates 用例钉住键集合），与模板注记和 checker-discipline 一致。
4. 探针与夹具的落点：`<task>/case-evidence/probes/`（c1、c2、c3、c4、c6 五个探针）与 `<task>/case-evidence/fixtures/c1/`（三份报告夹具）；探针在 `mktemp -d` 的临时目录内构造仓库并自清理，不写生产目录，不执行 commit 与 push。
5. 任何代码修复之后，SR 全部重审、C1 至 C6 全量重跑、指纹重算（C6 步骤 9 在最后一次修复之后执行）。
