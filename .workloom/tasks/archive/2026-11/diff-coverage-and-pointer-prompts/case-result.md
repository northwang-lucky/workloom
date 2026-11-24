---
version: 1
task: tasks/11-24-diff-coverage-and-pointer-prompts
codeBaseline: main@2c63069; codeFingerprint=e0952d638edc5085849bc3adf59908f5f46c94ba5dc2d691d4e37a3cc303dd35
checkSession: 2952f0f9-f629-4bfc-b7a1-acc3d45719f3
status: passed
startedAt: 2026-11-24T12:39:00.000Z
completedAt: 2026-11-24T12:55:00.000Z
---

# CASE Result: 任务增量覆盖率门禁与派发注入纯指针化（容器集成）

## Summary

- Static review: `13/13`
- Runtime cases: `7/7; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 门禁消费配置与 formatHints 构造

- Status: `passed`
- Evidence: `case-gates.ts` 实测锚点——`COVERAGE_CONFIG: 'coverage_config'`（L50）、`loadConfig(worktree)`（L360）、`coverage.threshold ?? DEFAULT_THRESHOLD`（L364）、`buildFormatHints(lines.keys(), reportTexts.length, ...)`（L390）、`computeDiffCoverage({ root: worktree, ..., formatHints })`（L392）、两处 `configured threshold ${threshold}% (default ${DEFAULT_THRESHOLD}%)` 插值（L451、L454）、回退期望集合与 `supported` 缺席门（L399–L408）、`coverageReportPaths` 过滤交集产物（L225）。C2 探针 18 场景的行为面全绿（`case-evidence/c2-gate-chain-probe.log`）。
- Findings: none

### SR2 四格式复算与 formatHints 回退

- Status: `passed`
- Evidence: `coverage-compute.ts` 实测锚点——`DEFAULT_THRESHOLD` import（L15）、`EXTENSION_LANGUAGE`（L28）与 `EXECUTABLE_EXTENSIONS` 派生（L50–L52）、`detectLanguage`（L59）、`CoverageFormat` 含 `cobertura-xml`（L90）、`LANGUAGE_DEFAULTS`（L96）、`FORMAT_NORMALIZE`（L136）、`formatHints?: CoverageFormat[]`（L182）、`meetsThreshold(covered, total, threshold = DEFAULT_THRESHOLD)` 交叉乘（L186–L193）、`buildWaiver`（L195）、`inferFormat` cobertura 规则（L203–L207）、`parseCoberturaXml`（L385）、内容优先回退 hint（L478–L480）、`combineFormats`（L235–L239）、`DIFF_COVERAGE_ARTIFACTS`（L79–L87）。
- Findings: none

### SR3 coverage 配置解析

- Status: `passed`
- Evidence: `config-defaults.ts` 实测锚点——`DEFAULT_THRESHOLD = 90`（L14）、`DEFAULT_CONFIG.coverage`（L49）、`COVERAGE_PLACEHOLDER_TOKENS`（L93）、`renderCoverageCommand`（L106）、`parseCoverage`（L282）与 `unknown field (allowed: threshold, languages)` 文案（L286）。C5 探针五例非法输入的错误字段路径全为 `coverage.` 前缀。
- Findings: none

### SR4 配置合并与全局层拒绝

- Status: `passed`
- Evidence: `config-load.ts` 实测锚点——`parseCoverage` import（L28）、`GLOBAL_PROJECT_ONLY_FIELDS` 含 `coverage`（L59）、`loadConfig(root, { homeDir })`（L71）、`doc.coverage` 分支（L394–L395）、`project-level field` 文案（L291）。C5 探针全局层拒绝场景实测触发。
- Findings: none

### SR5 五角色纯指针

- Status: `passed`
- Evidence: `prompt-compose.ts` 实测锚点——`filesInlined: 0`（L219）、`isChecker` 先行 `assertCaseTemplatesReady(params.root)`（L230–L233）、Pointer list 仅非 researcher（L237）、research 指针全角色（L255）、prd 软指针句（L259）；`caseTemplates` 键 grep 0 命中。C3 探针五角色 55 项检验全绿（filesInlined 恒 0、prd 软指针句、两类哨兵不出现）。
- Findings: none

### SR6 副本指针与只读守卫

- Status: `passed`
- Evidence: `prompt-sections.ts` 实测锚点——`inlineCurrentCase`（L64）、`inlineCaseTemplates`（L87）、`assertCaseTemplatesReady`（L102）含 `rerun workloom init to refresh them`（L115）与部署残缺文案（L106）、`pointerLine`（L150）；`inlinePrdArtifact`/`extractPrdContent`/`splitH2Sections` 全仓 grep 0 命中。C3 守卫场景实测：缺失/过期仅拒 checker，developer 不受影响。
- Findings: none

### SR7 模板落盘刷新

- Status: `passed`
- Evidence: `case-templates.ts` 实测锚点——`writeFileAtomic` import（L18）、`ensureCaseTemplates`（L73）、原子覆盖（L108）、`created`/`updated` 产物（L114–L115）。C3 生命周期场景实测：全新建两副本、幂等重跑零变更、过期恰该项 updated、删除恰该项 created。
- Findings: none

### SR8 doctor 第六检查

- Status: `passed`
- Evidence: `doctor-check-rules.ts` 实测锚点——`checkCaseTemplates`（L563）与 `case_templates` issue（L569、L588）；`doctor-types.ts`（L24、L114）、`doctor-checks.ts` 六类收编（L3、L69）。C3 doctor 场景实测：播种后零 issue、缺失出 Missing、过期出 Outdated。
- Findings: none

### SR9 init 落盘扩展

- Status: `passed`
- Evidence: `commands.ts` 实测锚点——`ensureTemplates`（L119）调 `ensureCaseTemplates({ root: cwd, ... })`（L141）、失败 `console.warn` 不阻塞（L142–L144）。dsh `test/commands.test.ts` 用例「init 成功：CASE 模板副本随 init 落盘，重跑 init 刷新过期副本」通过（`case-evidence/c3-dsh-injection-tests.log`）。
- Findings: none

### SR10 config-edit skill 资产

- Status: `passed`
- Evidence: `SKILL.md` 实测锚点——description 触发列表含 coverage（L3）、`*Completion:*` 判据恰 5 处、九字段表（L25–L33 含 coverage 行 L33）、三占位符白名单行（L41）、threshold 0–100 默认 90 严格大于与四枚举（L39）、全局层拒绝指引 migrate-to-sop（L59）；`resources-manifest.ts` SKILL_ENTRIES 注册（L60）。contract-asset 49 用例全绿含 config-edit 资产 pin。
- Findings: none

### SR11 packages-scan 语言检测

- Status: `passed`
- Evidence: `scan-packages.mjs` 实测锚点——输出形态注释（L8、L11）、`detectLanguage` 单源 import（L21）、`detectPackageLanguages`（L47–L74）、条目 `languages` 非空才输出（L131–L132）、入口守卫（L454 附近）。C5 步骤 1.7 实测夹具输出 `['go','typescript']`。
- Findings: none

### SR12 packages-scan 提议与写入口

- Status: `passed`
- Evidence: `SKILL.md` 实测锚点——步骤 3 提议 coverage.languages 经 config-edit（L15）、步骤 6 写入纪律与保留既有条目（L18–L22）、Boundaries（L66）。C5 步骤 2 实测引用恰 3 处。
- Findings: none

### SR13 migrate-to-sop 引用

- Status: `passed`
- Evidence: `SKILL.md` 实测锚点——Config field migration 节（L44–L46）：项目/本地层其他通用 config 字段编辑经 `workloom-config-edit`，全局层仍用本脚本；引用恰一处。
- Findings: none

## Runtime Results

### C1 子任务归档状态与合并基线

- Status: `passed`
- Executed at: `2026-11-24T12:40:30.000Z`
- Actions:
  1. `node case-evidence/probes/c1-children-archived-probe.mjs`（只读探针：读四个子任务 task.json 与 case-result.md，git merge-base --is-ancestor 核对四个 commit，rev-parse 7997e50^）
- Observed: 四个子任务 status/stage 均 `completed`、`check.passedAt` 均非空、`case.phase === 'done'`、RESULT front-matter 均 `status: passed`；四个 feature 提交（7997e50/1a865b0/2144ef2/bec79fa）全部是 HEAD 祖先；`7997e50^ = 4b5454f` 合并基线钉死。探针判定 PASS（退出码 0）。
- Evidence:
  - `case-evidence/c1-children-archived.log`
- Findings: none

### C2 S1+S4 增量门禁链路

- Status: `passed`
- Executed at: `2026-11-24T12:47:27.000Z`
- Actions:
  1. `HOME=<mktemp 空目录> node case-evidence/probes/c2-gate-chain-probe.mjs`（mktemp 夹具仓库 + light 任务夹具 + 四格式报告夹具；函数级调用 dist 的 evaluateCaseOutcomeGate/listCaseChangedLines/checkTask；夹具留档 `case-evidence/fixtures/c2/`）
- Observed: 18 个场景全绿——三点口径提取区间逐值一致（a.ts 1–10、b.go 5、C.java 4、d.kt 1–3、readme 1）；基线 15/15 问题列表为空（夹具合法）；默认 90：13/15 拒（文案含 `configured threshold 90%`）、14/15 过；配置 80：12/15 恰等阈值拒（文案含 `80%`）、13/15 过、删配置回退 90 再拒；豁免四态（匹配过、指纹失配 coverage_waiver、无豁免 coverage_waiver、高于阈值声明 below_threshold coverage_status）；checkTask 链路（豁免持久化 `{reason, fingerprint, at, source: 'main'}`、复查继承同值、指纹翻转后不带豁免与 force 双调用均拒且文案含 `cannot be bypassed with force`、task.json 字节不变 overrides 空、新豁免按当前指纹重建）；e.rs 缺席硬拒 coverage_missing_file 且 readme 非可执行不触发；unsupported 回退自报 14/15 过、13/15 拒（回退阈值仍硬）且缺席检测跳过。
- Evidence:
  - `case-evidence/c2-gate-chain-probe.log`
  - `case-evidence/fixtures/c2/go.out`
  - `case-evidence/fixtures/c2/lcov.info`
  - `case-evidence/fixtures/c2/jacoco.xml`
  - `case-evidence/fixtures/c2/cobertura.xml`
- Findings: none

### C3 S2 纯指针注入与模板生命周期

- Status: `passed`
- Executed at: `2026-11-24T12:48:40.000Z`
- Actions:
  1. `node case-evidence/probes/c3-pointer-injection-probe.mjs`（mktemp 夹具根 + task.json light 记录 + jsonl 条目指向存在文件 + 哨兵断言；探针经 dist 调 buildExecutorPrompt/ensureCaseTemplates/checkCaseTemplates/loadCaseTemplateText）
  2. `cd packages/dsh-workloom && node --test test/commands.test.ts test/executor.test.ts test/case-executor.test.ts test/discipline-text.test.ts`
- Observed: 探针 55 项检验全绿——五角色 `filesInlined === 0`、prd 软指针句（`consult .workloom/tasks/probe-t1/prd.md before deciding`）逐角色出现、prd 哨兵不出现；非 researcher 含 Pointer list 与 plan/jsonl 条目指针、researcher 无 Pointer list 含 research 指针；checker 含 case.md 与两份模板副本三指针行、case 哨兵与模板注释整行不出现、其他角色无 case.md 指针；守卫缺失/过期仅拒 checker（文案含 `rerun workloom init`）；生命周期三态（新建 2、幂等零、过期恰该项 updated、缺失恰该项 created）；doctor 播种零 issue、Missing/Outdated 各出 case_templates。dsh 侧 146 用例全绿（含 init 落盘刷新、注入统计、纪律句钉住）。
- Evidence:
  - `case-evidence/c3-pointer-injection-probe.log`
  - `case-evidence/c3-dsh-injection-tests.log`
- Findings: none

### C4 S3 skill 资产与注册

- Status: `passed`
- Executed at: `2026-11-24T12:49:20.000Z`
- Actions:
  1. 单次 shell 批量 grep（config-edit/packages-scan/migrate-to-sop 三个 SKILL.md 与 resources-manifest.ts 的锚点核对）
  2. `cd packages/core && node --test test/contract-asset.test.ts`
  3. `cd packages/dsh-workloom && node --test test/skills.test.ts`
- Observed: `*Completion:*` 计数 5；九字段表行全部命中（coverage 行 L33）；三占位符白名单行命中（L41）；全局层拒绝指引命中（L59）；frontmatter 触发列表含 coverage；packages-scan 引用 3 处（步骤 3/步骤 6/Boundaries）；migrate-to-sop 引用 1 处含项目/本地层限定；SKILL_ENTRIES 注册命中。contract-asset 49/49 通过（含「config-edit 资产 pin：SKILL.md、workflow Principles 指引句、spec 条目与收编引用」）；skills 14/14 通过（skill 清单契约含 workloom-config-edit）。
- Evidence:
  - `case-evidence/c4-skill-assets.log`
  - `case-evidence/c4-contract-asset-tests.log`
  - `case-evidence/c4-skills-tests.log`
- Findings: none

### C5 S4 配置驱动

- Status: `passed`
- Executed at: `2026-11-24T12:50:10.000Z`
- Actions:
  1. `HOME=<mktemp 空目录> node case-evidence/probes/c5-config-driven-probe.mjs`（loadConfig 解析/非法五例/全局层拒绝/buildFormatHints/formatHints 回退/脚本 --check 子进程/scan-packages 子进程/SKILL 引用）
- Observed: 18 项检验全绿——无 config 时 threshold 90 且 languages 空；自定义 threshold 80 与 python 条目原样解析；非法五例（threshold 101/'90'/未知子字段/format 'xml'/占位符 `<tool>`）错误字段路径均为 `coverage.` 前缀；隔离 HOME 全局层拒绝文案含 `project-level field`；buildFormatHints 单 ts 广播 `['lcov','lcov']`、config 归一 `['go','go']`、多语言与非内置 undefined；`computeDiffCoverage` unsupported 内容回退 hint（format 'lcov'）、无 hint 保持 unsupported；脚本 `--check` threshold 80 输出 `Threshold: 80% / Pass: yes`、threshold 90 输出 `Threshold: 90% / Pass: no`（9/10 恰等阈值不达标）；scan-packages 夹具输出 `languages: ['go','typescript']`；SKILL 引用 3 处。
- Evidence:
  - `case-evidence/c5-config-driven-probe.log`
- Findings: none

### C6 合并一致性

- Status: `passed`
- Executed at: `2026-11-24T12:50:40.000Z`
- Actions:
  1. 单次 shell 批量 grep + git diff 核对（DEFAULT_THRESHOLD/EXTENSION_LANGUAGE 单源、90% ripple、S2 残留、workflow version、spec 条目计数）
- Observed: `DEFAULT_THRESHOLD` 定义恰一行（config-defaults.ts:14），其余 14 处命中全为 import/引用/注释/d.ts 声明；`total * 90` 类字面量零命中。`EXTENSION_LANGUAGE` 定义恰一处（coverage-compute.ts:28）且 `'.go':` 映射仅表内命中。case-gates 插值文案恰两处（L451、L454）；workflow.md `default 90%` 恰两处（L97、L113）；spec `default 90` 恰两处（L9 incremental-coverage、L10 coverage-config）。executor-injection 与 prompt-compose 的 caseTemplates 残留均为空。`git diff 4b5454f..HEAD -- workflow.md` 无 version 行增删；spec 四条目各恰一行。
- Evidence:
  - `case-evidence/c6-merge-consistency.log`
- Findings: none

### C7 标准验证全表与双轨自身证据

- Status: `passed`
- Executed at: `2026-11-24T12:54:10.000Z`
- Actions:
  1. `pnpm -r build` → `case-evidence/c7-build.log`
  2. `pnpm -r typecheck` → `case-evidence/c7-typecheck.log`
  3. `pnpm lint` → `case-evidence/c7-lint.log`
  4. `cd packages/core && pnpm test` → `case-evidence/c7-core-tests.log`
  5. `cd packages/dsh-workloom && pnpm test` → `case-evidence/c7-dsh-tests.log`
  6. `git status --porcelain packages/core/dist packages/dsh-workloom/dist` → `case-evidence/c7-dist-status.log`
  7. 双轨采集（Coverage 节 Aggregate command 原文执行）：两条 `node --test --experimental-test-coverage`（spec 日志 + lcov 产物）+ 轨道二脚本（HOME 隔离、`--check`）+ 指纹脚本
  8. 轨道二核对与单文件交叉核对（独立从 changed-lines.json × lcov-core.info 复算）
  9. 轨道一旧门禁口径核对（`git status --porcelain` 非 .workloom 集合）
  10. 变更集审计（git status + `git diff --name-only 4b5454f...HEAD` + 归属机械核对）
  11. `node packages/core/resources/scripts/task-fingerprint.mjs "$MAIN"` → `case-evidence/c7-fingerprint.txt`
- Observed: 步骤 1–5 退出码全 0（core 800 用例、dsh 213 用例，0 fail，lint 无告警）；步骤 6 输出为空（dist 重建字节一致，与 src 同 commit 同步）；步骤 7 轨道二产出 `format: lcov`、`overall: 1653/1709`、`missingExecutableFiles: []`、`--check` 输出 `Threshold: 90% / Pass: yes`；步骤 8 交叉核对 coverage-compute.ts 独立复算 521/526 与 diff-coverage.json 完全一致（差异 0/0）；步骤 9 非 .workloom 未提交集合仅 `research/`（Exclusions 命中，旧门禁期望集合为空）；步骤 10 变更集 119 个非 .workloom 文件、85 个排除命中、34 个可归属（容器 SR 目标/聚合命令/子任务 CASE 覆盖文本）、0 个无归属；步骤 11 指纹 `e0952d638edc5085849bc3adf59908f5f46c94ba5dc2d691d4e37a3cc303dd35`。
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
  - `case-evidence/c7-change-set-audit.md`
  - `case-evidence/c7-fingerprint.txt`
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`
- Findings: none

## Coverage

- Status: `generated`
- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter；轨道二增量交集经合并后的 `packages/core/resources/scripts/task-diff-coverage.mjs`（HOME 隔离、`--check` 复证 `Threshold: 90% / Pass: yes`）
- Command:
  ```bash
  cd <MAIN>
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination=<task>/case-evidence/c7-core-coverage-run.log \
    --test-reporter=lcov --test-reporter-destination=<task>/coverage/lcov-core.info \
    'packages/core/test/*.test.ts' \
    'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' \
    'packages/core/resources/scripts/*.test.mjs'
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination=<task>/case-evidence/c7-dsh-coverage-run.log \
    --test-reporter=lcov --test-reporter-destination=<task>/coverage/lcov-dsh.info \
    'packages/dsh-workloom/test/*.test.ts'
  HOME=<task>/case-evidence/home node packages/core/resources/scripts/task-diff-coverage.mjs <MAIN> 4b5454f \
    <task>/coverage/lcov-core.info <task>/coverage/lcov-dsh.info \
    --exclude 'packages/core/dist/' --exclude 'packages/dsh-workloom/dist/' \
    --exclude 'packages/core/test/' --exclude 'packages/dsh-workloom/test/' \
    --exclude 'packages/core/resources/scripts/task-diff-coverage.test.mjs' \
    --exclude 'packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts' \
    --exclude 'research/' --exclude '.workloom/' \
    --out-dir <task>/coverage --check
  ```
- Overall lines: `1653/1709 (96.7%)`
- Raw reports:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`

### Changed Files

轨道一旧门禁口径：容器无 worktree，旧门禁按主检出工作区未提交集合核对文件集，非 `.workloom/` 未提交项仅 `research/`（已排除），期望集合为空，故本表为空；上表数字为轨道二 `4b5454f...HEAD` 增量实值（26 个文件逐文件明细见 `coverage/diff-coverage.json` 与 `case-evidence/c7-diff-coverage-stdout.txt`）。

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/dist/` | `构建产物，镜像 src；C7 步骤 4 dist-mirror 守卫与步骤 6 git 状态验同 commit 同步` |
| `packages/dsh-workloom/dist/` | `构建产物，镜像 src；C7 步骤 5 dist-mirror 守卫与步骤 6 git 状态验同 commit 同步` |
| `packages/core/test/` | `四子任务合并的测试夹具与门禁/交集/注入/config 用例自身；C2 至 C5 与 C7 验全绿` |
| `packages/dsh-workloom/test/` | `dsh schema/注册/注入钉住用例自身；C3 步骤 6 与 C7 验全绿` |
| `packages/core/resources/scripts/task-diff-coverage.test.mjs` | `脚本单测自身；C5 与 C7 验全绿（脚本本体留 scope 内，由该单测运行覆盖）` |
| `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts` | `扫描单测自身；C5 步骤 1.7 与 C7 验全绿（scan-packages.mjs 本体留 scope 内，由该单测运行覆盖）` |
| `research/` | `无关未跟踪研究材料（minimax 调研笔记，先于本任务存在、不在四子任务变更集内）；旧门禁按工作区未提交集合核对文件集，须排除该目录使期望集合为空；三点口径本不含未跟踪文件，对轨道二为冗余保险` |
| `.workloom/` | `任务簿记与各子任务 chore 提交的任务文档，非代码；C1 只读归档态核对` |

### Collection Failure

none

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | 0 | `case-evidence/c7-build.log` |
| `pnpm -r typecheck` | 0 | `case-evidence/c7-typecheck.log` |
| `pnpm lint` | 0 | `case-evidence/c7-lint.log` |
| `cd packages/core && pnpm test` | 0 | `case-evidence/c7-core-tests.log`（800 用例 0 fail） |
| `cd packages/dsh-workloom && pnpm test` | 0 | `case-evidence/c7-dsh-tests.log`（213 用例 0 fail） |

## Resolved Findings

- `case.md:222` [P2] C2 步骤 8.3 期望码写错：below_threshold 无豁免按门禁实际行为报 `coverage_waiver` 而非 `coverage_threshold` — fixed: 修订期望为 `coverage_waiver` 并注明文案指向 codeFingerprint 失配；C2 探针按修订后期望全绿
- `case.md:223` [P2] C2 步骤 9 第三段失配场景设计缺陷：传新 coverageWaiver 会读取当前 RESULT 指纹恒匹配，无法触发失配拒绝 — fixed: 改为「不带豁免复查 + force」双调用走存量豁免回退路径，并补「新豁免按当前指纹重建」语义；探针 S9c/S9d 按修订后全绿
- `case.md:248` [P2] C3 步骤 2.2 的 prd 软指针形态描述错误：实际是整句 `consult ... before deciding` 而非 `- <path>` 指针行 — fixed: 修订为整句形态描述；探针按整句断言通过
- `case.md:252` [P2] C3 步骤 4 生命周期产物口径不准：`created`/`updated` 取 `.workloom/templates/` 相对根全相对路径，且改写与删除应分列场景 — fixed: 修订为全相对路径口径与分列场景；探针四场景全绿
- `case.md:319` [P2] C6 步骤 2 的 spec grep 形态写错：coverage-config 条目写 `default 90,`（无百分号），`default 90%` 只命中 incremental-coverage 一处 — fixed: 改为 `default 90` 双命中口径并注明两条目写法差异；核对 2 处成立
- `case.md:345` [P2] C7 步骤 10 的归属审计口径过严：容器集成 CASE 不重审子任务内部逐文件，非排除变更文件的归属应为「容器 SR 目标/聚合命令/子任务 CASE 覆盖文本」三选一 — fixed: 修订为三选一口径并附机械核对方式；审计 0 无归属

## Open issues

- none
