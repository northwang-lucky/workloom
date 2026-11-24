# S4 覆盖率工具配置驱动与内置默认 — 计划（Round 4 修订）

> 修订依据：plan-review.md Round 1–3 全部处置（R1 0P0/7P1/6P2，R2 0P0/1P1/5P2，R3 0P0/1P1/4P2）。

## Design decisions

- **config schema follow worktree 先例**：coverage 项目层字段，DEFAULT_CONFIG 默认 {threshold:90, languages:{}}，mergeWithDefaults 加解析分支，未知子字段 fail loud；config.d.ts 加 CoverageConfig（copy-domain-dts 自动分发）。
- **阈值共享常量**：`DEFAULT_THRESHOLD=90` 单源（config-defaults 导出，workspace 叶子）；meetsThreshold(covered,total,threshold=DEFAULT_THRESHOLD) 整数交叉乘 `covered*100>total*threshold`。门禁/脚本/文案统一引用，消除 90 硬编码散落。
- **cobertura 解析**：CoverageFormat 加 'cobertura-xml'；parseCoberturaXml（class filename + line number/hits，hits>0 覆盖，filename 后缀匹配归一，根缺失/解析失败 err）；inferFormat 加 cobertura（根 <coverage> + <lines>，区分 jacoco <report>）。
- **格式提示机制（明确）**：config languages.format 是磁盘枚举（go-coverprofile/lcov/jacoco-xml/cobertura-xml），经 FORMAT_NORMALIZE 映射到 CoverageFormat（go-coverprofile→go，其余同名）。computeDiffCoverage 加可选 `formatHints?: CoverageFormat[]`（与 reports 同序）；**内容推断优先**——inferFormat 命中即用，仅当 unsupported 时回退对应 hint；hint 与内容冲突以内容为准。LANGUAGE_DEFAULTS 提供未配置语言的默认 format。
- **占位符封闭白名单**：新建共享 `COVERAGE_PLACEHOLDER_TOKENS`={<worktree>:worktree 根, <profile>:任务 coverage/报告输出路径, <base-ref>:基线分支}（值来源明确）+ `renderCoverageCommand` 渲染函数（assertPlaceholders 校验，未知占位符 fail loud）。command 骨架内容随 LANGUAGE_DEFAULTS 列出。
- **门禁读 config root**：loadConfig(worktreeDirectory(root, task))（worktree 分支配置，case-scope L30-34）；config 非法 → 新增 issue code `coverage_config`（ISSUE_CODES 加）；meetsThreshold 传配置阈值；issue 文案改"configured threshold (default 90%)"。
- **90% 文案 ripple**：case-gates L431/434 issue 文案、workflow.md L97/113、spec workflow/index.md L9 条目改"默认 90% 可配"；contract-asset L1148-1149 pin 同步（红绿清单列）。
- **语言检测单源**：EXTENSION_LANGUAGE 映射单源；EXECUTABLE_EXTENSIONS 由 EXTENSION_LANGUAGE 键派生（或一致性测试钉死），避免双源漂移。
- **packages-scan 检测路径钉死**：scan-packages.mjs 输出语言栈（脚本检测，可单测）；SKILL 指引据 LANGUAGE_DEFAULTS 提议 coverage.languages 经 config skill 写入。AC4 单测=scan-packages 语言检测 + SKILL grep。
- **测试 HOME 隔离**：case.test/脚本测试用 loadConfig homeDir 选项或 env 隔离（executor.test L39-45 先例），避免本机 ~/.workloom/config.json 污染。
- **实现先读** config-defaults/config-load/config.d.ts/coverage-compute/case-gates/case-scope/task-diff-coverage.mjs/packages-scan SKILL+scan-packages.mjs/config-edit SKILL。

## Steps

#### 步骤 1 — config schema

- Covers: AC1
- Target: `packages/core/src/workspace/config.d.ts` — WorkloomConfig（L2-32）；`packages/core/src/workspace/config-defaults.ts` — DEFAULT_CONFIG（L14-38）、SETUP_PLACEHOLDER_TOKENS（L57-61）；`packages/core/src/workspace/config-load.ts` — mergeWithDefaults（L311-394）、GLOBAL_PROJECT_ONLY_FIELDS（L58）
- Edit:
  ```text
  Input: WorkloomConfig 字段；DEFAULT_CONFIG；mergeWithDefaults worktree 分支（L367-392）；requireMap/requireNonNegativeInt/requireString/assertPlaceholders。
  Output: CoverageConfig 类型 {threshold:number, languages:Record<string,{format:CoverageFormatLiteral, command?:string}>}；WorkloomConfig.coverage；DEFAULT_CONFIG.coverage={threshold:DEFAULT_THRESHOLD,languages:{}}；parseCoverage 校验器（threshold 0–100 整数，专用文案非"0 means unlimited"）；mergeWithDefaults coverage 分支；GLOBAL_PROJECT_ONLY_FIELDS 加 coverage。
  Preconditions: none
  Procedure:
    - config.d.ts 加 CoverageConfig + CoverageFormatLiteral（go-coverprofile/lcov/jacoco-xml/cobertura-xml）+ WorkloomConfig.coverage。
    - config-defaults 定义 DEFAULT_THRESHOLD=90、COVERAGE_PLACEHOLDER_TOKENS={<worktree>,<profile>,<base-ref>}、renderCoverageCommand（供步骤 3/5/6 引用）；DEFAULT_CONFIG.coverage 默认；parseCoverage（threshold 0–100 整数专用文案、languages format 枚举、command 占位符校验、未知子字段 fail loud）。
    - config-load mergeWithDefaults 加 doc.coverage 分支；GLOBAL_PROJECT_ONLY_FIELDS 加 coverage（全局层报项目字段错误）。
  Failure: 非法 threshold/format/未知子字段/未知占位符 → WorkloomConfigError（字段路径）。
  ```
- Verify: 工作目录 <WT> 根；`node --test packages/core/test/config.test.ts`（coverage 默认/自定义/非法 fail loud/未知子字段/全局层拒绝）。

#### 步骤 2 — cobertura 解析器与格式推断

- Covers: AC1, AC2
- Target: `packages/core/src/task/coverage-compute.ts` — CoverageFormat（L59）、inferFormat（L112）、ComputeDiffCoverageInput（L93-99）、格式映射处（L335）、parseReport（内部）
- Edit:
  ```text
  Input: CoverageFormat 五值；inferFormat 三规则；jacoco 解析器形态。
  Output: CoverageFormat 加 'cobertura-xml'；parseCoberturaXml（class filename+line hits>0，后缀匹配归一，根缺失/解析失败 err）；inferFormat 加 cobertura；ComputeDiffCoverageInput 加 formatHints?:CoverageFormat[]（与 reports 同序）；格式映射处内容推断优先、unsupported 回退 hint[i]；parseReport 收编。
  Preconditions: none
  Procedure:
    - CoverageFormat 加 'cobertura-xml'。
    - parseCoberturaXml：<coverage><packages><package><classes><class filename><lines><line number hits>；filename 归一后缀匹配，hits>0 covered；根 <coverage> 缺失或 XML 损坏 → err。
    - inferFormat：/<coverage\b/ 且 /<lines>/ → cobertura-xml（与 jacoco <report> 区分）。
    - parseReport 加 cobertura-xml 分支。
    - ComputeDiffCoverageInput.formatHints 可选；逐报告 inferFormat 命中即用，unsupported 回退 formatHints[i]（内容优先，冲突以内容为准）。
  Failure: XML 解析失败/根缺失 → err；filename 多候选歧义 → err。
  ```
- Verify: 工作目录 <WT> 根；`node --test packages/core/test/coverage-compute.test.ts`（cobertura 复算/路径归一/根缺失 err/inferFormat 区分 jacoco/cobertura/混合格式）。

#### 步骤 3 — 阈值参数化、内置语言与占位符

- Covers: AC1, AC2
- Target: `packages/core/src/task/coverage-compute.ts` — meetsThreshold（L102）、EXECUTABLE_EXTENSIONS（L26）
- Edit:
  ```text
  Input: meetsThreshold 硬编码 90；EXECUTABLE_EXTENSIONS 封闭集合；SETUP_PLACEHOLDER_TOKENS 私有先例。
  Output: DEFAULT_THRESHOLD=90 导出常量（落 config-defaults，workspace 叶子 parseCoverage 与 task 层共用）；meetsThreshold(covered,total,threshold=DEFAULT_THRESHOLD)；LANGUAGE_DEFAULTS（9 个语言键 format+command 骨架全列）；EXTENSION_LANGUAGE 单源 + detectLanguage（未命中返回 null，.d.ts 排除）；EXECUTABLE_EXTENSIONS 由 EXTENSION_LANGUAGE 派生；FORMAT_NORMALIZE（go-coverprofile→go，落 coverage-compute）；COVERAGE_PLACEHOLDER_TOKENS/renderCoverageCommand 引用步骤 1（config-defaults）。
  Preconditions: Steps 1,2
  Procedure:
    - meetsThreshold 加 threshold 参数缺省 DEFAULT_THRESHOLD（步骤 1 定义于 config-defaults），交叉乘 covered*100>total*threshold。
    - LANGUAGE_DEFAULTS command 骨架全列：go 'go test -coverprofile=<profile> -covermode=atomic ./...'；typescript/javascript 'node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=<profile>'（测试 glob 由 Checker 按任务追加，不入占位符白名单）；python 'coverage run -m pytest && coverage lcov -o <profile>'；rust 'cargo llvm-cov --lcov --output-path <profile>'；c/cpp 'lcov --capture --directory . --output-file <profile>'；java/kotlin 'gradle test jacocoTestReport'（报告路径 <profile>）。
    - EXTENSION_LANGUAGE 单源（.go→go 等）；detectLanguage；EXECUTABLE_EXTENSIONS 由其键派生（一致性测试）。
    - COVERAGE_PLACEHOLDER_TOKENS={<worktree>,<profile>,<base-ref>} + 值来源；renderCoverageCommand（assertPlaceholders 校验）。
    - FORMAT_NORMALIZE 磁盘枚举→CoverageFormat。
  Failure: 未知占位符 → fail loud。
  ```
- Verify: 工作目录 <WT> 根；`node --test packages/core/test/coverage-compute.test.ts`（meetsThreshold 自定义阈值边界/detectLanguage/EXECUTABLE_EXTENSIONS 一致性/renderCoverageCommand 未知占位符 err）。

#### 步骤 4 — 门禁消费配置与文案 ripple

- Covers: AC2, AC3
- Target: `packages/core/src/task/case-gates.ts` — meetsThreshold 调用（L429）、issue 文案（L431/434）、ISSUE_CODES；`packages/core/resources/workflow/workflow.md`（L97/113）；`.workloom/spec/repo/workflow/index.md`（L9）
- Edit:
  ```text
  Input: 门禁 meetsThreshold(covered,total)（L429，thresholdBasis 区分机械/自报）；issue 文案写死 90%（L431/434）；workflow L97/113 与 spec L9 写死 90%。
  Output: loadConfig(worktreeDirectory(root,task)) 读 coverage.threshold 传 meetsThreshold；config 非法 → coverage_config issue（ISSUE_CODES 加）；computeDiffCoverage 传 formatHints（config languages FORMAT_NORMALIZE）；issue 文案与 workflow/spec 改"默认 90% 可配"。
  Preconditions: Steps 1,3
  Procedure:
    - evaluateCaseOutcomeGate loadConfig(worktreeDirectory(root,task))（case-scope L30-34）；config 错误 → coverage_config issue（不抛裸异常）。
    - meetsThreshold(thresholdBasis.covered, thresholdBasis.total, config.coverage.threshold)。
    - computeDiffCoverage formatHints 构造规则（钉死）：变更文件经 detectLanguage 归类，恰一种语言 → formatHints=reports.map(()=>FORMAT_NORMALIZE(config.languages[lang]?.format ?? LANGUAGE_DEFAULTS[lang].format))（单格式广播）；多语言或无命中 → formatHints undefined（纯推断）。
    - issue 文案 L431/434 插值实际阈值"configured threshold ${threshold}% (default 90%)"；workflow L97/113、spec L9 改"默认 90% 可配"。
  Failure: config 非法 → coverage_config issue（core failure）。
  ```
- Verify: 工作目录 <WT> 根；`node --test packages/core/test/case.test.ts`（threshold 80：80.0 拒/80.1 过；非内置 unsupported 回退阈值硬；config 非法 coverage_config；HOME 隔离）。

#### 步骤 5 — 脚本消费配置

- Covers: AC2
- Target: `packages/core/resources/scripts/task-diff-coverage.mjs`（L14-15 import、main）
- Edit:
  ```text
  Input: 脚本现 import computeDiffCoverage/gitDiffChangedLines（L14-15），main 无阈值判定（只产交集 JSON，阈值判定在门禁）。
  Output: 脚本 loadConfig(worktree) 读 coverage.languages 传 formatHints；可选 --check 标志按配置阈值输出 pass/fail 标记（meetsThreshold）；command 渲染供 packages-scan/CASE 用 renderCoverageCommand。
  Preconditions: Steps 1,3
  Procedure:
    - import loadConfig（dist workspace/config-load.js）+ meetsThreshold/FORMAT_NORMALIZE/detectLanguage/LANGUAGE_DEFAULTS。
    - main loadConfig(worktree) 读 languages；formatHints 构造同步骤 4 规则（单语言广播 config ?? 内置默认，多语言纯推断）。
    - --check 标志：按 config.coverage.threshold 调 meetsThreshold 输出 pass/fail（缺省不判定，只产 JSON）。
    - renderCoverageCommand 导出供 packages-scan/CASE aggregate 命令生成。
  Failure: config 非法 → 抛错；未知占位符 → 抛错。
  ```
- Verify: 工作目录 <WT> 根；`node --test packages/core/resources/scripts/task-diff-coverage.test.mjs`（formatHints 生效、--check 配置阈值 pass/fail、HOME 隔离）。

#### 步骤 6 — packages-scan 扩展

- Covers: AC4
- Target: `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs`（语言检测输出）；`packages/core/resources/skills/workloom-packages-scan/SKILL.md`（Workflow）
- Edit:
  ```text
  Input: scan-packages.mjs 现输出 packages 候选；SKILL 经 config skill 写 packages（S3）。
  Output: scan-packages.mjs 输出语言栈（按扩展名/manifest 检测，可单测）；SKILL Workflow 加一步据 LANGUAGE_DEFAULTS 提议 coverage.languages 经 config skill 写入；非内置语言标注手配。
  Preconditions: Steps 1,3；S3 config skill
  Procedure:
    - scan-packages.mjs 加语言检测输出（languages 字段，detectLanguage 归类）。
    - SKILL Workflow 加步骤：据语言栈与 LANGUAGE_DEFAULTS 提议 coverage.languages，经 workloom-config-edit 与 packages 一并确认；非内置语言标注"需手动配置 format/command"。
    - SKILL description/Boundaries 联动（提及 coverage 提议）；SKILL.md:59 旧 scan-packages.test.js 引用同步 .test.ts。
  Failure: none
  ```
- Verify: 工作目录 <WT> 根；`node --test packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts`（语言检测）+ `grep -n 'Propose coverage defaults\|LANGUAGE_DEFAULTS\|coverage.languages' packages/core/resources/skills/workloom-packages-scan/SKILL.md` 核对 Workflow/description/Boundaries 联动。

#### 步骤 7 — config-edit skill 清单同步

- Covers: AC5
- Target: `packages/core/resources/skills/workloom-config-edit/SKILL.md`（Disk field whitelist + description/Boundaries）
- Edit:
  ```text
  Input: 现 8 字段白名单表（S3）；description/Boundaries。
  Output: 白名单加 coverage 行（9 字段）：{threshold?, languages?}，子字段 threshold 0–100/languages format 四枚举/command 占位符；补 coverage 示例；description/Boundaries 联动（contract-asset pin）。
  Preconditions: Step 1
  Procedure:
    - 白名单表加 coverage 行 + 子字段说明 + 示例。
    - description/Boundaries 若提及字段数则同步。
  Failure: none
  ```
- Verify: 工作目录 <WT> 根；`node --test packages/core/test/contract-asset.test.ts`（9 字段含 coverage + description/Boundaries pin）+ `grep -n '"coverage"\|coverage.languages' packages/core/resources/skills/workloom-config-edit/SKILL.md`。

#### 步骤 8 — 测试与 pin

- Covers: AC1, AC2, AC3, AC4, AC5, AC6
- Target: `packages/core/test/config.test.ts`、`coverage-compute.test.ts`、`case.test.ts`、`contract-asset.test.ts`（L1148-1149）、脚本单测、scan-packages 单测
- Edit:
  ```text
  Input: 现测试钉硬编码 90/三格式/8 字段；case.test/脚本测试无 HOME 隔离（本机 ~/.workloom/config.json 存在）。
  Output: config coverage 用例；cobertura 夹具（含根缺失/混合）；自定义 threshold 门禁；非内置回退；脚本 --check；scan-packages 语言检测；contract-asset 9 字段 + workflow 文案 pin；HOME 隔离（loadConfig homeDir 选项，executor.test L39-45 先例）。
  Preconditions: Steps 1-7
  Procedure:
    - config.test：coverage 默认/自定义/非法/全局拒绝。
    - coverage-compute.test：cobertura 复算 + 根缺失 err + 混合 + meetsThreshold 参数化 + detectLanguage + EXTENSION 一致性 + renderCoverageCommand。
    - case.test：threshold 80 边界 + 非内置回退 + coverage_config + HOME 隔离。
    - contract-asset：config-edit 9 字段 + workflow L97/113 文案 + packages-scan Boundaries 逐字 pin（L1205-1208）更新。
    - coverage-compute.test 补 formatHints unsupported 回退直接用例。
    - 红绿清单枚举消费方（meetsThreshold 调用方、CoverageFormat 使用方、90% 文案三处、字段清单、EXTENSION 双源）。
  Failure: pin 红 → 修。
  ```
- Verify: 工作目录 <WT> 根；`pnpm lint && pnpm -r typecheck && pnpm -r build && pnpm --filter @workloom-ai/core test && pnpm --filter @workloom-ai/dsh-workloom test`（HOME 隔离）。

#### 步骤 9 — spec、dist 与自身证据

- Covers: AC6
- Target: `.workloom/spec/repo/workflow/index.md`（新条目）、两包 dist、任务 coverage/
- Edit:
  ```text
  Input: S1 脚本可用；S4 变更集。
  Output: spec coverage-config 条目（英文，默认 90% 可配/四格式/内置语言/非内置回退）；dist 同 commit；自身增量证据落任务 coverage/。
  Preconditions: Step 8 全绿
  Procedure:
    - spec 条目；pnpm lint/typecheck/build/两包 test 退出 0；dist 同 commit。
    - 双包 lcov + task-diff-coverage.mjs 算 S4 增量（工作区口径），落任务 coverage/。
    - 主会话 2.4 提交 + 合入 + 簿记。
  Failure: 增量不达标 → 附原因审核。
  ```
- Verify: 工作目录 <WT> 根；`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、两包 `pnpm test` 全退出 0；按 S3 同形采集双包 lcov 到任务 coverage/（`<WT>`、`MAIN`、`TASK` 变量见 11-24-config-edit-skill/plan.md 步骤 9）：`node --test --experimental-test-coverage --test-reporter=lcov 'packages/core/test/*.test.ts' 'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' 'packages/core/resources/scripts/*.test.mjs' > "$TASK/coverage/lcov-core.info"`、`node --test --experimental-test-coverage --test-reporter=lcov 'packages/dsh-workloom/test/*.test.ts' > "$TASK/coverage/lcov-dsh.info"`、`node packages/core/resources/scripts/task-diff-coverage.mjs "$WT" - "$TASK/coverage/lcov-core.info" "$TASK/coverage/lcov-dsh.info" --exclude 'packages/core/dist/' --exclude 'packages/dsh-workloom/dist/' --exclude 'packages/core/test/' --exclude 'packages/dsh-workloom/test/' --exclude 'packages/core/resources/skills/' --exclude 'packages/core/resources/scripts/*.test.mjs' --exclude '.workloom/' --out-dir "$TASK/coverage" --json`；`git -C "$WT" diff --check` 退出 0。
