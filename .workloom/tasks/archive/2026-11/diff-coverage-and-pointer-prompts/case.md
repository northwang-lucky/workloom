---
version: 1
task: tasks/11-24-diff-coverage-and-pointer-prompts
---

<!-- checker-discipline: how the Checker authors and revises this CASE; re-read before writing or changing any section
- SR/C writing: one entry covers one cohesive slice of one file — Target names a single file path (`<file>#<symbol>` or the whole file), every Check is a decidable yes/no structure, type, naming, behavior, or spec conformance check, and Expected states a decidable code property, never a restatement of requirement intent.
- Traceability: every AC in prd.md is covered by at least one SR or one C row in the Traceability table; an uncovered AC is a CASE defect, and Coverage Exclusions only relax statistics, never the AC mapping.
- Evidence integrity: Evidence cites real observed anchors as `<file>:<line>` instead of restating the Expected text; probe scripts live in `case-evidence/probes/` with only pointers in prose; compute `codeFingerprint` for C5 with the core package's package-relative script `scripts/task-fingerprint.mjs` (under `resources/`, never a repo-absolute path) and record the 64-hex value in the result's codeBaseline.
- Result discipline: the Standard Verification exit-code cell is bare `0`; both cells of every Exclusions row are backtick-wrapped; Overall coverage lines use the `covered/total (pct%)` form only; the last section of the result is `## Open issues` and its body is exactly `- none` when clean.
-->

# CASE: 任务增量覆盖率门禁与派发注入纯指针化（容器集成）

## References

- PRD: `prd.md`
- Implementation: 容器自身无 plan，按 children 顺序列四个子任务 plan.md 完整路径（workflow 2.2 容器规约，parent_plan 门禁按任务相对完整路径逐项匹配）：
  1. `tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md`（S1 增量覆盖率门禁与采集脚本）
  2. `tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md`（S2 派发注入纯指针化与 CASE 模板 init 落盘）
  3. `tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill/plan.md`（S3 config 编辑专属 skill 与引用收编）
  4. `tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config/plan.md`（S4 覆盖率工具配置驱动与内置默认）
- Code target: 主检出 main 合并代码。四个子任务的 feature 提交（`7997e50` S1、`1a865b0` S2、`2144ef2` S3、`bec79fa` S4）已按序合入 main，另含设计轮上报后的修复提交 `2c63069`（git-query maxBuffer，见 Execution Notes 第 8 条）；合并基线为 `4b5454f`（`7997e50^`，四件合并前的最后一个提交）。容器不配发 worktree 与任务分支（PRD：容器只编排不实现），全部 SR 静态审与 C 运行时用例在主检出根执行。下文 `<MAIN>` 指主检出根（本文件所在仓库的根目录），`<task>` 指本文件所在目录；行号锚点以 `main@31dae1c` 为准（`2c63069` 仅改 git-query.ts 及其 dist 镜像，本 CASE 无 SR 目标该文件；执行轮预期 src 零改动）。
- Source task: none（容器为根任务，无前置）

## Scope

- Requirements: R1、R2、R3、R4、R5（R1–R4 以四件合并行为在 main 上复核，R5 为本 CASE 主体）
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5
- Out of scope:
  - 端到端部署验收：运行中插件仍旧版，profile 重钉（`pnpm update @workloom-ai/dsh-workloom`）、用户授权重启（`dsh-stop --only-ui && dsh-start --only-ui`）与部署后新任务上四件行为的端到端观察，留待部署后由主会话按 repo/deployment 执行，不在本 CASE。AC5「部署同步完成」中的 dist 与 src 同 commit 已由 C7 步骤 6 以 git 状态核对，重钉与重启属主会话簿记。
  - 子任务内部逐文件深审：四个子任务 CASE 已各自归档通过（C1 只核归档态与合并基线），本 CASE 只验四件在 main 上的合并接缝与一致性，不重审各子任务 SR 明细。
  - 执行轮代码改动：容器零实现（PRD），发现代码缺陷按分级上报主会话处置，不在本 CASE 内修复；仅 CASE 文档自身缺项可由 checker 修订后全量重跑。
  - 旧门禁口径下的容器变更集语义：容器无 worktree，旧门禁（运行中插件）按主检出工作区未提交集合核对 Changed Files 文件集，必然只剩 `.workloom/` 簿记与无关未跟踪文件；轨道一按其口径填写（Exclusions 排除无关项后文件集为空），真实增量证据在轨道二（`4b5454f...HEAD`）。
  - 不回测 B07、不改 zephyra、不 push、不执行 `dsh-stop`/`dsh-start`。

## Static Review

### SR1 门禁消费配置与 formatHints 构造

- Covers: `AC5、AC1、AC4`
- Target: `packages/core/src/task/case-gates.ts#evaluateCaseOutcomeGate`
- Checks:
  1. 覆盖率配置经 `loadConfig(worktreeDirectory(root, task))` 读取（L357–L360，worktree 取任务 worktree 根、分支配置优先）；读取失败追加 `coverage_config` 问题码（L50 定义），不抛裸异常；`threshold` 回退链为 `coverageConfig?.coverage.threshold ?? DEFAULT_THRESHOLD`（L364）。
  2. `formatHints` 构造（L388–L390）：`coverageConfig === null` 时为 `undefined`；否则调 `buildFormatHints(lines.keys(), reportTexts.length, config.coverage.languages)` 并传入复算（L392 `computeDiffCoverage({ root: worktree, changedLines, reports, exclusions, formatHints })`）。
  3. 阈值判定经 `meetsThreshold(thresholdBasis.covered, thresholdBasis.total, threshold)`；`coverage_threshold` 与 `coverage_status` 两处文案均含 `configured threshold ${threshold}% (default ${DEFAULT_THRESHOLD}%)` 插值（L451、L454），无字面量 `90`。
  4. 豁免来源 `options.coverageWaiver ?? task.check?.coverageWaiver`，有效条件为 `reason` trim 非空且指纹等于 RESULT `codeBaseline` 提取值；无效追加 `coverage_waiver`。
  5. 不支持格式分支：`thresholdBasis` 取 RESULT 自报 Overall；期望文件集回退变更文件集（L399–L401 减 `.workloom/`、Exclusions 命中项与不存在文件）；缺席检测仅 `supported` 时执行（L408）。
  6. 报告读取 `coverageReportPaths` 过滤交集产物（L223–L226，`isDiffCoverageArtifact` 排除 `coverage/changed-lines.json` 与 `coverage/diff-coverage.json`）。
- Expected: 每条检查可在 L357–L470 逐行定位；门禁阈值、格式提示、豁免、回退四链路均消费 S4 配置层与 S1 计算源，无独立实现。

### SR2 四格式复算与 formatHints 回退

- Covers: `AC5、AC1、AC4`
- Target: `packages/core/src/task/coverage-compute.ts#whole-file`
- Checks:
  1. `CoverageFormat` 值域恰为 `go`、`lcov`、`jacoco-xml`、`cobertura-xml`、`mixed`、`unsupported`（L90）；`parseCoberturaXml` 具名导出（L385）。
  2. `inferFormat` cobertura 规则（L203–L207）：`/<coverage\b/` 且 `/<lines\b/` 判 `cobertura-xml`，与 jacoco 的 `<report` 区分。
  3. 内容推断优先：仅 `unsupported` 回退同序 `formatHints`（L478–L480）；`combineFormats` 任一 `unsupported` 即整体 `unsupported`（L235–L239）。
  4. `meetsThreshold(covered, total, threshold = DEFAULT_THRESHOLD)` 整数交叉乘（L186–L189）；`DEFAULT_THRESHOLD` 经 `import` 来自 `../workspace/config-defaults.ts`（L15），本文件无 `90` 字面量。
  5. `buildFormatHints`（L213–L231）：恰一种内置语言时广播 `config.languages[lang] ?? LANGUAGE_DEFAULTS[lang]`（经 `FORMAT_NORMALIZE`）；多语言或无命中返回 `undefined`。
  6. `EXTENSION_LANGUAGE` 单表（L28）；`EXECUTABLE_EXTENSIONS` 由其键派生（L50–L52）；`detectLanguage` 未命中返回 `null`（L59）。
  7. `buildWaiver(reason, fingerprint)` 返回 `{ reason, fingerprint, at: ISO-8601, source: 'main' }`（L195）；`isDiffCoverageArtifact` 与 `DIFF_COVERAGE_ARTIFACTS` 冻结产物名（L79–L87）。
- Expected: 门禁与脚本共用该单一计算源；四格式与阈值参数化行为可逐项判定。

### SR3 coverage 配置解析

- Covers: `AC4`
- Target: `packages/core/src/workspace/config-defaults.ts#parseCoverage`
- Checks:
  1. `DEFAULT_THRESHOLD = 90` 唯一定义并导出（L14）；`DEFAULT_CONFIG.coverage` 为 `{ threshold: DEFAULT_THRESHOLD, languages: {} }`（L49）。
  2. `parseCoverage`（L282–L299）：未知子字段报 `unknown field (allowed: threshold, languages)`；`threshold` 校验 0–100 整数且文案不复用「0 means unlimited」；`languages` 的 `format` 枚举校验；`command` 占位符校验。
  3. `COVERAGE_PLACEHOLDER_TOKENS` 封闭三 token（L93：`<worktree>`、`<profile>`、`<base-ref>`）；`renderCoverageCommand` 先按白名单校验、未知 token fail loud 再替换（L106–L112）。
- Expected: 校验分支与文案可逐字定位；三 token 集合与 config-edit SKILL.md 文档一致（C4 grep 核对）。

### SR4 配置合并与全局层拒绝

- Covers: `AC4、AC3`
- Target: `packages/core/src/workspace/config-load.ts#whole-file`
- Checks:
  1. `mergeWithDefaults` 含 `doc.coverage` 解析分支（经 `parseCoverage`，非法即 `WorkloomConfigError` 且字段路径含 `coverage.`）。
  2. `GLOBAL_PROJECT_ONLY_FIELDS` 集合含 `coverage`（L59）；全局层出现 `coverage` 报 `project-level field` 文案（L288–L291）。
  3. `loadConfig(root, options)` 支持可选 `homeDir`（L71），覆盖全局层基准目录——测试与探针 HOME 隔离的官方入口。
- Expected: coverage 项目级字段经三层流水线合并；全局层拒绝行为可判定。

### SR5 五角色纯指针

- Covers: `AC2、AC5`
- Target: `packages/core/src/injection/prompt-compose.ts#buildExecutorPrompt`
- Checks:
  1. prd 软指针全角色统一（L257–L260：`prd.md` 存在才出、独立一行无标题、不进 Pointer list、不物化正文）。
  2. Pointer list 仅非 researcher 角色（L237）：`plan.md` 指针存在才出；checker 追加 case.md 指针与两份模板副本指针；jsonl 指针按角色映射（L63–L68）。
  3. checker 在组装前先调 `assertCaseTemplatesReady(params.root)`（L230–L233）；其余角色不受模板副本状态影响。
  4. `stats.filesInlined` 恒 0（L219 初始化后无递增路径）；`filesPointed` 如实累计指针行。
  5. `BuildExecutorPromptParams` 无 `caseTemplates` 键（grep 无命中，S2 已删入参）。
  6. research 产物指针对全角色生效（L253 `inlineResearchMaterials`，researcher 同样获得）。
- Expected: 五角色注入只产出指针行；无 prd 节块物化与 CASE/模板全文内联。

### SR6 副本指针与只读守卫

- Covers: `AC2`
- Target: `packages/core/src/injection/prompt-sections.ts#whole-file`
- Checks:
  1. `inlineCurrentCase` 只出 case.md 指针行（L76，存在才出）；`inlineCaseTemplates` 只出 `.workloom/templates/` 两副本指针行（L91）。
  2. `assertCaseTemplatesReady`（L102–L116）：读插件模板（`loadCaseTemplateText`/`loadCaseResultTemplateText`）与副本比对，只读不写；缺失或过期抛错，文案含 `rerun workloom init to refresh them`；插件模板资产缺失报部署残缺。
  3. 物化路径已删：`inlinePrdArtifact`、`extractPrdContent`、`splitH2Sections` 在本文件与 core 导出面均无残留（grep 无命中）。
  4. `pointerLine` 输出形态为 `- <path>` 或 `- <path> (<reason>)`（L150–L153）。
- Expected: 三函数行为与守卫文案可判定；缺失/过期仅拒 checker 派发。

### SR7 模板落盘刷新

- Covers: `AC2`
- Target: `packages/core/src/workspace/case-templates.ts#ensureCaseTemplates`
- Checks:
  1. 入参 `{ root, caseTemplate, caseResultTemplate }`；返回 `[err, { root, created, updated } | null]`（L73–L115）。
  2. 内容比对三态：一致跳过、不一致 `writeFileAtomic` 覆盖并记 `updated`、缺失新建记 `created`（L108–L115）；原子写为同目录临时文件 + rename（L18 import）。
  3. 无 `.workloom` 或写盘失败返回 err，不静默。
- Expected: 三态转换与产物路径（`.workloom/templates/case.md`、`case-result.md`）可判定；与 spec-templates「已存在不覆盖」刻意不同（CASE 结构是门禁契约须随插件版本同步）。

### SR8 doctor 第六检查

- Covers: `AC2`
- Target: `packages/core/src/workspace/doctor-check-rules.ts#checkCaseTemplates`
- Checks:
  1. `checkCaseTemplates`（L563）只读比对：副本缺失/过期各出一条 issue，`code: 'case_templates'`、`fixable: true`、hint 指引重跑 init（L569–L595）；插件模板资产缺失报 error 级 issue（部署残缺）。
  2. `doctor-types.ts` 的 `DoctorIssueCode` 含 `case_templates`（L24）且元信息 severity 为 warn（L114）；`doctor-checks.ts` `collectChecks` 收编为六类检查（L69）。
  3. 与 `assertCaseTemplatesReady` 同一比对源（`compareCaseTemplateCopies` + 插件模板 loader），无第二套判定。
- Expected: 六码注册完整、可逐字定位；doctor 兜底与派发守卫口径一致。

### SR9 init 落盘扩展

- Covers: `AC2`
- Target: `packages/dsh-workloom/src/tooling/commands.ts#ensureTemplates`
- Checks:
  1. `ensureTemplates`（L119）在 spec 模板之外读两份 CASE 模板调 `ensureCaseTemplates({ root: cwd, ... })`（L141）。
  2. 失败 `console.warn` 不阻塞 init（warn-only 与 spec 模板同口径）；`handleInit` 调用链不变。
  3. 插件层不自持比对逻辑（薄投影：只取 cwd、读 core 资产、调 core）。
- Expected: init 后 `.workloom/templates/` 两副本存在且与插件模板一致（dsh `test/commands.test.ts` 钉住）；重跑 init 按 SR7 三态刷新。

### SR10 config-edit skill 资产

- Covers: `AC3`
- Target: `packages/core/resources/skills/workloom-config-edit/SKILL.md`
- Checks:
  1. frontmatter `description` 触发分支区分 config 字段编辑与 packages-scan 扫描（L3，trigger 列表含 `coverage`）；`whenToUse` 列四种 config 文件路径（L4）。
  2. 五步纪律各带 `*Completion:*` 判据（步骤 2 判据含白名单拒绝，L14）；未设 `disable-model-invocation`（模型可召唤）。
  3. 九字段白名单表（L21–L33）：八个既有字段 + `coverage` 行 `{ threshold?, languages? }`（L33）。
  4. Coverage configuration 节（L39–L49）：`coverage.threshold` 0–100 整数默认 90 且门禁严格大于；`format` 恰列 `go-coverprofile`/`lcov`/`jacoco-xml`/`cobertura-xml` 四枚举；占位符恰列 `<worktree>`/`<profile>`/`<base-ref>` 三 token 并声明其余 fail；含合法示例。
  5. Boundaries：全局层拒绝并指引 `workloom-migrate-to-sop`；packages-scan 的提议收编为入口分工（L55、L63）。
  6. 注册：`packages/core/src/resources-manifest.ts` `SKILL_ENTRIES` 含 `skills/workloom-config-edit/SKILL.md`（L60），dsh `test/skills.test.ts` 名单钉住（L152–L157）。
- Expected: 全部锚点 grep 可定位；正文英文；字段清单与 `DEFAULT_CONFIG`/`mergeWithDefaults` 实际字段一致。

### SR11 packages-scan 语言检测

- Covers: `AC4`
- Target: `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs`
- Checks:
  1. `detectLanguage` 自 `../../../../dist/task/coverage-compute.js` 单源 import（L21）；脚本内无第二处扩展名→语言映射。
  2. `detectPackageLanguages`（L47–L74）按源码扩展名归类、去重、排序；条目 `languages` 字段仅非空时输出（L131–L132）。
  3. 输出 JSON 形态为 `{ name: { path, type?, git?, languages? } }`（L8 模块注释）；入口守卫 `pathToFileURL(resolve(process.argv[1])).href === import.meta.url`（L454–L461）。
- Expected: 检测复用 core 单源；夹具目录的语言栈输出可逐值判定。

### SR12 packages-scan 提议与写入口

- Covers: `AC4、AC3`
- Target: `packages/core/resources/skills/workloom-packages-scan/SKILL.md`
- Checks:
  1. 步骤 3（L15）：对 `LANGUAGE_DEFAULTS` 命中的语言提议 `coverage.languages` 条目，经 `workloom-config-edit` 与 `packages` 候选一并确认；无内置默认的语言标注需手动 `format` 与 `command`、不猜测。
  2. 步骤 6（L18–L22）：写入走 `workloom-config-edit` 纪律（读现状与合并结果、展示 diff、确认、原子写、doctor 校验）；既有 `coverage.languages` 条目保留、只新增确认项。
  3. Boundaries（L66–L67）：`packages` 与 `coverage.languages` 之外的 config 字段编辑归 config-edit；仅内置默认语言自动提议。
- Expected: 提议→确认→写入三段引用链可逐字定位（S3 收编与 S4 提议的合并面）。

### SR13 migrate-to-sop 引用

- Covers: `AC3`
- Target: `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md`
- Checks:
  1. Config field migration 节（L44–L46）：遗留字段迁移用本脚本；项目/本地层其他通用 config 字段编辑经 `workloom-config-edit`，全局层仍用本脚本。
  2. Preconditions 备份条与 config-edit 对齐（git 兜底、未提交先 `.bak`）。
- Expected: 引用含项目/本地层限定且恰一处；既有迁移脚本命令不变。

## Runtime Cases

时序纪律：所有运行时用例以 `pnpm -r build` 先行为前提（探针 import core dist，dsh 测试经 `@workloom-ai/core` 加载 core dist）；探针源码放 `<task>/case-evidence/probes/`，夹具放 `case-evidence/fixtures/`，临时仓库与临时 HOME 经 `mktemp -d` 创建并在 `finally` 删除；探针一律以 `HOME=<临时空目录>` 环境运行（本机 `~/.workloom/config.json` 存在，全局层须恒空以保证 loadConfig 判定确定）；不写生产目录、不 commit、不 push；任何代码修复之后 SR 与全部 C 项全量重跑（本 CASE 预期零代码改动，见 Out of scope）。

### C1 子任务归档状态与合并基线

- Covers: `AC1、AC2、AC3、AC4`
- Preconditions:
  1. 四个子任务已归档（children-archived 守卫语义：status `completed`）；主检出 main HEAD 含四个 feature 提交。
- Steps:
  1. 探针 `case-evidence/probes/c1-children-archived-probe.mjs`：按 children 顺序逐子任务读 `task.json` 与 `case-result.md`，输出汇总表（子任务名、status、stage、check.passedAt、case.phase、commit、RESULT status）。
  2. 断言逐项：四个 `task.json` 的 `status === 'completed'` 且 `stage === 'completed'`；`check.passedAt` 均为非空 ISO-8601；`case.phase === 'done'`；四个 `case-result.md` front-matter `status: passed`。
  3. 对四个 `task.json` 的 `commit` 字段值（`7997e50`/`1a865b0`/`2144ef2`/`bec79fa`）在主检出逐个执行 `git merge-base --is-ancestor <commit> HEAD`，退出码全部为 0（四件已按序合入 main）。
  4. 合并基线钉死：`git rev-parse 7997e50^` 输出 `4b5454f` 开头（轨道二 baseRef 的来源证明）。
- Expected:
  1. 汇总表四行全部满足步骤 2 断言；步骤 3 四个命令退出码均为 0。
  2. 步骤 4 输出以 `4b5454f` 开头。
- Evidence:
  - `case-evidence/c1-children-archived.log`
- Cleanup: none（只读探针）。

### C2 S1+S4 增量门禁链路

- Covers: `AC5、AC1、AC4`
- Preconditions:
  1. C1 通过；`pnpm -r build` 已执行，`packages/core/dist/task/case-gates.js`、`coverage-compute.js`、`case-scope.js`、`task-ops.js` 存在。
  2. 探针在 `mktemp -d` 的隔离仓库与隔离 HOME 下运行，函数级调用 dist 导出（`evaluateCaseOutcomeGate`、`listCaseChangedLines`、`checkTask`），不触碰任何真实任务。
- Steps:
  1. 夹具仓库（探针内构造）：`git init` 并配置 user；main 分支基线提交含 `go.mod`（`module example.com/probe`）、`src/a.ts`（10 行，每行 `export const aN = N`）、`src/b.go`（6 行）、`src/C.java`（5 行）、`docs/readme.md`（2 行）；切分支 `workloom/c2-probe` 提交改动：改写 `src/a.ts` 全部 10 行、改 `src/b.go` 第 5 行、改 `src/C.java` 第 4 行、新增 `src/d.kt`（3 行）、改 `docs/readme.md` 第 1 行。
  2. 任务夹具：`.workloom/tasks/probe-t1/` 下 `prd.md`（一个 AC）、`case.md` 与 `case-result.md` 按子任务单测夹具（`packages/core/test/case.test.ts` 的 validCase/validResult）最小合法形态构造（SR/C 各一条且两边 id 一致、必要节齐全、`checkSession` 等于 `case.designSession`）、`coverage/` 四份报告；`task.json` 记录 `case: { required: true, designSession: 'probe-design-1', phase: 'done' }`、`branch: 'workloom/c2-probe'`、`base_branch: 'main'`、`worktree_path: ''`、`check: null`、`overrides: []`。
  3. 报告夹具（`case-evidence/fixtures/c2/`，探针复制进任务目录）：`go.out`（`mode: set` + `example.com/probe/src/b.go:5.5,5.10 1 1`）、`lcov.info`（`SF:src/a.ts` 的 `DA:1,1` 到 `DA:10,1`，场景变体改 hits）、`jacoco.xml`（package `src` + sourcefile `C.java` 的 `<line nr="4" mi="0" ci="5" .../>`）、`cobertura.xml`（`<coverage>` 根 + `<lines>` 与 class `filename="src/d.kt"` 的 `<line number hits>`，3 行全 hits>0）。
  4. 口径核对：直接调 `listCaseChangedLines(root, task)` 断言三点口径提取区间恰为 `src/a.ts` {1–10}、`src/b.go` {5}、`src/C.java` {4}、`src/d.kt` {1–3}、`docs/readme.md` {1}（变更行经真实 git 三点 diff 提取，证明门禁无 options.changedLines 注入时的取数路径）。
  5. 基线场景（证明夹具自身合法）：RESULT 声明四份 Raw reports、Changed Files 表列 `src/C.java 1/1`、`src/a.ts 10/10`、`src/b.go 1/1`、`src/d.kt 3/3`、`Overall lines: 15/15 (100.0%)`、`Status: generated` → `evaluateCaseOutcomeGate` 问题列表为空。
  6. 默认阈值场景：lcov 改 2 行 `hits=0` 且 RESULT 同步 `13/15 (86.7%)` 与 a.ts `8/10` → 含 `coverage_threshold` 且文案含 `configured threshold 90%`；lcov 改 1 行 `hits=0`（a.ts 9/10）且 RESULT 同步 `14/15 (93.3%)` → 问题列表为空（93.3% 大于 90 达标）。
  7. 配置阈值场景：在夹具根写 `.workloom/config.json` `{"coverage":{"threshold":80}}` → a.ts 7/10 覆盖、RESULT 自报 `12/15 (80.0%)` → 含 `coverage_threshold` 且文案含 `80%`（恰等于阈值不达标）；a.ts 8/10、`13/15 (86.7%)` → 问题列表为空；删除 config 后同 13/15 → 再次 `coverage_threshold`（缺省回退 90）。
  8. 豁免指纹场景（仍在 e.rs 提交之前）：保留 config 80 与 a.ts 7/10，RESULT 改 `Status: below_threshold`、Summary 同步、`Overall lines: 12/15 (80.0%)`、新增 `### Below Threshold` 子节含一行 ``- `src/a.ts`: line 8 is a defensive branch``、`codeBaseline: main@<基线 sha>; codeFingerprint=<hex-A>`：
     1. `options.coverageWaiver = { reason: 'reviewed', fingerprint: <hex-A> }` → 问题列表为空（豁免生效）。
     2. fingerprint 改 `<hex-B>` → 含 `coverage_waiver`。
     3. 不传豁免 → 含 `coverage_waiver`（below_threshold 无有效豁免即拒，文案指向 codeFingerprint 失配）。
     4. lcov 恢复至 a.ts 9/10 覆盖且 RESULT 自报 `14/15 (93.3%)`、仍声明 below_threshold → 含 `coverage_status`（93.3% 大于阈值 80，不得声明 below_threshold）。
  9. checkTask 链路场景（仍在 e.rs 提交之前；真实 `checkTask`，task.json 按 light 模式夹具：`status: in_progress`、`mode: light`、dispatches 含 checker case-design 与 execution 两条且 childId 均为 `probe-design-1`）：`checkTask(root, { taskRelPath, summary: 'probe ok', coverageWaiver: { reason: 'reviewed by main session' } })` → err 为 null 且 task.json `check.coverageWaiver` 为 `{ reason, fingerprint: <hex-A>, at, source: 'main' }`；再不传豁免复查一次 → `check.coverageWaiver` 四字段与首次完全相同（继承）；把 RESULT 指纹改 `<hex-B>` 后以「不带豁免复查」与 `force: true, reason: 'try'` 两种调用（存量豁免指纹 hex-A 与 RESULT 新指纹失配，豁免失效）→ 均返回错误且文案含 `cannot be bypassed with force`，task.json 字节与继承后完全相同、`overrides` 为 `[]`；再以带新 `coverageWaiver` 调用则按当前指纹重建豁免而通过（指纹绑定语义）。
  10. 缺席硬拒场景：分支追加一个提交新增 `src/e.rs`（4 行）→ 四份报告不含 e.rs → 含 `coverage_missing_file` 且文案列出 `src/e.rs`；`docs/readme.md` 同样不在任何报告但为非可执行后缀、不触发缺席问题（该检测对 `generated`/`below_threshold`/`not_applicable` 三态统一生效，本场景以 generated 验证）。
  11. unsupported 回退场景（在 e.rs 提交之后）：四份报告替换为 `coverage/plain.txt`（正文为无任何格式标记的普通文本）、RESULT Raw reports 指向它、Changed Files 表按回退口径列全部变更文件（`docs/readme.md`、`src/C.java`、`src/a.ts`、`src/b.go`、`src/d.kt`、`src/e.rs`）→ RESULT 自报 `14/15 (93.3%)` → 问题列表为空（回退分支自报过阈值）；自报 `13/15 (86.7%)` → 含 `coverage_threshold`（回退阈值仍硬）；e.rs 不在报告但无 `coverage_missing_file`（unsupported 跳过缺席检测）。
  12. 逐场景把问题码清单写入探针日志（场景名 + 期望码 + 实际码三列）；e.rs 提交前后的场景次序即步骤 5–9（前）与 10–11（后）。
- Expected:
  1. 步骤 4 区间断言逐值一致；步骤 5 问题列表为空。
  2. 步骤 6–11 各场景的实际问题码与期望逐项一致；阈值文案的插值数字（90/80）与配置状态对应。
  3. 步骤 9 豁免记录持久化、继承、指纹失效加 force 拒绝三段全部成立，`overrides` 恒为 `[]`。
- Evidence:
  - `case-evidence/c2-gate-chain-probe.log`
  - `case-evidence/fixtures/c2/go.out`
  - `case-evidence/fixtures/c2/lcov.info`
  - `case-evidence/fixtures/c2/jacoco.xml`
  - `case-evidence/fixtures/c2/cobertura.xml`
- Cleanup: 探针在 `finally` 删除夹具仓库与临时 HOME。

### C3 S2 纯指针注入与模板生命周期

- Covers: `AC2、AC5`
- Preconditions:
  1. C2 通过；`pnpm -r build` 已执行，dist 的 `injection/prompt-compose.js`、`prompt-sections.js`、`workspace/case-templates.js`、`doctor-check-rules.js`、`resources-manifest.js` 存在。
  2. 探针在 `mktemp -d` 的隔离根下运行；模板正文取 `loadCaseTemplateText()`/`loadCaseResultTemplateText()`（dist resources-manifest 读取主检出的 `packages/core/resources/templates/`，与派发守卫同一比对源）。
- Steps:
  1. 夹具：`.workloom/tasks/probe-t1/` 下 `prd.md`（正文含唯一哨兵行 `PRD-BODY-SENTINEL-7f3a`，无 `## UI Design` 节）、`plan.md`、`implement.jsonl`（一行 `{"file": "notes/spec-refs.md", "reason": "shared spec refs"}`）、`check.jsonl`（一行 `{"file": "notes/spec-refs.md", "reason": "check refs"}`）、`case.md`（正文含唯一哨兵行 `CASE-BODY-SENTINEL-9c1`）、`research/notes.md`、`task.json`（light 最小合法记录：`status: in_progress`、`mode: light`、`case: { required: true, designSession: 'probe-design-1', phase: 'done' }`、`branch`/`base_branch`/`worktree_path` 为空、`dispatches`/`overrides` 空数组、`check: null`——checker 的 case.md 指针行要求任务记录可读，记录缺失时 inlineCurrentCase 静默降级不出指针）；夹具根下另建 `notes/spec-refs.md`（jsonl 条目指向的文件须存在才出指针行）；先调 `ensureCaseTemplates({ root, caseTemplate, caseResultTemplate })` 播种 `.workloom/templates/` 两副本。
  2. 五角色循环（researcher/developer/frontend-developer/checker/judger）`buildExecutorPrompt({ root, taskRelPath: 'tasks/probe-t1', role, userPrompt: 'do the work', purpose: 'case-design' })`，逐角色断言：
     1. `stats.filesInlined === 0`。
     2. prompt 含 prd 软指针句（`consult .workloom/tasks/probe-t1/prd.md before deciding` 整句形态，独立一行无标题）；prompt 不含哨兵 `PRD-BODY-SENTINEL-7f3a`（完整结构形态的缺失断言）。
     3. 非 researcher 四角色含 `## Pointer list` 节且节内含 `- .workloom/tasks/probe-t1/plan.md` 与 jsonl 条目指针行 `- notes/spec-refs.md`；researcher 不含 `## Pointer list` 行、含 `- .workloom/tasks/probe-t1/research/notes.md` 指针行。
     4. checker 额外含 `- .workloom/tasks/probe-t1/case.md`、`- .workloom/templates/case.md`、`- .workloom/templates/case-result.md` 三指针行；prompt 不含哨兵 `CASE-BODY-SENTINEL-9c1`，且不含模板注释整行 `<!-- checker-discipline: how the Checker authors and revises this CASE; re-read before writing or changing any section`（模板全文缺失断言用完整行形态）。
  3. 守卫场景：删除副本 `case.md` → checker 的 `buildExecutorPrompt` 返回 err 且文案含 `rerun workloom init`，developer 同状态下仍 `[null, result]`；副本写回过期内容（改一个字节）→ checker err、developer 仍成功。
  4. 生命周期场景（`ensureCaseTemplates`，`created`/`updated` 取 `.workloom/templates/` 相对根的全相对路径）：全新 root → `created` 恰两副本、`updated` 空；原样重跑 → 均空；过期副本重跑 → `updated` 恰该项、`created` 空；删除副本重跑 → `created` 恰该项、`updated` 空。
  5. doctor 场景（`checkCaseTemplates(root)`）：播种后返回 `[]`；删除副本 → 返回 issue 且 `code === 'case_templates'`、title 为 Missing；写过期内容 → title 为 Outdated；issue 的 hint 含 init 指引。
  6. dsh 侧单测：`cd packages/dsh-workloom && node --test test/commands.test.ts test/executor.test.ts test/case-executor.test.ts test/discipline-text.test.ts`，记录退出码与用例名（定位关键词：`templates`、`filesInlined`、`pointer`、`init`）。
- Expected:
  1. 步骤 2 五角色 × 4 类断言全部成立（filesInlined 恒 0、prd/case/模板均为指针行、两类哨兵与模板整行均不出现）。
  2. 步骤 3 守卫只拒 checker，其余角色不受副本状态影响。
  3. 步骤 4 三态转换逐项一致；步骤 5 doctor 三态与六码注册一致。
  4. 步骤 6 退出码 0，用例清单含 init 播种副本、注入统计指针级、纪律句钉住三类用例。
- Evidence:
  - `case-evidence/c3-pointer-injection-probe.log`
  - `case-evidence/c3-dsh-injection-tests.log`
- Cleanup: 探针在 `finally` 删除夹具。

### C4 S3 skill 资产与注册

- Covers: `AC3`
- Preconditions:
  1. C3 通过；主检出工作区干净（skill 资产均已提交）。
- Steps:
  1. 锚点核对（单次 shell 批量执行，输出存 `case-evidence/c4-skill-assets.log`）：
     1. `grep -c '\*Completion:\*' packages/core/resources/skills/workloom-config-edit/SKILL.md` ≥ 5；`grep -n '^| \`coverage\`' packages/core/resources/skills/workloom-config-edit/SKILL.md` 命中九字段表的 coverage 行；`grep -n '<worktree>.*<profile>.*<base-ref>' packages/core/resources/skills/workloom-config-edit/SKILL.md` 命中占位符白名单行；`grep -n 'workloom-migrate-to-sop' packages/core/resources/skills/workloom-config-edit/SKILL.md` 命中全局层拒绝指引。
     2. `grep -n 'workloom-config-edit' packages/core/resources/skills/workloom-packages-scan/SKILL.md` 至少三处（步骤 3 提议、步骤 6 写入、Boundaries）；`grep -n 'workloom-config-edit' packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md` 命中 Config field migration 节引用且文案含项目/本地层限定。
     3. `grep -n 'workloom-config-edit' packages/core/src/resources-manifest.ts` 命中 SKILL_ENTRIES 条目。
  2. `cd packages/core && node --test test/contract-asset.test.ts`，记录退出码与用例名（定位关键词：`config-edit`、`coverage`、`Principles`）。
  3. `cd packages/dsh-workloom && node --test test/skills.test.ts`，记录退出码与用例名（定位关键词：`config-edit`、`skill 清单契约`）。
- Expected:
  1. 步骤 1 全部 grep 命中且计数符合预期（五步判据、九字段、三占位符、三处引用、注册条目）。
  2. 步骤 2 与 3 退出码 0；contract-asset 用例含 config-edit skill 存在/九字段/workflow Principles 指引句钉住；skills.test 名单断言含 `workloom-config-edit`。
- Evidence:
  - `case-evidence/c4-skill-assets.log`
  - `case-evidence/c4-contract-asset-tests.log`
  - `case-evidence/c4-skills-tests.log`
- Cleanup: none。

### C5 S4 配置驱动

- Covers: `AC4、AC5`
- Preconditions:
  1. C4 通过；`pnpm -r build` 已执行；探针在 `mktemp -d` 的隔离根与隔离 HOME 下运行（本机 `~/.workloom/config.json` 存在）。
- Steps:
  1. 探针 `case-evidence/probes/c5-config-driven-probe.mjs`（函数级 import dist 的 `loadConfig`、`buildFormatHints`、`computeDiffCoverage`、`meetsThreshold`）：
     1. loadConfig 解析：夹具根无 config → `coverage.threshold === 90` 且 `languages` 为空对象；写 `{"coverage":{"threshold":80,"languages":{"python":{"format":"lcov","command":"coverage run -m pytest && coverage lcov -o <profile>"}}}}` → threshold 80 且 python 条目原样保留。
     2. 非法配置四例（逐个写后读）：`{"coverage":{"threshold":101}}`、`{"coverage":{"threshold":"90"}}`、`{"coverage":{"foo":1}}`、`{"coverage":{"languages":{"python":{"format":"xml"}}}}`、`{"coverage":{"languages":{"python":{"format":"lcov","command":"run <tool>"}}}}` → 均抛 `WorkloomConfigError` 且错误信息含字段路径 `coverage.`（五例各一条）。
     3. 全局层拒绝：隔离 HOME 下写 `.workloom/config.json` `{"coverage":{"threshold":50}}` → `loadConfig(夹具根)` 抛错且文案含 `project-level field`（HOME 隔离使该场景可判定且不污染真实全局层）。
     4. buildFormatHints：变更文件恰 `src/a.ts` 一种内置语言 + 报告数 2 → `['lcov','lcov']`；同集合加 config `typescript: { format: 'go-coverprofile' }` → `['go','go']`（FORMAT_NORMALIZE 归一）；`src/a.ts` + `src/b.go` 两语言 → `undefined`；仅 `src/tool.rb` → `undefined`（非内置纯推断）。
     5. formatHints 回退：`computeDiffCoverage({ reports: [''], formatHints: ['lcov'], changedLines: { 'src/a.ts': [{ start: 1, end: 1 }] } })` → `result.format === 'lcov'`（unsupported 内容回退 hint）；同输入去 hints → `format === 'unsupported'` 且 `files` 为空。
     6. 脚本 `--check`：夹具仓库 10 个变更行、lcov 覆盖 9 行，config `{"coverage":{"threshold":80}}` → 以子进程运行 `HOME=<隔离> node packages/core/resources/scripts/task-diff-coverage.mjs <root> - <lcov> --check` → 输出含 `Threshold: 80%` 与 `Pass: yes`；config 改 90 → 输出 `Threshold: 90%` 与 `Pass: no`（9/10 恰等阈值不达标）。
     7. scan-packages 检测：`mktemp -d` 目录放 `package.json`、`src/a.ts`、`src/b.go` → 以子进程运行 `node packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs <dir>` → stdout JSON 中对应条目的 `languages` 为 `['go','typescript']`（排序去重）。
  2. 提议引用核对：`grep -n 'Propose coverage defaults' 与 'workloom-config-edit' packages/core/resources/skills/workloom-packages-scan/SKILL.md`，输出并入探针日志。
- Expected:
  1. 步骤 1.1 两例解析值一致；步骤 1.2 五例错误字段路径均为 `coverage.` 前缀；步骤 1.3 文案含 `project-level field`。
  2. 步骤 1.4 三个判定逐项一致（广播、归一、undefined）；步骤 1.5 回退与 unsupported 两态成立。
  3. 步骤 1.6 两档阈值输出与 pass/fail 标记对应；步骤 1.7 语言栈恰为 `['go','typescript']`。
  4. 步骤 2 两处引用均可定位。
- Evidence:
  - `case-evidence/c5-config-driven-probe.log`
- Cleanup: 探针在 `finally` 删除夹具根、隔离 HOME 与扫描目录。

### C6 合并一致性

- Covers: `AC5`
- Preconditions:
  1. C5 通过；主检出工作区除任务簿记外干净。
- Steps:
  1. 单源核对（批量执行，输出存 `case-evidence/c6-merge-consistency.log`）：
     1. `grep -rn "DEFAULT_THRESHOLD" packages/core/src packages/core/resources/scripts packages/dsh-workloom/src`：定义恰一行（`packages/core/src/workspace/config-defaults.ts:14` 的 `export const DEFAULT_THRESHOLD = 90`），其余命中全部为 import 或符号引用；`grep -rnE "total \* 90|90 \* total" 同范围` 无命中（阈值无第二处字面量）。
     2. `grep -rn "EXTENSION_LANGUAGE" packages/core/src packages/core/resources`：定义恰一处（`coverage-compute.ts:28`），消费方为派生与 import；`grep -rn "'\.go':" packages/core/src packages/core/resources/scripts` 恰 EXTENSION_LANGUAGE 表内命中（无平行映射表）。
  2. 90% 文案 ripple 核对：`grep -n 'default \${DEFAULT_THRESHOLD}%' packages/core/src/task/case-gates.ts` 恰两处（L451、L454）；`grep -n "default 90%" packages/core/resources/workflow/workflow.md` 恰两处（2.3 采集句与合格状态句）；`grep -n "default 90" .workloom/spec/repo/workflow/index.md` 恰两处（incremental-coverage 写 `default 90%`、coverage-config 写 `default 90,`，同一「可配 + 默认 90」口径）——三处消费方全部为「可配 + 默认 90」口径。
  3. S2 残留核对：`grep -n "caseTemplates\|CASE_TEMPLATE_FILES\|RESOURCES_REPO_PREFIX" packages/dsh-workloom/src/dispatch/executor-injection.ts` 与 `grep -n "caseTemplates" packages/core/src/injection/prompt-compose.ts` 输出均为空。
  4. workflow 版本与 spec 条目核对：`git diff 4b5454f..HEAD -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'` 为空（四件合并全程未升协议版本）；`grep -c "incremental-coverage\|pointer-injection\|config-edit-skill\|coverage-config" .workloom/spec/repo/workflow/index.md` 四个条目各恰一行。
- Expected:
  1. 步骤 1 两项单源核对成立（定义唯一、无字面量散落、无平行映射）。
  2. 步骤 2 三处 ripple 计数恰为 2/2/2；步骤 3 两组残留均为空；步骤 4 version 无增删、四条目各一行。
- Evidence:
  - `case-evidence/c6-merge-consistency.log`
- Cleanup: none。

### C7 标准验证全表与双轨自身证据

- Covers: `AC5`
- Preconditions:
  1. C1 至 C6 通过；全部发现已处置（本 CASE 预期零代码改动；任何修复后 C1 至 C7 全量重跑）。
  2. 命令在主检出根执行，build 先行。
  3. 设计轮上报的 `git-query.ts` maxBuffer 缺陷已由主会话修复并合入（`2c63069`，`GIT_DIFF_MAX_BUFFER` 32MB，dist 同 commit 重建，286 文件提取实测通过）：执行轮开始前以 `git merge-base --is-ancestor 2c63069 HEAD` 核对（退出码 0），轨道二 Aggregate command 不再有缓冲上限风险。
- Steps:
  1. `pnpm -r build`，输出存 `case-evidence/c7-build.log`。
  2. `pnpm -r typecheck`，输出存 `case-evidence/c7-typecheck.log`。
  3. `pnpm lint`，输出存 `case-evidence/c7-lint.log`。
  4. `cd packages/core && pnpm test`，输出存 `case-evidence/c7-core-tests.log`（含 dist-mirror、dist-dts、contract-asset、case-templates 守卫用例）。
  5. `cd packages/dsh-workloom && pnpm test`，输出存 `case-evidence/c7-dsh-tests.log`（含 dist-mirror 守卫用例）。
  6. dist 与 src 同 commit 的 git 侧核对：`git status --porcelain packages/core/dist packages/dsh-workloom/dist` 输出存 `case-evidence/c7-dist-status.log`——四子任务的 dist 已随各自 feature 提交入库，执行轮重建后应为空输出（重建字节一致即镜像同步；非空属发现，按 P1 上报）。
  7. 双轨覆盖率采集：执行 Coverage 节 Aggregate command（两条 `node --test --experimental-test-coverage` 运行 + 轨道二脚本 + 指纹），产物落 `<task>/coverage/` 与 `case-evidence/`。
  8. 轨道二核对：`coverage/diff-coverage.json` 的 `format` 为 `lcov`；`overall` 满足 `covered * 100 > total * 90`；`missingExecutableFiles` 为 `[]`；脚本 stdout 含 `Threshold: 90%` 与 `Pass: yes`（`--check` 消费项目缺省配置）；单文件交叉核对：取 `changed-lines.json` 中 `packages/core/src/task/coverage-compute.ts` 的区间对照 `coverage/lcov-core.info` 的 `SF:` 段逐行统计 hits 手算 covered/total，与 `diff-coverage.json` 该文件的值比对，写入 `case-evidence/c7-cross-check.md`。
  9. 轨道一旧门禁口径核对：执行轮采集 `git status --porcelain`，其非 `.workloom/` 前缀的未提交/未跟踪文件集合必须全部被 CASE Exclusions 命中（设计时为 `research/` 下五个 md）；出现声明外的非 `.workloom/` 未提交文件时停止执行，按 P1 上报主会话（旧门禁 `coverage_files` 会拒，需主会话处置后再续）。
  10. 变更集审计：`git status --porcelain` 与 `git diff --name-only 4b5454f...HEAD` 输出存 `case-evidence/c7-change-set.log`；对 `4b5454f...HEAD` 减去 Exclusions 命中项后的每个文件逐项核对——每个非排除变更文件须可归属：容器某 SR 的 Target、容器聚合命令引用的资源脚本，或某个已归档子任务 case.md 覆盖文本内的文件（容器只验合并接缝，不重审子任务内部逐文件，见 Out of scope；机械核对脚本扫容器 case.md 与四个子任务 case.md 文本）；执行轮工作区新增文件仅限 `<task>/` 下的 case/RESULT/证据与 coverage 产物。
  11. 指纹：`node packages/core/resources/scripts/task-fingerprint.mjs "$MAIN" | tee case-evidence/c7-fingerprint.txt`（在最后一次变更之后执行），输出形如 `codeFingerprint=<64 位十六进制>`，供 RESULT 的 `codeBaseline` 记录。
- Expected:
  1. 步骤 1 至 5 退出码均为 0；lint 无 error 与 warning；两包测试 0 fail 且守卫用例全部通过。
  2. 步骤 6 输出为空（dist 与 src 同 commit）。
  3. 步骤 8 五项核对全部成立（轨道二严格大于 90%；手算差异为 0）。
  4. 步骤 9 集合恰被 Exclusions 覆盖；步骤 10 变更集逐项有归属，无未解释文件。
  5. 步骤 11 得到 64 位十六进制指纹。
- Evidence:
  - `case-evidence/c7-build.log`
  - `case-evidence/c7-typecheck.log`
  - `case-evidence/c7-lint.log`
  - `case-evidence/c7-core-tests.log`
  - `case-evidence/c7-dsh-tests.log`
  - `case-evidence/c7-dist-status.log`
  - `case-evidence/c7-core-coverage-run.log`
  - `case-evidence/c7-dsh-coverage-run.log`
  - `case-evidence/c7-diff-coverage-stdout.txt`
  - `case-evidence/c7-cross-check.md`
  - `case-evidence/c7-change-set.log`
  - `case-evidence/c7-fingerprint.txt`
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`
- Cleanup: none（证据保留在任务目录）。

## Coverage

- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 `lcov` reporter；增量交集用合并后的 `packages/core/resources/scripts/task-diff-coverage.mjs`（经 core dist 的 `task/coverage-compute.js` 单一计算源；`--check` 读项目配置阈值，缺省 90）。
- Instrumentation: 双轨并行，两轨共用同一份原生报告，都以 `pnpm -r build` 先行为前提。
  1. 轨道一（门禁轨，旧格式）：运行中的插件是旧版本，本任务 RESULT 的 Coverage 节按旧口径过旧门禁——`Status: generated`，Changed Files 表为空（旧门禁按主检出工作区未提交集合核对文件集，容器无 worktree，非 `.workloom/` 未提交项仅 `research/` 下无关未跟踪文件，已在 Exclusions 排除，期望集合为空），`Overall lines` 填轨道二实值（旧门禁只校验 Overall 形态、文件集合、Exclusions 两处一致与原始报告存在，不复算数字）。真实增量口径由轨道二承载，两轨分工见 Execution Notes 第 1 条。
  2. 轨道二（证据轨，新口径）：用合并后的脚本对 `4b5454f...HEAD`（四子任务合并变更集，三点口径，未跟踪文件天然不入）与双包 lcov 报告求交集，产出 `coverage/changed-lines.json` 与 `coverage/diff-coverage.json`；`overall` 须严格大于 90%（主检出 `.workloom/config.json` 无 coverage 字段，缺省 90）；`--check` 输出 `Threshold: 90%` 与 `Pass: yes` 标记。
  3. 两包测试都从主检出根目录以 coverage 模式运行（glob 形式与 core package.json test 脚本同形），lcov 的 `SF:` 路径即 repo 相对路径，直接匹配 diff 路径；dsh 测试经 `@workloom-ai/core` 加载 core dist，dist 文件同样进入报告，但 dist 在 Exclusions 中，两轨都不计入。
  4. 脚本与探针一律经 env `HOME` 隔离空目录（本机 `~/.workloom/config.json` 存在，保证 loadConfig 全局层恒空、判定确定）；项目层配置为主检出真实文件（无 coverage 字段）。
- Aggregate command:
  ```bash
  MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
  TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts"
  mkdir -p "$TASK/coverage" "$TASK/case-evidence" "$TASK/case-evidence/home"
  cd "$MAIN"
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c7-core-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-core.info" \
    'packages/core/test/*.test.ts' \
    'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' \
    'packages/core/resources/scripts/*.test.mjs'
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c7-dsh-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-dsh.info" \
    'packages/dsh-workloom/test/*.test.ts'
  HOME="$TASK/case-evidence/home" node packages/core/resources/scripts/task-diff-coverage.mjs "$MAIN" 4b5454f \
    "$TASK/coverage/lcov-core.info" "$TASK/coverage/lcov-dsh.info" \
    --exclude 'packages/core/dist/' --exclude 'packages/dsh-workloom/dist/' \
    --exclude 'packages/core/test/' --exclude 'packages/dsh-workloom/test/' \
    --exclude 'packages/core/resources/scripts/task-diff-coverage.test.mjs' \
    --exclude 'packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts' \
    --exclude 'research/' --exclude '.workloom/' \
    --out-dir "$TASK/coverage" --check | tee "$TASK/case-evidence/c7-diff-coverage-stdout.txt"
  node packages/core/resources/scripts/task-fingerprint.mjs "$MAIN" | tee "$TASK/case-evidence/c7-fingerprint.txt"
  ```
- Scope: `4b5454f...HEAD` 的可执行变更文件集合（轨道二口径）——`packages/core/src/` 下 22 个变更文件（injection/prompt-compose.ts、prompt-sections.ts、surface.ts、index.ts、resources-manifest.ts、task/case-gates.ts、case-scope.ts、case-structure.ts、coverage-compute.ts、state/guards.ts、state/migrate.ts、storage/records.ts、task-ops.ts、workspace/case-templates.ts、config-defaults.ts、config-load.ts、doctor-check-rules.ts、doctor-checks.ts、doctor.ts、doctor-types.ts、git-query.ts，另 workspace/config.d.ts 为类型锚点、`.d.ts` 非可执行自动不计）与 `packages/dsh-workloom/src/` 4 个（discipline-text.ts、executor-injection.ts、tooling/commands.ts、tooling/tasks.ts），加两个资源脚本 `packages/core/resources/scripts/task-diff-coverage.mjs` 与 `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs`（由聚合命令三个 glob 的测试运行覆盖）。实际集合以 C7 步骤 10 的变更集审计为准；多出的非排除可执行文件须有 SR 目标，否则属 CASE 缺项，交主会话修订 CASE 后重跑。
- Exclusions:
  - packages/core/dist/: 构建产物，镜像 src；C7 步骤 4 dist-mirror 守卫与步骤 6 git 状态验同 commit 同步
  - packages/dsh-workloom/dist/: 构建产物，镜像 src；C7 步骤 5 dist-mirror 守卫与步骤 6 git 状态验同 commit 同步
  - packages/core/test/: 四子任务合并的测试夹具与门禁/交集/注入/config 用例自身；C2 至 C5 与 C7 验全绿
  - packages/dsh-workloom/test/: dsh schema/注册/注入钉住用例自身；C3 步骤 6 与 C7 验全绿
  - packages/core/resources/scripts/task-diff-coverage.test.mjs: 脚本单测自身；C5 与 C7 验全绿（脚本本体留 scope 内，由该单测运行覆盖）
  - packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts: 扫描单测自身；C5 步骤 1.7 与 C7 验全绿（scan-packages.mjs 本体留 scope 内，由该单测运行覆盖）
  - research/: 无关未跟踪研究材料（minimax 调研笔记，先于本任务存在、不在四子任务变更集内）；旧门禁按工作区未提交集合核对文件集，须排除该目录使期望集合为空；三点口径本不含未跟踪文件，对轨道二为冗余保险
  - .workloom/: 任务簿记与各子任务 chore 提交的任务文档，非代码；C1 只读归档态核对
  Pattern semantics: a trailing `/` prefix-matches a whole directory subtree, an exact path without globs matches one file, a single `*` is anchored within its own path segment (never crosses `/`), and a `**` segment crosses directory levels (zero or more levels mid-pattern, any remaining path at the tail).
- Raw outputs:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1、SR2 | C1、C2、C7 |
| AC2 | SR5、SR6、SR7、SR8、SR9 | C1、C3、C7 |
| AC3 | SR4、SR10、SR12、SR13 | C1、C4 |
| AC4 | SR1、SR2、SR3、SR4、SR11、SR12 | C1、C2、C5、C7 |
| AC5 | SR1、SR2、SR5 | C2、C3、C5、C6、C7 |

## Execution Notes

1. 双轨分工与 RESULT 填写口径：运行中插件仍旧版，本任务 check 时门禁按旧口径执行。旧门禁的 Changed Files 文件集取自主检出工作区未提交集合（`gitChangedFilesSync`），容器无 worktree 且四子任务变更已全部提交，该集合只剩 `.workloom/` 簿记与 `research/` 未跟踪文件——后者经 Exclusions 排除后期望集合为空，故 RESULT 的 Changed Files 表为空表；`Overall lines` 填轨道二实值（`covered/total (pct%)` 形态满足旧门禁正则，数值为 `4b5454f...HEAD` 增量真实值）；Raw reports 列双份 lcov 与两份交集产物（旧门禁仅计数 `coverage/...` 引用）。轨道二产出机器可读的 `coverage/diff-coverage.json`，其 `overall` 严格大于 90% 是本 CASE 的通过条件之一（C7 步骤 8）。
2. RESULT 的 `checkSession` 取 execution 轮 checker 派发的 childId（与容器 task.json 已记录的 case-design 派发同 designSession 续接）；`codeBaseline` 记 `main@<HEAD sha>; codeFingerprint=<C7 步骤 11 的 64-hex>`。旧门禁不复算指纹，该值按新口径纪律记录，供部署后复核。
3. 探针 HOME 隔离：本机 `~/.workloom/config.json` 存在（含 subagent_profiles），所有触发 `loadConfig` 的探针（C2 门禁与 checkTask、C5 配置解析与脚本）一律在 `HOME=<mktemp 空目录>` 下运行；C5 步骤 1.3 的全局层拒绝场景利用隔离 HOME 写入伪造全局配置完成判定，不触碰真实全局层。
4. C2 与 C5 的 CASE/RESULT 夹具按子任务单测夹具（`packages/core/test/case.test.ts`）最小合法形态构造，先以基线场景（问题列表为空）证明夹具合法，再跑变体场景；探针可参照 S1 任务 `case-evidence/probes/c2-gate-threshold-probe.mjs` 与 `c4-waiver-chain-probe.mjs` 的构造方式（同仓库已归档资产）。
5. 部署验收不在本 CASE：容器归档后主会话按 repo/deployment 走 profile 重钉与用户授权重启；部署后已有项目重跑 `workloom init` 刷新 CASE 模板副本（S2 doctor 第六检查兜底），下一个任务的增量门禁与纯指针注入自然生效。AC5 的「dist 与 src 同 commit」已由 C7 步骤 6 以 git 状态核对（重建后无差异即同步）。
6. 本 CASE 预期零代码改动（容器只编排不实现）：代码缺陷不分级别一律写入 RESULT 的 Open issues 上报主会话（P0/P1 阻塞归档，P2 一并上报不在执行轮修复，避免合并基线漂移）；仅 CASE 文档自身缺项可由 checker 修订，修订后 SR 与全部 C 项重跑、指纹重算。
7. C 项任何一步失败即停止后续 C 项（阻塞传导）；`research/` 出现声明外的非 `.workloom/` 未提交文件时按 C7 步骤 9 的处置路径停止并上报。
8. 设计轮发现（P1，已修复：主会话提交 `2c63069`）：`packages/core/src/workspace/git-query.ts` 的 `runGitDiffSync` 原未设 `maxBuffer`，`execFileSync` 默认上限 1MB；容器合并 diff `4b5454f...HEAD` 经 `--unified=0` 约 5.3MB（排除 dist 仍约 4.8MB），`gitDiffChangedLines` 确定性返回 ENOBUFS 错误、轨道二脚本以非零码退出。设计轮以只读试运行命令（脚本对 `4b5454f` 求交集，未写任何产物）实测复现并上报。主会话已落地修复：`2c63069` 补 `GIT_DIFF_MAX_BUFFER`（32MB）于 `runGitDiffSync` 的 `execFileSync` 选项，一处覆盖门禁与脚本两条取数链路，dist 同 commit 重建，286 文件变更行提取实测通过。该修复只改 git-query.ts 及其 dist 镜像，本 CASE 无 SR 目标该文件；C7 前置条件第 3 条按 `git merge-base --is-ancestor 2c63069 HEAD` 核对修复在位。
