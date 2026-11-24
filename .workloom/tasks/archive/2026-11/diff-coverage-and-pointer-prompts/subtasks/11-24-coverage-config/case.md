---
version: 1
task: tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config
---

<!-- checker-discipline: how the Checker authors and revises this CASE; re-read before writing or changing any section
- SR/C writing: one entry covers one cohesive slice of one file — Target names a single file path (`<file>#<symbol>` or the whole file), every Check is a decidable yes/no structure, type, naming, behavior, or spec conformance check, and Expected states a decidable code property, never a restatement of requirement intent.
- Traceability: every AC in prd.md is covered by at least one SR or one C row in the Traceability table; an uncovered AC is a CASE defect, and Coverage Exclusions only relax statistics, never the AC mapping.
- Evidence integrity: Evidence cites real observed anchors as `<file>:<line>` instead of restating the Expected text; probe scripts live in `case-evidence/probes/` with only pointers in prose; compute `codeFingerprint` for C5 with the core package's package-relative script `scripts/task-fingerprint.mjs` (under `resources/`, never a repo-absolute path) and record the 64-hex value in the result's codeBaseline.
- Result discipline: the Standard Verification exit-code cell is bare `0`; both cells of every Exclusions row are backtick-wrapped; Overall coverage lines use the `covered/total (pct%)` form only; the last section of the result is `## Open issues` and its body is exactly `- none` when clean.
-->

# CASE: 覆盖率工具配置驱动与内置默认

## References

- PRD: `prd.md`
- Implementation: `plan.md`（9 个实施步骤；行号锚点以代码基线 `main`@`826501d` 为准，终态以 worktree 实际变更为准）
- Code target: worktree `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-coverage-config`（分支 `workloom/11-24-coverage-config`，base `main`，基线提交 `826501d`）。下文 `<WT>` 指该 worktree 的绝对路径；`<task>` 指主检出侧任务目录 `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config`（本文件所在目录，不是 worktree 副本）；相对路径以 `<WT>` 为根。
- Source task: none（容器任务 `tasks/11-24-diff-coverage-and-pointer-prompts` 的 S4，前置 S1/S3 已合入 main）

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7、R8
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5、AC6
- Out of scope:
  - S1 增量口径/缺席硬拒/豁免链路语义不改（本任务只参数化阈值与格式来源）；task-ops/records/guards/migrate/surface/dsh 侧文件均不在变更集（plan 无涉）。
  - S2 注入不改；全局层 config 字段治理归 `workloom-migrate-to-sop`（本任务只在全局层拒绝 `coverage`）。
  - 生产 DSH 实例操作：不重启实例、不执行 `dsh-stop`/`dsh-start`、不改 profile 与 pnpm-lock、不 push；运行中插件是旧版本，CASE 执行轮的派发注入走旧链路，新配置驱动行为只经本 CASE 的函数级探针与单测验证，生产集成 CASE 验收归任务收尾（PRD Notes）。
  - 代码提交：CASE 执行轮零 commit；`dist/` 与 src 的同 commit 由主会话在 2.4 落实，本 CASE 只验 dist 镜像守卫与变更集。
  - `packages/core/src/task/task-ops.ts` 既有 1289 行超限属任务前状态（S1 已记录），本任务不改该文件，不把行数超限列为本任务发现项。
  - 探针、夹具与临时仓库只建在 `mktemp -d` 的临时目录并自清理；证据只写 `<task>`（`case-result.md`、`case-evidence/`、`coverage/`）；worktree 内不新建 `case-evidence/`；开发者如在工作区根留下自测 `coverage/`，执行轮不写入、不提交，列入 Exclusions。

## Static Review

### SR1 config 类型面 config.d.ts

- Covers: `AC1`
- Target: `packages/core/src/workspace/config.d.ts#whole-file`
- Checks:
  1. 新增导出类型 `CoverageFormatLiteral`，值域恰为 `'go-coverprofile' | 'lcov' | 'jacoco-xml' | 'cobertura-xml'`（四枚举，逐字判定）。
  2. 新增导出接口 `CoverageConfig`：`{ threshold: number; languages: Record<string, { format: CoverageFormatLiteral; command?: string }> }`（运行时合并后形态，两字段必填；磁盘层可选语义由 config-load 解析承担）。
  3. `WorkloomConfig` 新增必填字段 `coverage: CoverageConfig`（基线 L2-32 既有字段与导出签名逐字不变）；字段带中文 JSDoc，说明项目层语义与全局层禁用。
  4. 本文件是 `copy-domain-dts` 锚点：dist 副本与 src 字节相等由 `test/dist-dts.test.ts` 断言（C5 步骤 4 覆盖，不在本 SR 重复验证）。
- Expected: 类型面可逐字判定；`pnpm -r typecheck` 对本文件无新错误；既有导出不动。

### SR2 config 默认值与校验器 config-defaults

- Covers: `AC1、AC2`
- Target: `packages/core/src/workspace/config-defaults.ts#whole-file`
- Checks:
  1. 新增导出常量 `DEFAULT_THRESHOLD = 90`（阈值单源；`parseCoverage`、`meetsThreshold` 缺省与文案统一引用，本包 src 内新增代码不以裸 `90` 散落阈值语义）。
  2. `DEFAULT_CONFIG` 新增 `coverage: { threshold: DEFAULT_THRESHOLD, languages: {} }`；其余字段逐字不变。
  3. 新增导出 `parseCoverage(value)`：返回 `WorkloomConfig['coverage']`；`threshold` 必须是 0–100 整数（校验失败文案为 threshold 专用语义，不复用 `requireNonNegativeInt` 的 "0 means unlimited" 文案）；`languages` 为对象映射，每条目 `format` 必须是 `CoverageFormatLiteral` 四枚举之一，`command` 可选字符串并做占位符白名单校验；子字段白名单外键（如 `coverage.foo`、`coverage.languages.<lang>.tool`）出现即抛 `WorkloomConfigError`，`field` 为对应路径（`coverage.threshold`、`coverage.languages.<lang>.format` 等）。
  4. 新增导出 `COVERAGE_PLACEHOLDER_TOKENS`（封闭白名单恰为 `<worktree>`、`<profile>`、`<base-ref>` 三 token）与 `renderCoverageCommand(command, values)` 渲染函数：白名单内 token 替换为实际值，白名单外 `<…>` 抛 `WorkloomConfigError`（`assertPlaceholders` 同语义复用或内部实现）。
  5. `SETUP_PLACEHOLDER_TOKENS` 与 `renderSetupCommand` 既有行为逐字不变；新增代码有中文注释；占位符串与枚举值全部走常量（无 magic string）。
- Expected: 合法/非法配置解析逐项可判定；错误文案与字段路径可逐条定位；既有 setup 渲染回归不破。

### SR3 config 三层合并 config-load

- Covers: `AC1`
- Target: `packages/core/src/workspace/config-load.ts#mergeWithDefaults`
- Checks:
  1. `mergeWithDefaults`（基线 L311-394）新增 `doc.coverage` 分支：缺省保持 `DEFAULT_CONFIG.coverage`；出现时经 `parseCoverage` 校验后整体替换（对象层顶层 key 覆盖语义，与 `packages` 分支同形）。
  2. `GLOBAL_PROJECT_ONLY_FIELDS`（基线 L58）加入 `'coverage'`：全局层出现 `coverage` 报项目字段专属错误（沿用既有文案形态 `project-only field`）。
  3. 全局白名单 `GLOBAL_ALLOWED_TOP_FIELDS` 不加 `coverage`（coverage 只在项目/local 层合法）。
  4. 其余字段分支、`loadConfig` 签名（含 `homeDir` 选项）、`subagentProfilesSource` 挂载逻辑逐字不变。
- Expected: 三层解析行为可判定；全局层 `coverage` 被拒且错误文案可定位；既有 config 用例全绿。

### SR4 计算源扩展 coverage-compute

- Covers: `AC1、AC2`
- Target: `packages/core/src/task/coverage-compute.ts#whole-file`
- Checks:
  1. `CoverageFormat`（基线 L59）加 `'cobertura-xml'`，值域恰为 `go | lcov | jacoco-xml | cobertura-xml | mixed | unsupported` 六成员。
  2. 新增导出 `parseCoberturaXml(text, diffFiles?)`：解析 `<coverage><packages><package><classes><class filename="…"><lines><line number hits>` 结构；根 `<coverage>` 缺失或文本损坏返回 `[err, null]`；`class` 的 `filename` 经路径归一与双向后缀匹配（复用 `resolveReportPath` 同语义，多候选歧义 err）；`line` 的 `hits > 0` 为 covered；同一文件多个 class 的行覆盖取并。
  3. `inferFormat`（基线 L112）新增规则：文本同时含 `<coverage` 根元素与 `<lines>` 元素 → `'cobertura-xml'`（与 jacoco 的 `<report` 根区分）；既有 go/lcov/jacoco 三规则逐字不变。
  4. `parseReport`（基线 L267）加 `cobertura-xml` 分支；`computeDiffCoverage` 的逐报告格式解析改为：`inferFormat` 命中即用（内容优先，含冲突场景以内容为准），仅当该报告推断为 `unsupported` 时回退 `formatHints[i]`；`combineFormats` 合并语义逐字不变（任一 `unsupported` → `unsupported`）。
  5. `ComputeDiffCoverageInput`（基线 L93-99）新增可选字段 `formatHints?: CoverageFormat[]`（与 `reports` 同序）；其余入参不变。
  6. `meetsThreshold`（基线 L102）改为 `meetsThreshold(covered, total, threshold = DEFAULT_THRESHOLD)`：第三参缺省引用 `DEFAULT_THRESHOLD`（`import { DEFAULT_THRESHOLD } from '../workspace/config-defaults.ts'`），实现为整数交叉乘 `covered * 100 > total * threshold`。
  7. 新增导出 `LANGUAGE_DEFAULTS`：恰含 `go`、`typescript`、`javascript`、`python`、`rust`、`c`、`cpp`、`java`、`kotlin` 九语言键（PRD 表述"8 语言"按 ts/js、命令清单分组计数，映射按九键逐键判定，见 Execution Notes 1）；`format` 映射逐键判定——`go` → `go-coverprofile`，`typescript`/`javascript`/`python`/`rust`/`c`/`cpp` → `lcov`，`java`/`kotlin` → `jacoco-xml`；每键 `command` 为非空骨架串（内容对齐 plan 步骤 3 清单，抽查 `go` 含 `go test` 与 `<profile>`、`java` 含 `gradle`），串内占位符均在 `COVERAGE_PLACEHOLDER_TOKENS` 白名单内。
  8. 新增导出 `EXTENSION_LANGUAGE`（扩展名 → 语言单源映射）与 `detectLanguage(file)`（未命中返回 `null`，`.d.ts` 结尾返回 `null`）：映射恰为 `.go`→go、`.ts`/`.tsx`→typescript、`.js`/`.jsx`/`.mjs`/`.cjs`→javascript、`.py`→python、`.rs`→rust、`.c`/`.h`→c、`.cpp`/`.cc`/`.cxx`/`.hpp`/`.hxx`→cpp、`.java`→java、`.kt`/`.kts`→kotlin（20 后缀）；`EXECUTABLE_EXTENSIONS` 由 `EXTENSION_LANGUAGE` 键派生或以一致性测试钉死两集合相等，成员与基线 L26-29 逐字相同。
  9. 新增导出 `FORMAT_NORMALIZE`：磁盘枚举 → `CoverageFormat`（`go-coverprofile` → `go`，`lcov`/`jacoco-xml`/`cobertura-xml` 同名）。
  10. 模块仍无写文件副作用；只 import `node:fs`/`node:path`、`../workspace/git-query.ts`、`../workspace/config-defaults.ts`、`./case-structure.ts` 与类型导入；文件不超过 600 行；无 `@ts-ignore`/`@ts-expect-error`；中文注释。
- Expected: cobertura 夹具复算、格式提示优先级（内容优先/unsupported 回退）、阈值参数化边界（含自定义 80）、扩展名语言检测可逐值判定；既有 go/lcov/jacoco 三格式行为与既有导出签名不变。

### SR5 门禁消费配置 case-gates

- Covers: `AC2、AC3`
- Target: `packages/core/src/task/case-gates.ts#evaluateCaseOutcomeGate`
- Checks:
  1. 门禁经 `loadConfig(worktreeDirectory(root, task))` 读取 worktree 分支配置（`loadConfig` 自 `../workspace/config-load.ts` 导入；worktree_path 为空时即项目根，语义与 case-scope L30-34 一致）。
  2. `ISSUE_CODES` 新增 `COVERAGE_CONFIG: 'coverage_config'`；`loadConfig` 抛错时追加该 issue（core failure），不抛裸异常、不静默放行，其余问题继续汇总；配置合法但缺 `coverage` 键时经 `mergeWithDefaults` 兜底默认值（门禁无需特判分支）。
  3. `meetsThreshold` 调用（基线 L429）改为传入 `config.coverage.threshold`；`thresholdBasis` 机械/自报双路径区分与豁免链路（L436-441）语义不变。
  4. 基线 L431/434 两条 issue 文案改为含实际阈值插值（如 `configured threshold ${threshold}% (default 90%)` 形态）：文案同时可定位 `configured threshold` 与阈值数字；`90` 数字来自 `DEFAULT_THRESHOLD` 或插值，不以裸字面量重复定义。
  5. `computeDiffCoverage` 调用新增 `formatHints` 构造（钉死规则）：变更文件（`changedLines` 键集）经 `detectLanguage` 归类，恰命中一种语言时 `formatHints = reports.map(() => FORMAT_NORMALIZE(config.languages[lang]?.format ?? LANGUAGE_DEFAULTS[lang].format))`（单格式广播）；多语言或全部未命中时 `formatHints` 为 `undefined`（纯内容推断）；`root`/`changedLines`/`reports`/`exclusions` 四个既有入参不变。
  6. 其余问题码集合只增 `coverage_config`；SR/C 集合校验、会话链、not_applicable/缺席/复算各分支不改语义；文件不超过 600 行；issue code 字面量单源；中文注释。
- Expected: `threshold: 80` 时 80.0% 拒、80.1% 过；config 非法 → `coverage_config`；单语言任务 formatHints 生效、多语言纯推断；缺省配置下 S1 既有边界（90.0% 拒/90.1% 过）保持。

### SR6 workflow 2.3 文案同步

- Covers: `AC2`
- Target: `packages/core/resources/workflow/workflow.md#2.3-check`
- Checks:
  1. 基线 L97 采集句与 L113 合格状态句中的硬编码 `90%` 表述改为"配置阈值默认 90%"语义：两句新文案均含 `configured threshold` 与 `default 90%` 字样（具体措辞 Developer 定，与 contract-asset pin 同步钉住）。
  2. front-matter `version` 不升；`states` 列表与 `####` 步骤集合及顺序不变（`git diff main -- packages/core/resources/workflow/workflow.md` 不出现 `version:` 行增删）。
  3. 文本为英文；既有其余句子不改。
- Expected: 两处新文案 grep 可定位；`asset-version-bump` 纪律满足（guidance 文本变更不升版本）；contract-asset 与 workflow-contract 钉住用例同步变绿。

### SR7 采集脚本消费配置 task-diff-coverage

- Covers: `AC2`
- Target: `packages/core/resources/scripts/task-diff-coverage.mjs#whole-file`
- Checks:
  1. import 新增 `loadConfig`（`../../dist/workspace/config-load.js`）与 `meetsThreshold`/`FORMAT_NORMALIZE`/`detectLanguage`/`LANGUAGE_DEFAULTS`（`../../dist/task/coverage-compute.js`）；仍不 import `src/`，既有 `computeDiffCoverage`/`gitDiffChangedLines` import 不变。
  2. `main` 经 `loadConfig(root)` 读配置（config 非法原样抛错并以非零码退出）；`formatHints` 构造同 SR5 第 5 条规则（单语言广播 `config.languages[lang]?.format ?? LANGUAGE_DEFAULTS[lang].format`，多语言/无命中 `undefined`）传入 `computeDiffCoverage`。
  3. 新增 `--check` 标志：按 `config.coverage.threshold` 对交集 `overall` 调 `meetsThreshold` 并输出机器可判定的 pass/fail 判定（判定内容含 pass/fail 极性与配置阈值）；无 `--check` 时不做阈值判定，JSON/markdown 输出形态与基线一致。
  4. 位置参数、`--json`、`--out-dir`、`--exclude` 既有行为逐字不变；usage 文案更新含 `--check`；文案英文、注释中文；入口守卫（`pathToFileURL` 比对）与具名导出 `main` 保持。
- Expected: 同一夹具经 CLI 与直调 `computeDiffCoverage` 结果一致；`--check` 判定极性随配置阈值翻转（80.0% fail / 80.1% pass）；缺省不判定。

### SR8 包扫描语言检测 scan-packages

- Covers: `AC4`
- Target: `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs#whole-file`
- Checks:
  1. 语言检测与 core 单源：经 `createRequire(import.meta.url)` 上溯四级引 core dist 的 `detectLanguage`/`EXTENSION_LANGUAGE`（`migrate-config.mjs` 先例，dist 不可达时 fail loud 给 `pnpm -r build` 指引），或不引 core 但以一致性测试钉死脚本内映射与 `EXTENSION_LANGUAGE` 相等——二选一，不得出现无约束的第二映射。
  2. `scanPackages` 返回值或 CLI stdout JSON（形态 Developer 定，须与 SKILL.md 步骤 1 文本同步）新增语言栈信息：夹具目录含 `a.go`/`b.ts`/`c.java` 与 `readme.md` 时恰含 `go`/`typescript`/`java` 三语言（集合语义：去重、不含未出现语言、`.md` 不入）；纯文档目录结果为空集。
  3. 既有 packages 候选输出、检测规则、排除目录与 `repo` 根条目行为不变（既有单测回归全绿）。
  4. 中文注释；英文运行时文案。
- Expected: 语言检测单测可判定（C4 探针复算）；候选清单回归不变；映射单源可 grep 或一致性用例可定位。

### SR9 packages-scan SKILL 提议 coverage

- Covers: `AC4`
- Target: `packages/core/resources/skills/workloom-packages-scan/SKILL.md#whole-file`
- Checks:
  1. Workflow 新增（或并入既有步骤）coverage 提议环节：据扫描语言栈与 `LANGUAGE_DEFAULTS` 提议 `coverage.languages` 默认（format + command 骨架），经 `workloom-config-edit` skill 的修改纪律与 packages 候选一并确认写入，不绕过 config skill。
  2. 非内置语言（不在 `LANGUAGE_DEFAULTS` 的语言）标注"需手动配置 format/command"（英文表述含 manually configure 语义），不为其猜默认 format 或 command。
  3. 步骤 1 的脚本返回描述与 SR8 输出形态同步（含 languages 信息）。
  4. 基线 L59 旧引用 `scripts/scan-packages.test.js` 同步为 `scripts/scan-packages.test.ts`（全文不再出现 `scan-packages.test.js` 完整文件名）。
  5. description 与 Boundaries 联动提及 coverage 提议（Boundaries 的 config 字段限定句保持 config-edit 引用）；文本为英文；既有 setup 指引与执行规则不改。
- Expected: grep 可定位 `coverage`（步骤 + Boundaries + description 至少三处）与 `workloom-config-edit` 引用；`scan-packages.test.js` 完整文件名零命中；contract-asset 相关 pin 同步变绿。

### SR10 config-edit 字段清单同步

- Covers: `AC5`
- Target: `packages/core/resources/skills/workloom-config-edit/SKILL.md#whole-file`
- Checks:
  1. Disk field whitelist 表（基线 L23-32）新增 `coverage` 行：接受形态 `{ threshold?, languages? }`，子字段说明含 `threshold` 0–100 整数、`languages` 每语言 `{ format（四枚举 go-coverprofile/lcov/jacoco-xml/cobertura-xml）, command?（占位符 <worktree>/<profile>/<base-ref>）}`。
  2. 表标题计数句由 "The eight snake_case top-level keys" 改 "The nine snake_case top-level keys"（全文不再出现 `The eight snake_case` 完整句式）。
  3. 表后补 `coverage` 示例（JSON 片段含 `threshold` 数值与至少一个 `languages` 条目，示例经 `loadConfig` 合法）。
  4. front-matter description 的触发字段列表（基线 L3）加入 `coverage`；五步纪律、Boundaries、doctor 校验入口句不改。
  5. 文本为英文。
- Expected: 9 字段逐项在表中可定位（含既有 8 字段不删）；示例可 grep `"coverage"` 命中；contract-asset 字段遍历 pin（基线 L1163-1174 加 `coverage`）变绿。

### SR11 spec 新条目与阈值句同步

- Covers: `AC6`
- Target: `.workloom/spec/repo/workflow/index.md#whole-file`
- Checks:
  1. 新增一条 `- coverage-config: ...` 条目（英文、单行 kebab 形态）：覆盖默认 90% 可配（`threshold` 0–100 整数、严格 >）、四磁盘格式枚举与 `FORMAT_NORMALIZE` 映射、内置语言默认与扩展名检测、非内置未配置语言 unsupported 回退且阈值仍硬、`packages-scan` 提议经 config skill 写入。
  2. 既有 `incremental-coverage` 条目（基线 L9）中 "Threshold is strictly greater than 90%" 表述改为含 configured/default 语义（默认 90%、可经 `coverage.threshold` 配置）。
  3. 条目形态与同文件既有条目一致；既有条目不删不改（除第 2 条的阈值句）。
  4. 改动落在 worktree 分支上的 spec 副本（随 2.4 合入主线），不直接改主检出 spec。
- Expected: `grep -n "coverage-config"` 恰一行命中且为英文；`incremental-coverage` 条目含 configured/default 表述；spec-index 用例（若有条目形态校验）全绿。

### SR12 config.test.ts coverage 用例

- Covers: `AC1`
- Target: `packages/core/test/config.test.ts#whole-file`
- Checks:
  1. 新增 coverage 用例可定位（用例名含 `coverage` 关键词）：缺省（无 `coverage` 键 → `threshold` 90 + `languages` 空对象）；自定义 `threshold`/`languages`（含 command）逐字段回读相等；非法 `threshold`（`90.5`/`-1`/`101`/非数字）各抛 `WorkloomConfigError` 且 `field` 为 `coverage.threshold`；非法 `format`（如 `cobertura`）fail loud；未知子字段（`coverage.foo`、`languages.<lang>.extra`）fail loud；command 未知占位符 fail loud；全局层出现 `coverage` 报项目字段错误。
  2. 既有用例不删不改语义；HOME 隔离沿用 `homeDir` 注入先例（config.test.ts L44-63 形态）。
  3. 「不得包含」类断言用完整结构形式（完整字段路径或完整错误句式）。
- Expected: 各分支用例可在 C1 日志中逐条勾选；`node --test test/config.test.ts` 全绿。

### SR13 coverage-compute.test.ts 扩展用例

- Covers: `AC1、AC2`
- Target: `packages/core/test/coverage-compute.test.ts#whole-file`
- Checks:
  1. 新增 cobertura 用例：夹具复算（class `filename` + `line number/hits`，`hits>0` 覆盖）；路径归一后缀匹配（`filename` 带 `src` 前缀、diff 路径前缀更长）；根 `<coverage>` 缺失 err；`inferFormat` 区分 jacoco（`<report` 根）与 cobertura（`<coverage` 根 + `<lines>`）；cobertura + lcov 混合多报告 → `mixed` 合并。
  2. `meetsThreshold` 参数化用例：缺省 90 边界保持（`90/100` false、`91/100` true）；自定义 80（`800/1000` false、`801/1000` true）。
  3. `detectLanguage`/`EXTENSION_LANGUAGE` 一致性用例：`EXECUTABLE_EXTENSIONS` 与 `EXTENSION_LANGUAGE` 键集合相等（若实现为派生则钉住派生结果）；`.d.ts` 返回 `null`；20 后缀逐值抽样。
  4. `formatHints` 直接用例：内容 unsupported 回退 hint、内容命中时 hint 被内容覆盖（冲突以内容为准）、多报告混合。
  5. `renderCoverageCommand` 用例：白名单 token 渲染、未知占位符 err。
  6. 既有用例不删；用例名含格式/关键词便于 `--test-name-pattern` 定位。
- Expected: 每个新分支至少一个可定位用例；C2 日志中逐条勾选；全绿。

### SR14 case.test.ts 门禁配置用例

- Covers: `AC2、AC3`
- Target: `packages/core/test/case.test.ts#whole-file`
- Checks:
  1. HOME 隔离：涉及门禁（`evaluateCaseOutcomeGate` 直调）的用例经 `process.env.HOME` 指向空临时目录并在 `finally` 恢复（本机 `~/.workloom/config.json` 存在，防全局层污染），或夹具 root 写 `config.json` 后仍隔离 HOME。
  2. 新增用例可定位：config `threshold: 80` 时 `800/1000` 拒（`coverage_threshold`）与 `801/1000` 过；无 coverage 配置时 90 边界既有用例保持；config 非法（`threshold: -1`）→ issues 含 `coverage_config` 且函数正常返回；非内置扩展（如 `.elm`）变更 + unsupported 报告 → 回退自报校验且阈值硬（自报不达标拒、达标过；声明 `not_applicable` 仍含 `coverage_not_applicable`）；单语言任务 formatHints 生效（java + `cobertura-xml` 配置 + 空 cobertura 报告 → `coverage_missing_file` 出现）与多语言纯推断（同报告无 `coverage_missing_file`）。
  3. 既有用例按新行为更新（夹具补 config 或 HOME 隔离）但语义保持；`makeRoot`/`writeLcovReport`/`coverageOptions` 夹具形态可复用（基线 L237-275）。
- Expected: 每条验收路径有可定位用例；C3 日志中逐条勾选；`node --test test/case.test.ts` 全绿。

### SR15 contract-asset.test.ts 钉住更新

- Covers: `AC5、AC6`
- Target: `packages/core/test/contract-asset.test.ts#whole-file`
- Checks:
  1. config-edit 字段遍历 pin（基线 L1163-1174）加入 `coverage`（九字段逐项钉住）；新增 coverage 示例与 `nine snake_case` 句 pin。
  2. workflow 2.3 文案 pin（基线 L1146-1150）更新为新句（含 `configured threshold` 与 `default 90%`），与 SR6 新文案逐字一致；「不含」类断言用完整句式（如 `The eight snake_case` 整句零命中，不用裸子串）。
  3. packages-scan 相关 pin（基线 L1195-1210 区）随 SKILL 文本同步更新（步骤 5 config-edit 引用句与 Boundaries 句保持或同步）；新增 coverage 提议环节的引用 pin（如步骤文本含 `coverage.languages`）。
  4. 既有其余 pin 不无故删除；红绿清单覆盖 `90%` 文案消费方（case-gates 两处 issue 文案、workflow.md 两句、spec 条目、本文件 pin）。
- Expected: 文案或字段清单回退时用例变红；`node --test test/contract-asset.test.ts` 全绿。

### SR16 task-diff-coverage.test.mjs 脚本用例

- Covers: `AC2`
- Target: `packages/core/resources/scripts/task-diff-coverage.test.mjs#whole-file`
- Checks:
  1. 新增用例：`--check` 判定极性（夹具 worktree 写 `.workloom/config.json` 的 `coverage.threshold`，80% fail / 90%+ pass——极性断言）；无 `--check` 时输出无阈值判定；`formatHints` 生效（单语言 + config format 提示 → 输出 `format` 为提示格式；多语言 → unsupported/纯推断对照）；config 非法抛错非零退出。
  2. HOME 隔离：子进程用例经 env `HOME` 指向空目录，进程内用例设置/恢复 `process.env.HOME`。
  3. 既有用例（`--out-dir` 产物、`--json`、usage 错误、`--exclude`、CLI 子进程真实运行）不删不改语义；夹具 `mktemp` 目录自清理。
- Expected: 各分支用例可定位；C4 日志中逐条勾选；`node --test resources/scripts/task-diff-coverage.test.mjs` 全绿。

### SR17 scan-packages.test.ts 语言检测用例

- Covers: `AC4`
- Target: `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts#whole-file`
- Checks:
  1. 新增语言检测用例：多语言夹具（`.go`/`.ts`/`.java` 并存）恰检出三语言；去重（同语言多文件）；纯文档目录空集；未知扩展（`.elm`）不产生内置语言名。
  2. 若 SR8 采用自持映射：补一致性用例钉死脚本映射与 core `EXTENSION_LANGUAGE` 相等；若采用 import 方案：补 dist 不可达 fail loud 用例（可跳过——以实现为准，至少一项存在）。
  3. 既有用例不删；临时目录 `finally` 清理。
- Expected: 用例可定位；C4 日志中勾选；`node --test resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts` 全绿。

## Runtime Cases

时序纪律：所有运行时用例以 `pnpm -r build` 先行为前提（core 单测直跑 src TS，但全部探针与 CLI import core dist）；探针源码放 `<task>/case-evidence/probes/`、夹具放 `<task>/case-evidence/fixtures/`，临时仓库经 `mktemp -d` 创建并在 `finally` 删除；探针统一 HOME 隔离（本机 `~/.workloom/config.json` 存在）；任何代码修复之后，SR 与 C1 至 C6 全量重跑。

### C1 config 解析探针：默认、自定义、fail loud 与全局拒绝

- Covers: `AC1`
- Preconditions:
  1. 已在 `<WT>` 执行 `pnpm -r build`，`packages/core/dist/workspace/config-load.js` 存在。
  2. 探针只经 `loadConfig(root, { homeDir })` 注入隔离目录，不读写真实 `$HOME`。
- Steps:
  1. `cd <WT>/packages/core && node --test test/config.test.ts`，记录退出码与 coverage 用例名清单（定位关键词 `coverage`）。
  2. 探针 `case-evidence/probes/c1-config-coverage-probe.mjs`：import `loadConfig`（`<WT>/packages/core/dist/workspace/config-load.js`）；`mkdtemp` 建 `root` 与 `home` 空目录；逐场景打印 `[场景, 结果, err.field]`：
     1. 场景 A（默认）：root 无任何 config 文件 → `config.coverage` 为 `{ threshold: 90, languages: {} }`（逐字段断言）。
     2. 场景 B（自定义）：`root/.workloom/config.json` 写 `{"coverage":{"threshold":80,"languages":{"java":{"format":"cobertura-xml","command":"gradle test jacocoTestReport && cp build/reports/jacoco.xml <profile>"}}}}` → 回读 `threshold` 80、`languages.java.format` 为 `cobertura-xml`、command 逐字符相等。
     3. 场景 C（非法 threshold）：分别写 `90.5`/`-1`/`101`/`"90"` 四份配置，各调一次 → 四次均抛 `WorkloomConfigError`，`err.field` 为 `coverage.threshold`，文案不含 "0 means unlimited"。
     4. 场景 D（非法 format）：`languages.java.format = "cobertura"` → 抛错，`err.field` 为 `coverage.languages.java.format`。
     5. 场景 E（未知子字段）：`coverage.foo = 1` 与 `languages.java.tool = "x"` 两次 → 均抛错且 `err.field` 对应路径（unknown field 语义）。
     6. 场景 F（未知占位符）：`languages.java.command = "tool --out <unknown>"` → 抛错（unknown placeholder 语义）。
     7. 场景 G（全局拒绝）：`home/.workloom/config.json` 写 `{"coverage":{"threshold":50}}`，`loadConfig(root, { homeDir: home })` → 抛项目字段专属错误（文案含 project 语义），项目层无 coverage 时不受全局影响。
  3. 探针输出存 `case-evidence/c1-config-probe.log`。
- Expected:
  1. 步骤 1 退出码 0；coverage 用例名清单覆盖 SR12 第 1 条全部分支。
  2. 场景 A/B 与期望逐字段相等；场景 C 至 G 均抛 `WorkloomConfigError` 且 `err.field` 与路径逐项一致；场景 G 文案可定位 project-only 语义。
- Evidence:
  - `case-evidence/c1-config-tests.log`
  - `case-evidence/c1-config-probe.log`
- Cleanup: 探针在 `finally` 删除 root 与 home 临时目录。

### C2 cobertura 复算与 formatHints 探针

- Covers: `AC1、AC2`
- Preconditions:
  1. C1 通过；`pnpm -r build` 已执行。
  2. 探针 import `<WT>/packages/core/dist/task/coverage-compute.js` 与 `<WT>/packages/core/dist/workspace/config-defaults.js`；不依赖 git（`changedLines` 注入）。
- Steps:
  1. `cd <WT>/packages/core && node --test test/coverage-compute.test.ts`，记录退出码与新用例名清单（定位关键词 `cobertura`、`formatHints`、`meetsThreshold`、`detectLanguage`、`renderCoverageCommand`）。
  2. 探针 `case-evidence/probes/c2-cobertura-hints-probe.mjs`（夹具字符串内联或存 `case-evidence/fixtures/c2/`）：
     1. 夹具 `cobertura.xml`：`<coverage>` 根 → `<packages><package name="main"><classes><class name="App" filename="main/App.java"><lines>` 内 `line number="2" hits="1"`、`number="3" hits="1"`、`number="4" hits="0"`、`number="5" hits="1"`。
     2. 场景 A（复算）：`computeDiffCoverage({ changedLines: new Map([['src/main/App.java', [{ start: 2, end: 5 }]]]), reports: [cobertura] })` → `format` 为 `cobertura-xml`，`files` 恰一条 `src/main/App.java` `3/4`（`uncoveredRanges` 为 `[{start:4,end:4}]`），`overall` 为 `{ covered: 3, total: 4 }`，`missingExecutableFiles` 为 `[]`（filename 后缀匹配命中 diff 路径）。
     3. 场景 B（根缺失）：`parseCoberturaXml('<packages><package name="p"><classes><class filename="a.java"><lines><line number="1" hits="1"/></lines></class></classes></package></packages>', ['a.java'])` → 返回 `[err, null]`（根元素缺失）。
     4. 场景 C（inferFormat 区分）：`inferFormat(cobertura)` 为 `cobertura-xml`；`inferFormat('<report name="x"><package name="p"><sourcefile name="A.java"/></package></report>')` 为 `jacoco-xml`。
     5. 场景 D（内容优先）：`computeDiffCoverage` 同场景 A 但传 `formatHints: ['lcov']` → `format` 仍为 `cobertura-xml`（内容命中，hint 被覆盖）。
     6. 场景 E（unsupported 回退 hint）：报告文本 `<coverage line-rate="0"></coverage>`（无 `<lines>`，内容推断 unsupported），`formatHints: ['cobertura-xml']`，`changedLines: new Map([['src/A.java', [{ start: 1, end: 5 }]]])` → `format` 为 `cobertura-xml`（hint 回退），解析成功、`files` 为空、`missingExecutableFiles` 为 `['src/A.java']`。
     7. 场景 F（多语言无 hint）：`changedLines` 含 `src/A.java` 与 `src/B.ts`，报告为 lcov（`SF:src/A.java` 的 `DA:1,1`/`DA:2,0` 与 `SF:src/B.ts` 的 `DA:1,1`），不传 `formatHints` → `format` 为 `lcov`（纯内容推断，多文件多报告合并路径不破）。
     8. 场景 G（renderCoverageCommand）：import 自 `dist/workspace/config-defaults.js`；`renderCoverageCommand('go test -coverprofile=<profile> ./...', { worktree: '/wt', profile: '/p', baseRef: 'main' })` → `go test -coverprofile=/p ./...`；`renderCoverageCommand('tool <bad>', …)` → 抛错。
     9. 场景 H（阈值边界）：`meetsThreshold(800, 1000, 80)` 为 false、`meetsThreshold(801, 1000, 80)` 为 true、缺省 `meetsThreshold(90, 100)` 为 false、`meetsThreshold(91, 100)` 为 true。
  3. 探针输出存 `case-evidence/c2-cobertura-hints-probe.log`。
- Expected:
  1. 步骤 1 退出码 0；用例名清单覆盖 SR13 第 1 至 5 条分支。
  2. 场景 A 至 H 与期望逐项一致（数字、格式枚举、err 形态）；场景 E 的 `format` 与 `missingExecutableFiles` 同时成立（hint 生效且缺席检测在受支持格式下运行）。
- Evidence:
  - `case-evidence/c2-compute-tests.log`
  - `case-evidence/c2-cobertura-hints-probe.log`
  - `case-evidence/fixtures/c2/cobertura.xml`
- Cleanup: 探针无临时目录残留（夹具为字符串内联或任务目录文件）。

### C3 门禁配置探针：阈值、回退与 coverage_config

- Covers: `AC2、AC3`
- Preconditions:
  1. C1、C2 通过；`pnpm -r build` 已执行。
  2. 探针 import `<WT>/packages/core/dist/task/case-gates.js`；进程内先设 `process.env.HOME` 指向空 `mkdtemp` 目录（全局层恒空），`finally` 恢复。
  3. 探针只做函数级调用，不写任何真实任务凭据。
- Steps:
  1. `cd <WT>/packages/core && node --test test/case.test.ts`，记录退出码与用例名（定位 `coverage_threshold`、`coverage_config`、`unsupported`、`formatHints` 相关用例名）。
  2. 探针 `case-evidence/probes/c3-gate-config-probe.mjs`：临时项目镜像 case.test.ts 夹具形态（`makeRoot`/`validCase`/`validResult`/`makeTask`，基线 L237-275 与 L441-455）——`root/.workloom/tasks/demo/` 下写 `prd.md`（两 AC 形态）、`case.md`（SR1/SR2 + C1/C2 完整结构、Coverage 节 `Raw reports` 指向 `coverage/lcov.info`、Exclusions `docs/guide.md: documentation`）、`case-result.md`（Summary/静态/运行/Coverage/Standard Verification/Open issues 全节）、`coverage/` 报告文件；`root/src/a.ts`、`root/src/A.java`、`root/src/B.ts`、`root/src/Main.elm` 按场景创建；task 记录含 `case.required`、`designSession`、空 `worktree_path`、checker 派发记录；`options.changedLines` 注入变更行。逐场景打印问题码集合：
     1. 场景 A（80.0 拒）：`root/.workloom/config.json` 写 `{"coverage":{"threshold":80}}`；lcov `SF:` 绝对路径 1000 行 `DA`（前 800 行 hits=1，其余 0）；RESULT `Overall lines: 800/1000 (80.0%)`、Changed Files 行 `src/a.ts` `800/1000`；`changedLines` 为 `src/a.ts` `[1,1000]` → 问题码含 `coverage_threshold` 且不含 `coverage_recompute`。
     2. 场景 B（80.1 过）：lcov 前 801 行 hits=1；RESULT `801/1000 (80.1%)`、`src/a.ts` `801/1000` → 问题码集合为空。
     3. 场景 C（缺省 90）：删除 config 的 coverage 键；lcov 前 900 行 hits=1、RESULT `900/1000 (90.0%)` → 含 `coverage_threshold`；lcov 前 901 行、RESULT `901/1000 (90.1%)` → 空集合。
     4. 场景 D（coverage_config）：config 写 `{"coverage":{"threshold":-1}}`，lcov/RESULT 取 951/1000 (95.1%) 形态（其余全合规）→ 问题码恰为 `[coverage_config]`（函数正常返回数组，无裸异常）。
     5. 场景 E（非内置 unsupported 回退）：config `threshold: 80`；`changedLines` 只 `src/Main.elm` `[1,100]`（文件存在）；报告 `coverage/unknown.txt` 正文为无格式纯文本；RESULT `Status: generated`、`Overall lines: 80/100 (80.0%)`、Changed Files 恰列 `src/Main.elm` `80/100` → 含 `coverage_threshold`（阈值硬作用自报数）；RESULT 改 `81/100 (81.0%)` → 空集合；RESULT 再改 `not_applicable` 并补非空 `- Reason:` 行 → 含 `coverage_not_applicable`（不静默放行、不误判非可执行）。
     6. 场景 F（formatHints 广播）：config 写 `{"coverage":{"languages":{"java":{"format":"cobertura-xml"}}}}`；`changedLines` 只 `src/A.java` `[1,5]`；报告 `coverage/empty-cobertura.xml` 正文 `<coverage line-rate="0"></coverage>`（内容推断 unsupported）；RESULT Changed Files 表为空、`Overall lines: 0/0 (0.0%)` → 含 `coverage_missing_file`（formatHints 使格式成为受支持 → 缺席检测运行；无 hint 时该码不出现）。
     7. 场景 G（多语言纯推断）：同场景 F 但 `changedLines` 含 `src/A.java` 与 `src/B.ts`，RESULT Changed Files 列两文件各 `5/5`、`Overall lines: 10/10 (100.0%)` → 不含 `coverage_missing_file`（纯推断 → unsupported → 跳过缺席检测）且问题码集合为空。
  3. 探针输出存 `case-evidence/c3-gate-config-probe.log`；步骤 1 的用例定位结果写 `case-evidence/c3-case-test-checklist.md`。
- Expected:
  1. 步骤 1 退出码 0；清单覆盖 SR14 第 2 条各路径。
  2. 场景 A 至 G 问题码集合与期望逐项一致：A/B/C 证明配置阈值边界（80.0 拒/80.1 过、缺省 90 保持）；D 证明 config 非法 fail loud 不吞错；E 证明非内置未配置语言回退且阈值硬；F/G 对照证明单语言广播与多语言纯推断。
- Evidence:
  - `case-evidence/c3-case-tests.log`
  - `case-evidence/c3-case-test-checklist.md`
  - `case-evidence/c3-gate-config-probe.log`
- Cleanup: 探针在 `finally` 删除临时项目与 HOME 临时目录并恢复 `process.env.HOME`。

### C4 脚本消费与包扫描语言检测探针

- Covers: `AC2、AC4`
- Preconditions:
  1. C1 至 C3 通过；`pnpm -r build` 已执行。
  2. CLI 探针以子进程运行并经 env `HOME` 指向空临时目录；scan 探针在 `mkdtemp` 项目上运行。
- Steps:
  1. `cd <WT>/packages/core && node --test resources/scripts/task-diff-coverage.test.mjs resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts`，记录退出码与用例名（定位 `--check`、`formatHints`/`format`、`languages`）。
  2. 探针 `case-evidence/probes/c4-script-config-probe.mjs`：`mktemp` 建夹具 worktree（`git init` + user 配置，基线提交 `src/a.ts` 10 行与 `src/A.java` 5 行、`src/B.ts` 5 行，随后未提交改动 `src/a.ts` 全 10 行）；`.workloom/config.json` 按场景写入；lcov 报告（`SF:` 绝对路径，`DA` 行 hits 按场景）；以 `execFileSync('node', [script, worktree, '-', lcov, '--json', ...])` 运行并设 `env.HOME` 空目录。逐场景打印判定：
     1. 场景 A（--check fail）：config `{"coverage":{"threshold":80}}`；lcov 10 行中 8 行 hits=1 → `--json --check` 输出含阈值判定且极性为 fail（80.0% 不大于 80）。
     2. 场景 B（--check pass）：lcov 9 行 hits=1 → 判定极性为 pass。
     3. 场景 C（无 --check）：去掉 `--check` → 输出为纯 `DiffCoverageResult` JSON，无阈值判定内容（与基线 CLI 输出形态一致）。
     4. 场景 D（formatHints 广播）：夹具另建只改 `src/A.java`（基线 5 行全部改写）的 worktree；config `{"coverage":{"languages":{"java":{"format":"cobertura-xml"}}}}`；报告正文 `<coverage line-rate="0"></coverage>`（内容推断 unsupported）→ 输出 JSON 的 `format` 为 `cobertura-xml`（config 提示生效；若脚本不传 formatHints 则为 `unsupported`）。
     5. 场景 E（多语言纯推断）：夹具同时未提交改 `src/A.java` 与 `src/B.ts`；同 D 的 config 与报告 → 输出 `format` 为 `unsupported`（多语言不广播提示，纯内容推断）。
     6. 场景 F（config 非法）：config `{"coverage":{"threshold":-1}}` → 进程非零退出，stderr 文案含 `coverage`。
  3. 探针 `case-evidence/probes/c4-packages-scan-probe.mjs`：`mktemp` 建项目（`package.json` 空 JSON + `a.go` + `b.ts` + `c.java` + `readme.md`），`execFileSync('node', ['<WT>/packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs', dir])` → stdout `JSON.parse` 后：语言栈恰含 `go`/`typescript`/`java`（集合语义）；packages 候选含 `repo` 根条目。对照项目（只有 `readme.md`）→ 语言栈为空集。
  4. 探针输出存 `case-evidence/c4-script-config-probe.log` 与 `case-evidence/c4-packages-scan-probe.log`。
- Expected:
  1. 步骤 1 退出码 0；用例名覆盖 SR16 第 1 条与 SR17 第 1 条分支。
  2. 场景 A/B 判定极性随配置阈值翻转；C 无判定；D/E 的 `format` 字段对照成立（cobertura-xml vs unsupported）；F 非零退出。
  3. scan 探针语言栈集合判定成立，候选清单回归不变。
- Evidence:
  - `case-evidence/c4-script-tests.log`
  - `case-evidence/c4-script-config-probe.log`
  - `case-evidence/c4-packages-scan-probe.log`
- Cleanup: 探针在 `finally` 删除全部临时目录。

### C5 标准验证全表、资产同步与 dist 守卫

- Covers: `AC5、AC6`
- Preconditions:
  1. C1 至 C4 完成；全部代码修复已落地（任何修复后重跑 C1 至 C6）。
  2. 命令在 `<WT>` 根目录执行，build 先行。
- Steps:
  1. `pnpm -r build`，输出存 `case-evidence/c5-build.log`。
  2. `pnpm -r typecheck`，输出存 `case-evidence/c5-typecheck.log`。
  3. `pnpm lint`，输出存 `case-evidence/c5-lint.log`。
  4. `cd packages/core && pnpm test`，输出存 `case-evidence/c5-core-tests.log`（含 dist-mirror、dist-dts、contract-asset、case-templates 守卫）。
  5. `cd packages/dsh-workloom && pnpm test`，输出存 `case-evidence/c5-dsh-tests.log`（含 dist-mirror 守卫）。
  6. dist 核对：`git status --porcelain packages/core/dist packages/dsh-workloom/dist`，输出存 `case-evidence/c5-dist-status.log`（非空属预期：dist 随 src 同批重建，同 commit 提交由主会话 2.4 落实，dist-mirror 守卫证镜像一致）。
  7. 资产同步核对（输出存 `case-evidence/c5-asset-sync.log`）：
     1. `grep -n '| \`coverage\` |' packages/core/resources/skills/workloom-config-edit/SKILL.md`：命中；`grep -n 'The eight snake_case' <同文件>`：零命中（完整句式缺席断言）；`grep -n 'nine snake_case' <同文件>`：命中。
     2. `grep -n '"coverage"' <同文件>`：命中（示例）；`grep -n 'configured threshold' packages/core/resources/workflow/workflow.md`：L97/L113 两句区域命中。
     3. `grep -n 'coverage' packages/core/resources/skills/workloom-packages-scan/SKILL.md`：步骤/Boundaries/description 至少三处命中；`grep -n 'scan-packages.test.js' <同文件>`：零命中；`grep -n 'scan-packages.test.ts' <同文件>`：命中。
     4. `grep -n 'coverage-config' .workloom/spec/repo/workflow/index.md`：恰一行命中；`grep -n 'configured\|default 90' <同文件>`：incremental-coverage 条目命中。
     5. `grep -n 'coverage_config' packages/core/src/task/case-gates.ts`：ISSUE_CODES 与使用处命中。
     6. `wc -l packages/core/src/workspace/config-defaults.ts packages/core/src/workspace/config-load.ts packages/core/src/task/coverage-compute.ts packages/core/src/task/case-gates.ts packages/core/resources/scripts/task-diff-coverage.mjs packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs`：均不超过 600。
  8. `git diff --check`：无空白错误输出。
  9. 变更集审计：`git status --porcelain` 与 `git diff --name-only main...HEAD`，输出存 `case-evidence/c5-change-set.log`；逐项核对——不以 `packages/core/dist/`、`packages/dsh-workloom/dist/`、`packages/core/test/`、`packages/dsh-workloom/test/`、`.workloom/`、`coverage/` 开头、不等于两个测试文件与四个文档资产文件（config.d.ts、两个 SKILL.md、workflow.md）的每个变更文件，都是某个 SR 的 Target；多出的文件记为 CASE 缺项交主会话修订 CASE 后重跑。
- Expected:
  1. 步骤 1 至 5 退出码均为 0；lint 无 error 与 warning；两包测试 0 fail 且守卫用例全部通过。
  2. 步骤 6 dist 变更属预期状态（镜像守卫通过）。
  3. 步骤 7 六组核对全部成立；步骤 8 无输出；步骤 9 每个非排除变更文件都有 SR 目标。
- Evidence:
  - `case-evidence/c5-build.log`
  - `case-evidence/c5-typecheck.log`
  - `case-evidence/c5-lint.log`
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-dist-status.log`
  - `case-evidence/c5-asset-sync.log`
  - `case-evidence/c5-change-set.log`
- Cleanup: none。

### C6 本任务自身增量覆盖率证据（双轨）与指纹

- Covers: `AC6`
- Preconditions:
  1. C1 至 C5 通过；C5 步骤 1 的 `pnpm -r build` 已执行，dist 与 src 同代。
  2. 执行轮代码尚未提交，变更集等于 `<WT>` 内 `git status --porcelain` 的全部条目（含未跟踪文件）。
- Steps:
  1. 路径解析：`WT=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-coverage-config`；`MAIN=$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)`；`TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config"`；`mkdir -p "$TASK/coverage" "$TASK/case-evidence"`。
  2. 双包 lcov 采集（Aggregate command 原样执行；glob 与 core `package.json` test 脚本三 glob 同形）：spec 输出分别存 `case-evidence/c6-core-coverage-run.log` 与 `case-evidence/c6-dsh-coverage-run.log`，lcov 落 `$TASK/coverage/`。
  3. 轨道二（新脚本增量交集，Aggregate command 的 `task-diff-coverage.mjs` 命令原样执行）：产出 `coverage/changed-lines.json`、`coverage/diff-coverage.json`，stdout 存 `case-evidence/c6-diff-coverage-stdout.json`。
  4. 轨道二断言：`format` 为 `lcov`；`missingExecutableFiles` 为 `[]`；`files` 的路径集合等于变更集去排除后的可执行文件集合（预期为 `packages/core/src/workspace/config-defaults.ts`、`packages/core/src/workspace/config-load.ts`、`packages/core/src/task/coverage-compute.ts`、`packages/core/src/task/case-gates.ts`、`packages/core/resources/scripts/task-diff-coverage.mjs`、`packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs`，以实际变更集为准）；`overall` 满足 `covered * 100 > total * 90`（严格大于，缺省配置阈值 90）。
  5. 单文件交叉核对：取 `changed-lines.json` 中 `packages/core/src/task/coverage-compute.ts` 的区间（既有文件为改动区间，非整文件），对照 `lcov-core.info` 的对应 `SF:` 段逐行统计 `DA` hits，手算 covered/total，与 `diff-coverage.json` 中该文件的 `covered`/`total` 比对，写入 `case-evidence/c6-cross-check.md`。
  6. `--check` 交叉核对（非独立通过条件，复证 R4）：以 Aggregate command 同参数追加 `--check` 再运行一次，输出判定极性为 pass 且引用阈值 90（缺省配置）。
  7. 轨道一数值（旧门禁整文件口径，供 RESULT 填写）：探针 `case-evidence/probes/c6-lcov-summary.mjs` 读 `lcov-core.info` 与 `lcov-dsh.info`，对步骤 4 的可执行文件集合输出逐文件整文件 `LF`/`LH` 与 hits=0 的 `DA` 行区间（`packages/core/src/workspace/config.d.ts`、SKILL.md、workflow.md 等非可执行文件经 Exclusions 排除，不进表），写 `coverage/whole-file-summary.md`；RESULT Coverage `Status: generated`、Changed Files 表恰列该集合、`Overall lines` 取整文件口径汇总数字。
  8. 指纹：`node packages/core/resources/scripts/task-fingerprint.mjs "$WT" | tee case-evidence/c6-fingerprint.txt`（在最后一次代码修复之后执行），输出形如 `codeFingerprint=<64 位十六进制>`，记入 RESULT front-matter `codeBaseline`。
  9. 不达标预案：`overall` 不大于 90% 时按 workflow 2.3 在 RESULT Coverage 节附逐文件原因与 developer 说明交主会话审核，并在 Open issues 以 P0 上报（AC6 未达成，除非主会话审核豁免）。
- Expected:
  1. `<task>/coverage/` 含 `lcov-core.info`、`lcov-dsh.info`、`changed-lines.json`、`diff-coverage.json`、`whole-file-summary.md`，两份 JSON 可被 `JSON.parse`。
  2. 步骤 4 各断言成立（`missingExecutableFiles` 为空说明全部非排除变更可执行文件都进入报告）。
  3. 步骤 5 手算值与脚本值完全相同（差异为 0）；步骤 6 判定极性为 pass。
  4. `overall` 严格大于 90%；否则按步骤 9 上报。
- Evidence:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`
  - `coverage/whole-file-summary.md`
  - `case-evidence/c6-core-coverage-run.log`
  - `case-evidence/c6-dsh-coverage-run.log`
  - `case-evidence/c6-diff-coverage-stdout.json`
  - `case-evidence/c6-cross-check.md`
  - `case-evidence/c6-fingerprint.txt`
- Cleanup: none（证据保留在任务目录；worktree 内不新建 `coverage/` 或 `case-evidence/`）。

## Coverage

- Tool: Node.js v24 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 `lcov` reporter；增量交集用 S1 合入 main、本任务配置化的 `packages/core/resources/scripts/task-diff-coverage.mjs`（经 core dist 的 `task/coverage-compute.js` 单一计算源）。
- Instrumentation: 双轨并行，两轨共用同一份原生报告，都以 `pnpm -r build` 先行为前提。
  1. 轨道一（门禁轨，旧格式）：运行中的插件是旧版本，本任务 RESULT 的 Coverage 节按旧口径填写——`Status: generated`，`Overall lines` 与 Changed Files 表取 lcov 的整文件行覆盖（逐文件 `LF`/`LH`，未覆盖行取 hits=0 的 `DA` 行区间，由 C6 步骤 7 汇总给出）。旧门禁只校验 Overall 形态、Changed Files 文件集合等于非排除变更文件集、Exclusions 两处一致、原始报告存在；本任务变更集中的非可执行文件（config.d.ts、两个 SKILL.md、workflow.md、spec 副本、测试）全部经 Exclusions 排除，表内恰剩可执行源码文件。
  2. 轨道二（证据轨，新口径）：C6 用配置化脚本对同一份 lcov 报告与本任务工作区 diff 求交集，产出 `coverage/changed-lines.json` 与 `coverage/diff-coverage.json`；`overall` 须严格大于 90%（缺省配置阈值）。该结果不进旧门禁，只作为新门禁口径在本任务自身 diff 上的真实证据。
  3. 两包测试都从 `<WT>` 根目录以 coverage 模式运行，lcov 的 `SF:` 路径即 repo 相对路径，直接匹配 diff 路径；dsh 测试经 `@workloom-ai/core` 加载 core dist，dist 文件同样进入报告，但 dist 在 Exclusions 中，两轨都不计入。脚本命令行经 env `HOME` 隔离空目录（本机 `~/.workloom/config.json` 存在，保证 loadConfig 全局层恒空、判定确定）。
  4. 轨道二在执行轮用 `-`（工作区口径：变更尚未提交，三点 diff 为空）；2.4 提交后可用 `main` 复跑交叉核对，不作为通过条件。
- Aggregate command:
  ```bash
  WT=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-coverage-config
  MAIN=$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config"
  mkdir -p "$TASK/coverage" "$TASK/case-evidence" "$TASK/case-evidence/home"
  cd "$WT"
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c6-core-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-core.info" \
    'packages/core/test/*.test.ts' \
    'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' \
    'packages/core/resources/scripts/*.test.mjs'
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c6-dsh-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-dsh.info" \
    'packages/dsh-workloom/test/*.test.ts'
  HOME="$TASK/case-evidence/home" node packages/core/resources/scripts/task-diff-coverage.mjs "$WT" - \
    "$TASK/coverage/lcov-core.info" "$TASK/coverage/lcov-dsh.info" \
    --exclude 'packages/core/dist/' --exclude 'packages/dsh-workloom/dist/' \
    --exclude 'packages/core/test/' --exclude 'packages/dsh-workloom/test/' \
    --exclude 'packages/core/resources/scripts/task-diff-coverage.test.mjs' \
    --exclude 'packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts' \
    --exclude 'packages/core/src/workspace/config.d.ts' \
    --exclude 'packages/core/resources/skills/workloom-packages-scan/SKILL.md' \
    --exclude 'packages/core/resources/skills/workloom-config-edit/SKILL.md' \
    --exclude 'packages/core/resources/workflow/workflow.md' \
    --exclude '.workloom/' --exclude 'coverage/' \
    --out-dir "$TASK/coverage" --json | tee "$TASK/case-evidence/c6-diff-coverage-stdout.json"
  node packages/core/resources/scripts/task-fingerprint.mjs "$WT" | tee "$TASK/case-evidence/c6-fingerprint.txt"
  ```
- Scope: 两轨共同的可执行变更文件集合——预期为 `packages/core/src/workspace/config-defaults.ts`、`packages/core/src/workspace/config-load.ts`、`packages/core/src/task/coverage-compute.ts`、`packages/core/src/task/case-gates.ts`、`packages/core/resources/scripts/task-diff-coverage.mjs`、`packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs`（全部由聚合命令三 glob 的测试运行覆盖：config 用例、compute 用例、gate 用例、脚本单测、扫描单测）。实际集合以 C5 步骤 9 与 C6 步骤 4 的变更集审计为准；多出的非排除文件须有 SR 目标，否则属 CASE 缺项，交主会话修订 CASE 后重跑。
- Exclusions:
  - packages/core/dist/: 构建产物，镜像 src；C5 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核
  - packages/dsh-workloom/dist/: 构建产物，镜像 src；C5 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核
  - packages/core/test/: 测试夹具与 config/compute/gate/contract-asset 用例自身；C1 至 C3 与 C5 验全绿
  - packages/dsh-workloom/test/: dsh 钉住用例自身（本任务预期无 dsh 变更）；C5 验全绿
  - packages/core/resources/scripts/task-diff-coverage.test.mjs: 脚本单测自身；C4 验全绿（脚本本体留 scope 内，由该单测运行覆盖）
  - packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts: 扫描单测自身；C4 验全绿（scan-packages.mjs 本体留 scope 内，由该单测运行覆盖）
  - packages/core/src/workspace/config.d.ts: 手写类型声明锚点，无运行时行（lcov 不报告）；dist 分发一致性由 dist-dts 守卫验证，类型面由 SR1 静态审
  - packages/core/resources/skills/workloom-packages-scan/SKILL.md: skill 文档英文资产，无运行时行；SR9 静态审 + C5 grep 验 coverage 提议与手配标注
  - packages/core/resources/skills/workloom-config-edit/SKILL.md: skill 文档英文资产，无运行时行；SR10 静态审 + C5 grep 验 9 字段清单与示例
  - packages/core/resources/workflow/workflow.md: 工作流 guidance 英文文本，无运行时行；SR6 静态审 + C5 grep 验 configured threshold 文案与 version 不升
  - .workloom/: 任务元数据与 worktree 侧 spec 副本，非代码；spec 条目经 SR11 静态审与 C5 grep 验证
  - coverage/: 开发者工作区自测报告（如存在），非代码不提交；CASE 证据统一写任务目录 coverage/，由主会话在 2.4 提交前删除 worktree 副本
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
| AC1 | SR1、SR2、SR3、SR4、SR12、SR13 | C1、C2 |
| AC2 | SR4、SR5、SR6、SR7、SR13、SR14、SR16 | C2、C3、C4 |
| AC3 | SR5、SR14 | C3 |
| AC4 | SR8、SR9、SR17 | C4 |
| AC5 | SR10、SR15 | C5 |
| AC6 | SR11、SR15 | C5、C6 |

## Execution Notes

1. 内置语言计数说明：PRD 与 plan 表述"内置 8 语言"，但其枚举清单实际列出九个语言键（`go`、`typescript`、`javascript`、`python`、`rust`、`c`、`cpp`、`java`、`kotlin`；PRD 分组行把 typescript/javascript 与其余分开计数）。本 CASE 按九键逐键判定（SR4 第 7 条），与 plan 步骤 3 的 LANGUAGE_DEFAULTS 全列一致；主会话复核时知悉该计数差异，若裁定严格八语言须先改 PRD 再修订 CASE。
2. 双轨与旧注入分工：运行中插件是旧版本，CASE 执行轮的派发注入走旧链路（本 CASE 自身以旧格式过旧门禁，轨道一）；新配置驱动行为（config 解析、格式提示、配置阈值、脚本 --check）全部经函数级探针（C1 至 C4）与单测验证，不经生产实例端到端；生产集成 CASE 验收与部署（profile 重钉 + 用户授权重启）归任务收尾（PRD Notes）。
3. HOME 隔离纪律：本机真实存在 `~/.workloom/config.json`（内容为 subagent_profiles），凡调用 `loadConfig` 的测试（case.test、脚本单测）与探针（C3、C4、C6）必须隔离 HOME——函数级用 `homeDir` 选项或 `process.env.HOME` 设置/恢复，子进程用 env 注入；这是 plan 步骤 8 的钉死要求，防止全局层污染造成用例随机器漂移。
4. formatHints 构造规则（SR5 第 5 条与 SR7 第 2 条钉死，与 plan 步骤 4/5 一致）：变更文件经 `detectLanguage` 归类，恰一种语言 → 每份报告广播同一 `FORMAT_NORMALIZE(config.languages[lang]?.format ?? LANGUAGE_DEFAULTS[lang].format)`；多语言或全部未命中 → 不传（纯内容推断）；内容命中永远优先于提示（C2 场景 D、C3 场景 F/G、C4 场景 D/E 三层验证）。
5. 红绿清单（code-style red-green-expectations，覆盖 plan 步骤 8 列举的消费方）：`90%` 文案消费方五处——case-gates L431/L434 两条 issue 文案、workflow.md L97/L113 两句、spec incremental-coverage 条目，contract-asset pin（L1146-1150）逐字钉住新句；`meetsThreshold` 调用方三处——门禁（L429）、脚本 `--check`、单测边界用例；字段清单消费方两处——config-edit SKILL 表与 contract-asset 字段遍历 pin（L1163-1174）；`EXTENSION_LANGUAGE` 双源——coverage-compute 单源与 scan-packages 检测（import 或一致性测试，SR8）。执行轮若某消费方变红，按清单逐项核对是否遗漏。
6. 探针与夹具落点：`<task>/case-evidence/probes/`（`c1-config-coverage-probe.mjs`、`c2-cobertura-hints-probe.mjs`、`c3-gate-config-probe.mjs`、`c4-script-config-probe.mjs`、`c4-packages-scan-probe.mjs`、`c6-lcov-summary.mjs`）与 `<task>/case-evidence/fixtures/c2/`；探针在 `mktemp -d` 临时目录内构造仓库并自清理，不写生产目录，不执行 commit 与 push（C4 夹具 worktree 的基线提交只在临时目录内）。
7. 任何代码修复之后：SR 全部重审、C1 至 C6 全量重跑、指纹重算（C6 步骤 8 在最后一次修复之后执行）；轨道二 `overall` 不大于 90% 时按 C6 步骤 9 的预案上报，不静默放宽。
