---
version: 1
task: tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate
codeBaseline: main@4b5454f; codeFingerprint=5781a576b13ed8b0d14d530b07c6cb4e55e2693623f5c7c300c18d1c0d4fe1ce
checkSession: ed843d3e-85cf-4cd2-bef0-03fbe190b001
status: passed
startedAt: '2026-11-24T05:30:06.000Z'
completedAt: '2026-11-24T05:56:26.000Z'
---

# CASE Result: 增量覆盖率门禁与采集脚本

## Summary

- Static review: `23/23`
- Runtime cases: `6/6; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

执行说明：执行轮发现 6 处 P2 并自行修复（见 Resolved Findings），每次修复后 SR 全部重审、C1 至 C6 全量重跑、指纹重算；本 RESULT 记录的是最后一次完整重跑（指纹 `5781a576…fe1ce`）。双轨覆盖率：轨道一（旧格式，整文件 lcov）`4923/5195 (94.8%)` 过旧门禁；轨道二（新脚本，工作区口径 `-`，变更行交集）`944/978 (96.5%)`，严格大于 90%，缺席可执行文件为 0。

## Static Review Results

### SR1 git 变更行原语 gitDiffChangedLines

- Status: `passed`
- Evidence: `packages/core/src/workspace/git-query.ts:60` GIT_DIFF_LINES_ARGS 冻结值 diff/--no-color/-M/--unified=0/--diff-filter=d；`:69` ChangedLineRange 闭区间；`:182` 同步函数 gitDiffChangedLines(root, baseRef): [GitCommandError|null, Map|null]，`:186` refArg 为 GIT_HEAD_REF 或 `${baseRef}...${GIT_HEAD_REF}`，`:185-198` baseRef 为 null 时追加 GIT_UNTRACKED_ARGS 读行；`:155` runGitDiffSync 用 execFileSync 加 GIT_ENV（LC_ALL=C），stderr 走管道；`:206` parseDiffChangedLines 只收新侧 hunk（HUNK_HEADER_RE `:77`，count 省略按 1，count>0 才记区间）；`:240` readUntrackedRanges 二进制跳过全行新增；`:265` normalizeChangedRanges 排序合并；既有函数与 GIT_DIFF_CHANGED_ARGS 逐字不变（git diff main 仅新增 165 行）。
- Findings: `packages/core/src/workspace/git-query.ts:180 [P2] 'HEAD' 与 '--' 字面量各重复两处 — fixed: 抽常量 GIT_HEAD_REF（:37）与 GIT_PATH_SEPARATOR（:40），GIT_DIFF_CHANGED_ARGS 与 refArg/路径分隔符改引用`

### SR2 增量覆盖率单一计算源 coverage-compute

- Status: `passed`
- Evidence: `packages/core/src/task/coverage-compute.ts:26` EXECUTABLE_EXTENSIONS 冻结 19 后缀；`:32` DECLARATION_SUFFIX '.d.ts'，`:38` isExecutableFile 先排除 .d.ts 再匹配后缀；`:87` meetsThreshold 为 covered*100 > total*90；`:92` buildWaiver 返回 {reason, fingerprint, at: ISO, source: 'main'}；`:97` inferFormat 三规则；`:105` combineFormats 任一 unsupported 即 unsupported、全同取该格式、否则 mixed；`:158` resolveReportPath 直接命中→双向后缀匹配（最长后缀优先，等长多候选 err 文案含 ambiguous coverage path，零候选保留归一串）；`:177/:200/:224` 三格式解析器语义与 CASE 一致（go 块闭区间 count>0、lcov DA hits>0 且非法 DA err、jacoco ci>0）；`:278` intersectFile 展开变更行求交并压缩未覆盖区间；`:310` computeDiffCoverage 同步返回 [err, result]，changedLines 存在不调 git；`:322` unsupported 直接返回空结果；`:352` missingExecutableFiles 用 isExecutableFile 减报告文件集与排除项并排序；文件 380 行，只读 go.mod，无副作用；CoverageWaiverRecord 自 records.ts `import type` 并重导出（:18-20）。
- Findings: `packages/core/src/task/coverage-compute.ts:343 [P2] .d.ts 被 endsWith('.ts') 误判为可执行，类型声明缺席报告会触发 coverage_missing_file — fixed: 新增 isExecutableFile（:38）供 missing 判定，补用例「.d.ts 类型声明不计入可执行集合：缺席报告不触发 missing」`

### SR3 采集脚本 task-diff-coverage CLI

- Status: `passed`
- Evidence: `packages/core/resources/scripts/task-diff-coverage.mjs:14-15` 只 import dist 的 coverage-compute.js 与 git-query.js（另 import DIFF_COVERAGE_ARTIFACTS）；`:18-19` FLAGS 与 USAGE 含 --exclude；`:33-38` --exclude 可重复收集，`:80` 映射为 exclusions Map；`:75` baseRef '-' 或空串按 null；`:86-90` --out-dir 写 changed-lines.json 与 diff-coverage.json（文件名引用 DIFF_COVERAGE_ARTIFACTS），省略时不写文件；`:91` --json 输出 JSON 否则 renderMarkdown（`:53-69` 表格、Overall、Format、Missing executable files 行）；`:72` main 具名导出，`:94-97` entry guard 用 pathToFileURL(resolve(argv[1])).href 比对；usage 与错误文案英文、注释中文。
- Findings: `none`

### SR4 CASE 结构常量与选项 CaseStructureOptions

- Status: `passed`
- Evidence: `packages/core/src/task/case-structure.ts:84` coverageStatuses 为 ['generated','below_threshold','not_applicable','failed']，其余 CASE_STRUCTURE 成员逐字不变（git diff main 只改两处）；`:16` import type ChangedLineRange；`:52-54` 三个可选字段 coverageWaiver/changedLines/exclusions；inspectCaseStructure、isExcluded、exclusionMatches、parseExclusions 未改；contract-asset 用例对 below_threshold 逐值钉住（c6-core-tests.log 通过）。
- Findings: `none`

### SR5 CASE 变更行范围 listCaseChangedLines

- Status: `passed`
- Evidence: `packages/core/src/task/case-scope.ts:53` 同步函数 listCaseChangedLines(root, task): [Error|null, Map|null]；`:57-60` branch 与 base_branch 均非空才传 base_branch，否则 null；`:62` 以 worktreeDirectory 为 root 调 gitDiffChangedLines，err 透传（`:63`）；`:65` 过滤 .workloom/ 前缀返回新 Map；taskDirectory、worktreeDirectory、listCaseChangedFiles 逐字不变；头注释写明三点与工作区两种口径。
- Findings: `none`

### SR6 增量门禁 evaluateCaseOutcomeGate

- Status: `passed`
- Evidence: `packages/core/src/task/case-gates.ts:274` evaluateCaseOutcomeGate 同步返回 issues；`:345-353` 变更行 options.changedLines 优先、缺省调 listCaseChangedLines，失败追加 git_changed_lines 不回退；`:214` coverageReportPaths 读 Raw reports 的 coverage/ 路径并跳过交集产物；`:358-367` 越界 artifact_path_invalid、缺失 coverage_report_missing；`:372` computeDiffCoverage({root: worktreeDirectory, changedLines, reports, exclusions}) 同步取结果，`:375` 解析错 coverage_parse；`:380-383` supported 时 expected 为复算文件集、否则回退变更文件集；`:387-391` 缺席检测对三态统一生效（coverage_missing_file）；`:394-405` not_applicable 要求 expected 空、表空、N/A 与 - Reason: 非空（coverage_na_reason），旧「Exclusions 非空」约束已删；`:408-424` 逐文件与 overall 整数核对 coverage_recompute、文件集合 coverage_files；`:427-441` 阈值分支 coverage_threshold / coverage_status / coverage_waiver（指纹取 codeBaseline 内 codeFingerprint，`:250` resultFingerprint 正则）/ coverage_below_reasons（`:239` belowThresholdReasons）；`:38` ISSUE_CODES 冻结表为问题码单源；case-outcome-ready 不在 FORCEABLE_GUARD_GATES；文件 459 行。
- Findings: `packages/core/src/task/case-gates.ts:214 [P2] Raw reports 下任意 coverage/ 路径都当报告解析，交集 JSON 产物会把格式推成 unsupported 并静默关闭机械复算 — fixed: coverage-compute.ts 新增 DIFF_COVERAGE_ARTIFACTS 与 isDiffCoverageArtifact，门禁跳过两产物；补用例；同轮把重复 issue code 字面量收口为 ISSUE_CODES（:38）`

### SR7 豁免记录类型 TaskCheckRecord.coverageWaiver

- Status: `passed`
- Evidence: `packages/core/src/task/storage/records.ts:105` CoverageWaiverRecord {reason, fingerprint, at, source: 'main'|'user'|'auto'}，core src 内 interface 定义恰一处（coverage-compute.ts 经 import type 复用并重导出）；`:116` TaskCheckRecord.coverageWaiver 可选；TaskRecord.check 与 read-write.ts 未改；字段中文注释写明绑定 RESULT codeBaseline 指纹。
- Findings: `none`

### SR8 check 入参与守卫透传 checkTaskInternal

- Status: `passed`
- Evidence: `packages/core/src/task/task-ops.ts:473` 与 `:1004` 两处入参加 coverageWaiver?: { reason }，executeCheckTask 透传；`:536-538` reason trim 为空在门禁前抛 `coverageWaiver requires a non-empty reason`；`:480` readResultFingerprint 从 codeBaseline 提取 codeFingerprint=([0-9a-f]{64})，缺失抛错文案含 scripts/task-fingerprint.mjs（`:543`）；`:547` buildWaiver 构造后放入 ctx.coverageWaiver 再调 evaluateGuard('case-outcome-ready')；`:548-551` 未传参时既有豁免指纹匹配才继承；凭据 coverageWaiver 与门禁同次写入；门禁拒绝文案仍含 cannot be bypassed with force；只新增透传、指纹读取与 buildWaiver 调用。
- Findings: `none（task-ops.ts 既有 1337 行超限属 CASE Out of scope，PLAN P2-11 记录为后续任务）`

### SR9 守卫上下文 GuardContext.coverageWaiver

- Status: `passed`
- Evidence: `packages/core/src/task/state/guards.ts:48` GuardContext 加 coverageWaiver?: { reason; fingerprint }；`:220-222` guardCaseOutcomeReady 把 { coverageWaiver: ctx.coverageWaiver } 并入 evaluateCaseOutcomeGate 选项；FORCEABLE_GUARD_GATES 不含 case-outcome-ready（:272 起的表未改）；GUARDS 注册表与其余守卫不变。
- Findings: `none`

### SR10 迁移透传 evaluateTransition 与 migrateTask

- Status: `passed`
- Evidence: `packages/core/src/task/state/migrate.ts:113` evaluateTransition options 加 coverageWaiver?，`:119-123` 注入 GuardContext；`:216-219` migrateTask 传 params.patch?.check?.coverageWaiver；patch.check 仍在守卫通过后 Object.assign；硬守卫拒绝文案与 assertForceReason、bypassedGates 逻辑未改。
- Findings: `none`

### SR11 工具文案面 taskCheck 签名与描述

- Status: `passed`
- Evidence: `packages/core/src/injection/surface.ts:83` TOOL_SNIPPETS.taskCheck 为 workloom_task_check(summary?, taskPath?, force?, reason?, coverageWaiver?) — record the 2.3 check pass；`:51` TOOL_DESCRIPTIONS.taskCheck 仍含 2.3 check pass 并补 coverageWaiver 句；`:138` PARAM_DESCRIPTIONS.coverageWaiver 英文描述（对象、reason 必填非空、指纹绑定 RESULT、随凭据记录）；TOOL_NAMES 与 TOOL_SNIPPETS 键集合不变（surface.test 钉住通过）。
- Findings: `none`

### SR12 dsh check 工具 schema 与透传

- Status: `passed`
- Evidence: `packages/dsh-workloom/src/tooling/tasks.ts:108-115` schema coverageWaiver 为 object，properties.reason（string，描述取 PARAM_DESCRIPTIONS.coverageWaiver），required ['reason']，additionalProperties false，顶层 additionalProperties false 与 required [] 不变；`:317-321` coverageWaiverOf 仅对象且非数组时提取 { reason }（reason 非字符串给空串交 core 报参数错）；`:367-373` checkTaskTool 透传；文件只有 schema 与取值透传两类改动。
- Findings: `packages/dsh-workloom/test/tasks.test.ts:84 [P2] schema 用例缺 reason.description 相等判定，且无 coverageWaiver 透传用例 — fixed: 补描述相等断言与透传用例「check 工具透传 coverageWaiver 到 core」`

### SR13 CASE 模板 case.md 的 Coverage 节

- Status: `passed`
- Evidence: `packages/core/resources/templates/case.md:64` Scope 改为 task-diff-new-and-modified-executable-lines; deleted lines excluded；Raw outputs 新增 coverage/changed-lines.json 与 coverage/diff-coverage.json（与 coverage/<tool-native-report> 并列）；`:10` discipline 行保留 covered/total (pct%) 形态并补「count changed executable lines from the task diff, not whole files」与 below_threshold 逐文件原因加豁免、not_applicable 独立 Reason 行；CASE_STRUCTURE 全部章节与字段仍在模板中（contract-asset 用例通过）；正文英文。
- Findings: `none`

### SR14 RESULT 模板 case-result.md 的 Coverage 与状态值

- Status: `passed`
- Evidence: `packages/core/resources/templates/case-result.md` front-matter 键集合仍为 version/task/codeBaseline/checkSession/status/startedAt/completedAt（case-templates 用例通过），`:4` codeBaseline 占位含 codeFingerprint=<64-hex>；`:17` 与 `:43` 两处值域含 below_threshold；`:53` 表头 Changed lines covered/Total 与 Uncovered changed lines；`:58-62` Below Threshold 子节（逐文件 - \`<path>\`: <reason>）；`:64-68` Not Applicable 子节含独立 - Reason: 行；`:45-47` Overall lines 形态不变；`:95` Open issues 仍为最后小节；正文英文。
- Findings: `none`

### SR15 workflow 2.3 步骤文本同步

- Status: `passed`
- Evidence: `packages/core/resources/workflow/workflow.md:96` 采集句改为任务 diff 变更可执行行交集、三产物（changed-lines.json、原生报告、diff-coverage.json）、Incremental coverage must be strictly greater than 90%，并含 R7 审核路由（unrelated code goes back to the developer / goes back to the Checker for additional cases / full rerun）；`:110` 凭据句补 check.coverageWaiver（reason, code fingerprint, time, and source）；`:112` 合格状态句改为 coverage is generated above 90% or is below_threshold with per-file reasons plus a valid approved waiver bound to the current code fingerprint；git diff main 不含 version: 行增删（c6-asset-sync.log），states 与步骤集合不变；contract-asset 新增用例逐字 pin 三句与两条路由。
- Findings: `none`

### SR16 spec 新条目 incremental-coverage

- Status: `passed`
- Evidence: `.workloom/spec/repo/workflow/index.md:9` 新增 `- incremental-coverage: ...` 单行英文条目，覆盖口径（base_branch...HEAD、两点回退、删除行不计、无效 ref fail loud）、三格式机械复算、阈值整数交叉乘、below_threshold 加 coverageWaiver 绑定 codeFingerprint、not_applicable 独立 Reason、缺席硬拒与 EXECUTABLE_EXTENSIONS 封闭集合、unsupported 回退；既有条目未改（git diff main 仅 1 行新增）；改动在 worktree 分支副本。
- Findings: `none`

### SR17 git.test.ts 变更行用例

- Status: `passed`
- Evidence: `packages/core/test/git.test.ts` 新增四条用例：三点口径（新增/修改/删除/单行 hunk，删除行不入结果）、重命名（纯 rename 不入、带修改归新名）、无分支工作区（两点加未跟踪读行、二进制跳过）、无效 ref 与非 git 目录返回 err；夹具经 makeGitRepo 建临时仓库并 finally rmSync；用例名含 gitDiffChangedLines（c1-unit-tests.log 35 用例全 pass）。
- Findings: `none`

### SR18 coverage-compute.test.ts 三格式与交集用例

- Status: `passed`
- Evidence: `packages/core/test/coverage-compute.test.ts` 12 条用例覆盖 go 剥前缀与无 go.mod 后缀匹配、lcov 绝对 SF 剥前缀与未改动行不进分母、jacoco 后缀匹配与 ci>0 与歧义 err、单行 hunk、缺席可执行文件与非可执行不触发、带原因排除、.d.ts 不计入可执行、空分母、unsupported、多报告取并、meetsThreshold 边界（90/100 false、91/100 true、0/0 false）、buildWaiver、inferFormat、解析器直接调用；交集用例经 changedLines 注入；用例名含格式关键词。
- Findings: `packages/core/test/coverage-compute.test.ts:166 [P2] 缺 .d.ts 不计入可执行集合的用例 — fixed: 新增用例「.d.ts 类型声明不计入可执行集合：缺席报告不触发 missing」`

### SR19 case.test.ts 门禁夹具与阈值用例

- Status: `passed`
- Evidence: `packages/core/test/case.test.ts` 夹具 codeBaseline 含 codeFingerprint=<64-hex>、makeRoot 写 lcov 夹具、门禁用例经 options.changedLines 注入；新增用例：listCaseChangedLines 三点/无分支/无效 ref、90.0 拒 90.1 过、缺席硬拒与非可执行不触发、not_applicable 零分母缺席仍硬拒、below_threshold 豁免三态、复算不一致、unsupported 阈值回退、check 带 coverageWaiver 首次通过并继承、force 不能绕过增量阈值、reason 空与指纹缺失拒、IMPLEMENTING 首次 check 迁移端到端；旧用例按新行为更新（纯文档 not_applicable 加 Reason）。
- Findings: `packages/core/test/case.test.ts:787 [P2] 缺文件集合不一致（coverage_files）与「交集产物列入 Raw reports 不关闭机械复算」两个场景 — fixed: 在「复算不一致」用例补两段断言`

### SR20 surface.test.ts taskCheck 文案钉住

- Status: `passed`
- Evidence: `packages/core/test/surface.test.ts` taskCheck 用例新增三条 match：TOOL_SNIPPETS.taskCheck 含 coverageWaiver?、TOOL_DESCRIPTIONS.taskCheck 含 coverageWaiver、PARAM_DESCRIPTIONS.coverageWaiver 含 reason；既有 2.3 check pass 与不含 grilling 钉住保留（c4-core-tests.log 通过）。
- Findings: `none`

### SR21 contract-asset.test.ts 模板与 workflow 钉住

- Status: `passed`
- Evidence: `packages/core/test/contract-asset.test.ts` 新增用例「增量覆盖率资产：三格式产物、below_threshold/Reason 载体与 workflow 2.3 三句逐字 pin」，钉住模板两产物、Below Threshold、- Reason:、Changed lines covered/Total 表头，以及 2.3 的 >90% 句、合格状态句、check.coverageWaiver 句、两条退回路由与全量重跑句；coverageStatuses 遍历钉住对 below_threshold 生效；既有钉住项未删。
- Findings: `none`

### SR22 dsh tasks.test.ts check schema 钉住

- Status: `passed`
- Evidence: `packages/dsh-workloom/test/tasks.test.ts` check schema 用例断言 coverageWaiver 为 object、required ['reason']、additionalProperties false、reason.type string 与 reason.description 等于 PARAM_DESCRIPTIONS.coverageWaiver；新增透传用例「check 工具透传 coverageWaiver 到 core：无指纹 RESULT 以 codeFingerprint 错误拒绝，缺省则照常写凭据」；「不再含 phase/required」用例保留（c4-dsh-tasks-tests.log 15 用例全 pass）。
- Findings: `packages/dsh-workloom/test/tasks.test.ts:84 [P2] 缺描述相等断言与透传用例 — fixed: 同轮补齐`

### SR23 脚本单测 task-diff-coverage.test.mjs

- Status: `passed`
- Evidence: `packages/core/resources/scripts/task-diff-coverage.test.mjs` 五条用例：--out-dir 写两产物且 stdout markdown、--json 仅 stdout 且不写文件、--exclude 移除分母噪声与缺席、main 具名导出直接调用并与 CLI 子进程产物一致、缺参抛 usage；进程内用例经 import 调用使脚本行进入报告（lcov-core.info 含 SF:packages/core/resources/scripts/task-diff-coverage.mjs，整文件 96/97）；core package.json 的 test glob resources/scripts/*.test.mjs 已覆盖该文件（未改）。
- Findings: `none`

## Runtime Results

### C1 变更行原语、三格式交集与 CLI 产物

- Status: `passed`
- Executed at: `2026-11-24T05:50:12.000Z`
- Actions:
  1. `cd <WT>/packages/core && node --test test/git.test.ts test/coverage-compute.test.ts resources/scripts/task-diff-coverage.test.mjs`
  2. `node <task>/case-evidence/probes/c1-diff-coverage-probe.mjs <WT> <task>`：临时 git 夹具（基线提交含 go.mod、src/a.ts 10 行、src/b.ts、pkg/c.go、src/Mapper.java、docs/readme.md；改 a.ts 第 3–4 行、git mv b.ts→c.ts 并改第 2 行、新建未跟踪 src/new.ts、改 readme/c.go/Mapper.java 各一行），报告夹具 lcov.info / cover.out / jacoco.xml 落 `case-evidence/fixtures/c1/`，CLI 以 `-` 无排除、`-` 加 `--exclude src/new.ts`、基线 sha 三点口径各运行一次（`--json --out-dir`），`git show --unified=0 HEAD -- src/a.ts` 交叉核对 hunk 头。
- Observed: 步骤 1 退出码 0（35 用例全 pass）；探针 22/22 通过：changed-lines 的 a.ts 行集合 3,4、c.ts 2、new.ts 1,2,3、readme 1、c.go 5、Mapper.java 4，不含 b.ts；out-1 files 为 a.ts 1/2（未覆盖 [4,4]，整文件 lcov 为 9/10，未改动行不进分母）、c.ts 1/1、c.go 1/1、Mapper.java 1/1，overall 4/5，missingExecutableFiles 恰为 ["src/new.ts"]，format mixed；加 --exclude 后 missing 为空、overall 仍 4/5；三点口径产物与工作区口径一致；a.ts 新侧 hunk 头 +3,2；meetsThreshold 用例记录 90/100 false、91/100 true、0/0 false。
- Evidence:
  - `case-evidence/c1-unit-tests.log`
  - `case-evidence/c1-probe.log`
  - `case-evidence/c1-worktree-no-exclude.json`
  - `case-evidence/c1-worktree-exclude.json`
  - `case-evidence/c1-three-dot.json`
  - `case-evidence/c1-changed-lines.json`
  - `case-evidence/c1-three-dot-changed-lines.json`
  - `case-evidence/fixtures/c1/lcov.info`
  - `case-evidence/fixtures/c1/cover.out`
  - `case-evidence/fixtures/c1/jacoco.xml`
- Findings: `none`

### C2 门禁阈值、缺席硬拒与 force 不可绕过

- Status: `passed`
- Executed at: `2026-11-24T05:50:40.000Z`
- Actions:
  1. `cd <WT>/packages/core && node --test test/case.test.ts`，按 C2 步骤 2 清单逐条定位用例名（写入 `c2-case-test-checklist.md`）。
  2. `node <task>/case-evidence/probes/c2-gate-threshold-probe.mjs <WT>`：函数级调用 dist 的 evaluateCaseOutcomeGate，临时项目 src/a.ts 改写 10 行并经 options.changedLines 注入，五场景切换 lcov 夹具与 RESULT。
- Observed: 步骤 1 退出码 0（25 用例全 pass），清单九条全部定位到 pass 用例；探针 9/9：A 恰好 90% → 仅 coverage_threshold；B 10/10 → 问题列表为空；C1 缺席可执行文件 → coverage_missing_file（并伴随 coverage_files/recompute/threshold），C2 not_applicable 仍 → coverage_missing_file 且不报 coverage_not_applicable（三态统一）；D 自报 10/10 报告 9/10 → coverage_recompute；E1 unsupported 自报 90% → coverage_threshold 且无 coverage_missing_file，E2 自报 100% 且 Changed Files 回退变更文件集 → 问题列表为空。force 路径由「force 不能绕过增量阈值门禁（core CASE failure）」与「archive 同样拒绝核心 CASE 问题且不移动任务目录」两条用例覆盖：拒绝、无凭据、overrides 为 []、任务目录未移动。
- Evidence:
  - `case-evidence/c2-case-tests.log`
  - `case-evidence/c2-case-test-checklist.md`
  - `case-evidence/c2-gate-threshold-probe.log`
- Findings: `none`

### C3 not_applicable 零分母原因与排除项反规避

- Status: `passed`
- Executed at: `2026-11-24T05:50:52.000Z`
- Actions:
  1. 在 C2 步骤 1 输出中定位 not_applicable 相关用例（写入 `c3-case-test-checklist.md`）。
  2. `node <task>/case-evidence/probes/c3-not-applicable-probe.mjs <WT>`：六场景函数级调用 evaluateCaseOutcomeGate（纯文档变更、缺 Reason、有可测变更行却声明 not_applicable、全部可执行文件带原因排除、RESULT 排除表缺行、50% 自报 100% 无排除）。
- Observed: 清单五条全部定位到 pass 用例；探针 6/6：A 纯文档加 Reason → 问题列表为空（CASE Exclusions 为空也通过）；B 缺 Reason → coverage_na_reason；C → coverage_not_applicable；D 排除带原因加 Reason → 问题列表为空；E RESULT 排除表缺行 → coverage_exclusions；F → coverage_recompute 与 coverage_threshold 同时出现。
- Evidence:
  - `case-evidence/c3-not-applicable-probe.log`
  - `case-evidence/c3-case-test-checklist.md`
- Findings: `none`

### C4 豁免链路端到端：check 入参、task.json 记录、指纹失效与 schema

- Status: `passed`
- Executed at: `2026-11-24T05:51:30.000Z`
- Actions:
  1. `cd <WT>/packages/core && node --test test/case.test.ts test/surface.test.ts test/contract-asset.test.ts`；`cd <WT>/packages/dsh-workloom && node --test test/tasks.test.ts`，按 C4 步骤 2 清单定位用例（写入 `c4-test-checklist.md`）。
  2. `node <task>/case-evidence/probes/c4-waiver-chain-probe.mjs <WT>`：临时 git 仓库加 light 模式任务（case.required true，designSession design-1），RESULT 为 below_threshold 9/10 加 Below Threshold 原因行，真实调用 checkTask 六场景并读回 task.json。
  3. `grep -n "coverageWaiver" packages/core/src/injection/surface.ts packages/dsh-workloom/src/tooling/tasks.ts`（写入 `c4-schema-anchors.md`）。
- Observed: core 105 用例、dsh 15 用例全 pass，清单十条全部定位；探针 11/11：A 首查带 coverageWaiver → err 为 null，check.summary 为 probe ok，passedAt 为 ISO-8601，coverageWaiver 为 {reason, fingerprint: hex-A, at: ISO, source: 'main'}；B 复查不传 → 继承且四字段完全相同；C 指纹改为 hex-B 后不传豁免 → 拒绝（文案 below_threshold requires a waiver matching RESULT codeFingerprint ... cannot be bypassed with force），force 同样拒绝，task.json 字节不变、overrides 为 []，显式传入新豁免才放行且新记录绑定 hex-B；D 空原因 → coverageWaiver requires a non-empty reason，task.json 不变；E 删 Below Threshold 子节 → Below Threshold requires per-file reason lines（即 coverage_below_reasons 的 message，码值由单测「below_threshold 豁免」核对）；F codeBaseline 去掉指纹 → 文案含 task-fingerprint.mjs，task.json 不变；锚点 surface.ts 三处（:51 描述、:83 签名、:138 参数描述）、tasks.ts 两类（:108-115 schema、:317-321 与 :367-373 透传）。CASE 措辞说明：场景 C 原文写「带 coverageWaiver」两次调用，而实现语义是既有豁免随指纹失效、只有显式传入新豁免才重新绑定，探针按此语义核对并多出 C3 一条；场景 E 门禁把 issue 的 message 而非 code 拼进文案，探针核对 message，两者均不构成代码问题。迁移路径（STANDARD 模式 IMPLEMENTING → CHECKING）由「IMPLEMENTING 首次 check」单测覆盖，探针覆盖 light 模式凭据直写路径。
- Evidence:
  - `case-evidence/c4-core-tests.log`
  - `case-evidence/c4-dsh-tasks-tests.log`
  - `case-evidence/c4-test-checklist.md`
  - `case-evidence/c4-waiver-chain-probe.log`
  - `case-evidence/c4-schema-anchors.md`
- Findings: `none`

### C5 本任务自身增量覆盖率证据（新脚本）

- Status: `passed`
- Executed at: `2026-11-24T05:53:40.000Z`
- Actions:
  1. 解析 `WT`、`MAIN=$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)`、`TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate"`，`mkdir -p "$TASK/coverage" "$TASK/case-evidence"`。
  2. 在 `<WT>` 根执行 Coverage 节 Aggregate command 的两条 `node --test --experimental-test-coverage` 命令（core 三组 glob、dsh 一组 glob），产出 `coverage/lcov-core.info` 与 `coverage/lcov-dsh.info`。
  3. `node packages/core/resources/scripts/task-diff-coverage.mjs "$WT" - "$TASK/coverage/lcov-core.info" "$TASK/coverage/lcov-dsh.info" --exclude ...（CASE Exclusions 九项加 .workloom/）--out-dir "$TASK/coverage" --json`。
  4. `node <task>/case-evidence/probes/c5-verify-evidence.mjs <WT> <task>`：核对 files 集合、missing、format、overall，并对 12 个文件按 changed-lines.json 区间展开 lcov DA 行手工复算（写入 `c5-cross-check.md`）。
- Observed: 两次采集退出码 0（core 768 用例、dsh 211 用例全 pass，lcov SF 路径为 repo 相对）；CLI 退出码 0：format 为 lcov，missingExecutableFiles 为 []，overall 944/978（96.5%）严格大于 90%，files 恰为 12 个非排除可执行变更文件（与 git status --porcelain 减排除集一致）；12 个文件手工值与脚本值完全相同，其中 coverage-compute.ts 手工 375/380（未覆盖 281、330–333）与脚本一致；changed-lines.json 共 57 个文件，28 个 dist、4 个 worktree 根 coverage/、1 个 .workloom/ 条目均在排除集内不进分母。工作区口径 `-`：执行轮代码未提交，三点 diff 为空；2.4 提交后由主会话以 main 复跑交叉核对（非通过条件）。
- Evidence:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`
  - `case-evidence/c5-core-coverage-run.log`
  - `case-evidence/c5-dsh-coverage-run.log`
  - `case-evidence/c5-diff-coverage-stdout.json`
  - `case-evidence/c5-verify-evidence.log`
  - `case-evidence/c5-cross-check.md`
- Findings: `none`

### C6 标准验证全表、dist 守卫与资产同步

- Status: `passed`
- Executed at: `2026-11-24T05:55:02.000Z`
- Actions:
  1. `pnpm -r build`、`pnpm -r typecheck`、`pnpm lint`（`<WT>` 根）。
  2. `cd packages/core && pnpm test`、`cd packages/dsh-workloom && pnpm test`。
  3. `git status --porcelain packages/core/dist packages/dsh-workloom/dist` 与 `git diff --stat main -- packages/core/dist packages/dsh-workloom/dist | tail -1`。
  4. 资产同步核对：grep below_threshold 两模板、grep codeFingerprint case-result.md、`git diff main -- workflow.md | grep -E '^[-+]version:'`、`git diff --stat main -- workflow.md`、grep incremental-coverage spec、grep -c coverageWaiver surface.ts tasks.ts、wc -l 五个文件。
  5. `git diff --check`；`node packages/core/resources/scripts/task-fingerprint.mjs "$WT"`（最后一次修复之后）；`git status --porcelain` 与 `git diff --name-only main...HEAD` 并逐项核对 SR 目标。
  6. `node <task>/case-evidence/probes/c6-lcov-summary.mjs <WT> <task>` 生成整文件汇总。
- Observed: build、typecheck、lint 退出码 0，lint 无 error 与 warning；core 768 用例、dsh 211 用例全 pass，dist-mirror 与 dist-dts 守卫通过；dist 变更 27 文件属预期（随 src 同批重建，待主会话 2.4 单一 work commit 落地）；两模板均含 below_threshold，case-result.md:4 含 codeFingerprint，workflow.md version 行无增删且仅 3 行替换，spec 恰一行 incremental-coverage，coverageWaiver 计数 surface.ts 3、tasks.ts 7，case-gates.ts 459 行、coverage-compute.ts 380 行、CLI 97 行、git-query.ts 476 行均不超过 600，task-ops.ts 1337 行（既有超限，Out of scope）；git diff --check 无输出；指纹 codeFingerprint=5781a576b13ed8b0d14d530b07c6cb4e55e2693623f5c7c300c18d1c0d4fe1ce；变更集 54 项，每个非排除变更文件都是 SR 目标（dist 两包、test 两包、脚本单测、两模板、workflow.md、worktree 根 coverage/ 均在 Exclusions 内）；整文件汇总覆盖 12 个文件，Overall 4923/5195 (94.8%)。
- Evidence:
  - `case-evidence/c6-build.log`
  - `case-evidence/c6-typecheck.log`
  - `case-evidence/c6-lint.log`
  - `case-evidence/c6-core-tests.log`
  - `case-evidence/c6-dsh-tests.log`
  - `case-evidence/c6-dist-status.log`
  - `case-evidence/c6-asset-sync.log`
  - `case-evidence/c6-diff-check.log`
  - `case-evidence/c6-fingerprint.txt`
  - `case-evidence/c6-change-set.log`
  - `coverage/whole-file-summary.md`
- Findings: `none`

## Coverage

- Status: `generated`
- Tool: `Node.js v24.18.1 node:test coverage（--experimental-test-coverage）与 lcov reporter；增量交集用 packages/core/resources/scripts/task-diff-coverage.mjs`
- Command: `node --test --experimental-test-coverage --test-reporter=lcov ... 'packages/core/test/*.test.ts' 'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' 'packages/core/resources/scripts/*.test.mjs'（cwd <WT> 根，产出 coverage/lcov-core.info）；同法 'packages/dsh-workloom/test/*.test.ts' 产出 coverage/lcov-dsh.info；node packages/core/resources/scripts/task-diff-coverage.mjs <WT> - <两份 lcov> --exclude ... --out-dir <task>/coverage --json（CASE Coverage 节 Aggregate command 原样执行）`
- Overall lines: `4923/5195 (94.8%)`
- Track two (incremental, AC6): `coverage/diff-coverage.json` overall `944/978 (96.5%)`，严格大于 90%，`missingExecutableFiles` 为空，12 个文件手工复算与脚本一致（`case-evidence/c5-cross-check.md`）；逐文件明细见 `coverage/diff-coverage.json` 与 `coverage/changed-lines.json`。
- Raw reports:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/resources/scripts/task-diff-coverage.mjs` | 96/97 | 99.0% | 56 | `coverage/lcov-core.info` |
| `packages/core/src/injection/surface.ts` | 470/492 | 95.5% | 414-415, 456-467, 477-481, 490-492 | `coverage/lcov-core.info` |
| `packages/core/src/task/case-gates.ts` | 435/459 | 94.8% | 161-163, 324-325, 327-328, 362-364, 368-369, 375-376, 397-398, 406-407, 431-432, 450-451, 454-455 | `coverage/lcov-core.info` |
| `packages/core/src/task/case-scope.ts` | 71/71 | 100.0% | - | `coverage/lcov-core.info` |
| `packages/core/src/task/case-structure.ts` | 400/422 | 94.8% | 138-139, 158-160, 163-165, 169-171, 174-176, 251-253, 355-357, 385-386 | `coverage/lcov-core.info` |
| `packages/core/src/task/coverage-compute.ts` | 375/380 | 98.7% | 281, 330-333 | `coverage/lcov-core.info` |
| `packages/core/src/task/state/guards.ts` | 296/298 | 99.3% | 295-296 | `coverage/lcov-core.info` |
| `packages/core/src/task/state/migrate.ts` | 259/261 | 99.2% | 246-247 | `coverage/lcov-core.info` |
| `packages/core/src/task/storage/records.ts` | 341/341 | 100.0% | - | `coverage/lcov-core.info` |
| `packages/core/src/task/task-ops.ts` | 1260/1337 | 94.2% | 123-124, 240-241, 322-323, 358-359, 449-450, 486-487, 593-603, 667-668, 706-707, 788-791, 1062-1063, 1179-1182, 1184-1185, 1187-1188, 1202-1203, 1215-1216, 1234-1237, 1243-1244, 1247-1250, 1253-1256, 1258-1267, 1272-1273, 1280-1281, 1315-1316, 1319-1320 | `coverage/lcov-core.info` |
| `packages/core/src/workspace/git-query.ts` | 458/476 | 96.2% | 229-235, 245-246, 274, 366, 377-378, 391, 428-429, 446, 475 | `coverage/lcov-core.info` |
| `packages/dsh-workloom/src/tooling/tasks.ts` | 462/561 | 82.4% | 349-361, 382-394, 400-417, 435, 446-448, 470-471, 489-490, 492-500, 502-504, 508-516, 519-532, 549-560 | `coverage/lcov-dsh.info` |

未覆盖行说明（轨道一整文件口径，汇总见 `coverage/whole-file-summary.md`）：task-diff-coverage.mjs 56 为空文件列表的渲染分支；surface.ts 为工具入参异常与降级分支；case-gates.ts 为越界路径、报告缺失与 catch 兜底分支；case-structure.ts 为 YAML 解析失败与重命名归一的防御分支；coverage-compute.ts 281 为区间续接分支、330–333 为 parseReport 的不可达 default 分支；guards.ts、migrate.ts 为守卫拒绝与迁移拒绝的兜底分支；task-ops.ts 为非法入参与异常分支；git-query.ts 为路径解码失败、二进制跳过与 git 失败分支；dsh tasks.ts 为工具入参校验与主会话限制分支。轨道二（变更行口径）只有 34 行未覆盖：case-gates.ts 16 行（越界路径、报告缺失 catch、阈值分支两侧的 message 组装）、git-query.ts 10 行（decodeGitDiffPath 解码失败、readUntrackedRanges 读取失败与二进制跳过）、coverage-compute.ts 5 行、task-ops.ts 2 行（readResultFingerprint 的 catch）、CLI 1 行。

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/dist/` | `构建产物，镜像 src；C6 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核` |
| `packages/dsh-workloom/dist/` | `构建产物，镜像 src；C6 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核` |
| `packages/core/test/` | `测试夹具与门禁、交集、豁免链路用例自身；C1 至 C4 与 C6 验全绿` |
| `packages/dsh-workloom/test/` | `dsh check schema 钉住与透传用例自身；C4 与 C6 验全绿` |
| `packages/core/resources/scripts/task-diff-coverage.test.mjs` | `脚本单测自身；C1 验全绿` |
| `packages/core/resources/templates/case.md` | `CASE 模板英文文本，无运行时行；C6 以 contract-asset 与 case-templates 用例及 grep 验 below_threshold 与变更行口径` |
| `packages/core/resources/templates/case-result.md` | `RESULT 模板英文文本，无运行时行；C6 以 contract-asset 与 case-templates 用例及 grep 验 below_threshold、Below Threshold 子节与 codeFingerprint 说明` |
| `packages/core/resources/workflow/workflow.md` | `工作流步骤 guidance 英文文本，无运行时行；C6 验三句同步、version 不升与 contract-asset 钉住` |
| `coverage/` | `开发者按 PLAN 步骤 14 在 worktree 根产出的自测报告与交集结果（lcov、json，非代码，不进覆盖率）；CASE 执行轮证据统一写任务目录 coverage/，worktree 内该目录不提交，由主会话在 2.4 提交前删除` |

### Collection Failure

`none`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | `0` | `case-evidence/c6-build.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/c6-typecheck.log` |
| `pnpm lint` | `0` | `case-evidence/c6-lint.log`（无 error 与 warning） |
| `cd packages/core && pnpm test` | `0` | `case-evidence/c6-core-tests.log`（768 pass，0 fail，含 dist-mirror 与 dist-dts 守卫） |
| `cd packages/dsh-workloom && pnpm test` | `0` | `case-evidence/c6-dsh-tests.log`（211 pass，0 fail，含 dist-mirror 守卫） |
| `git diff --check` | `0` | `case-evidence/c6-diff-check.log`（无空白错误） |

## Resolved Findings

- `packages/core/src/task/coverage-compute.ts:343 [P2] .d.ts 被 endsWith('.ts') 误判为可执行，类型声明缺席报告会触发 coverage_missing_file — fixed: 新增 isExecutableFile（先排除 .d.ts）供缺席判定；补用例「.d.ts 类型声明不计入可执行集合」`
- `packages/core/src/task/case-gates.ts:214 [P2] Raw reports 下任意 coverage/ 路径都被当作报告，交集 JSON 产物会把格式推成 unsupported 并静默关闭机械复算 — fixed: coverage-compute.ts 新增 DIFF_COVERAGE_ARTIFACTS 与 isDiffCoverageArtifact，门禁跳过两产物，CLI 产物名改引用同一常量；补用例（产物列入 Raw reports 时 coverage_recompute 仍触发）`
- `packages/core/src/task/case-gates.ts:38 [P2] issue code 字面量重复（artifact_path_invalid、coverage_files、coverage_recompute、coverage_status 各 2 至 3 处） — fixed: ISSUE_CODES 冻结表单源，41 处 issue() 调用改引用`
- `packages/core/src/workspace/git-query.ts:180 [P2] 'HEAD' 与 '--' 字面量各重复两处 — fixed: 抽常量 GIT_HEAD_REF 与 GIT_PATH_SEPARATOR，GIT_DIFF_CHANGED_ARGS 与 refArg/路径分隔符改引用`
- `packages/dsh-workloom/test/tasks.test.ts:84 [P2] check schema 用例缺 reason.description 相等判定，且无 coverageWaiver 透传用例 — fixed: 补描述相等断言与透传用例（无指纹 RESULT 以 codeFingerprint 错误拒绝，缺省照常写凭据）`
- `packages/core/test/case.test.ts:787 [P2] 缺文件集合不一致（coverage_files）用例 — fixed: 在「复算不一致」用例补 Changed Files 行路径不在复算文件集的场景`
- `packages/core/test/coverage-compute.test.ts:166 [P2] 缺 .d.ts 不计入可执行集合的用例 — fixed: 新增用例`
- `case.md:C4 步骤 3 场景 C 与 E（CASE 措辞，非代码）— 场景 C 的「带 coverageWaiver」两次调用应为「不传豁免沿用既有记录」；场景 E 期望文案含 coverage_below_reasons 码值，而门禁把 issue 的 message 而非 code 拼进拒绝文案 — 已按实际语义核对并多出 C3 一条，建议主会话在下次修订 CASE 时同步措辞`

## Open issues

- none
