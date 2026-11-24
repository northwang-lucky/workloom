---
version: 1
task: tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config
codeBaseline: workloom/11-24-coverage-config uncommitted worktree on main@826501d; codeFingerprint=0515bb32ab84f989f885c240ca54cf49ff483c3758d6daab6dcb27473bd9c43e
checkSession: 62fbc6c9-b089-4d5c-a5d7-e3b436012b3f
status: passed
startedAt: '2026-11-24T11:03:00.000Z'
completedAt: '2026-11-24T11:30:00.000Z'
---

# CASE Result: 覆盖率工具配置驱动与内置默认

## Summary

- Static review: `17/17`
- Runtime cases: `6/6; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 config 类型面 config.d.ts

- Status: `passed`
- Evidence: `packages/core/src/workspace/config.d.ts:38` 导出 `CoverageFormatLiteral` 四枚举（go-coverprofile/lcov/jacoco-xml/cobertura-xml）；`:41-44` `CoverageLanguageConfig` + `CoverageConfig { threshold: number; languages: Record<string, CoverageLanguageConfig> }`；`:27-28` `WorkloomConfig.coverage` 必填字段带项目层中文 JSDoc；既有字段与导出签名逐字不变；dist 锚点同步由 dist-dts 守卫在 C5 步骤 4 通过（`case-evidence/c5-core-tests.log`）。
- Findings: `none`

### SR2 config 默认值与校验器 config-defaults

- Status: `passed`
- Evidence: `packages/core/src/workspace/config-defaults.ts:14` `DEFAULT_THRESHOLD = 90` 单源；`:49` `DEFAULT_CONFIG.coverage`；`:93-113` `COVERAGE_PLACEHOLDER_TOKENS` 封闭三 token（<worktree>/<profile>/<base-ref>）+ `renderCoverageCommand`（白名单外 `<…>` 抛 WorkloomConfigError）；`:253-318` `parseCoverage`（threshold 0–100 整数专用文案 "must be an integer between 0 and 100"、format 四枚举、command 占位符校验、未知子字段 fail loud，field 路径逐项）。行为面经 C1 探针 14 场景全过（`case-evidence/c1-config-probe.log`）。说明：白名单常量按本文件 `SETUP_PLACEHOLDER_TOKENS` 先例保持私有（render 函数与校验行为为公开面，d.ts 锚点声明 `renderCoverageCommand`/`parseCoverage`/`DEFAULT_THRESHOLD`），SR2 检查 4 的"导出"措辞据此按先例解释为渲染函数导出；封闭性与 fail loud 经 C1 场景 F、C2 场景 G 验证。
- Findings: `none`

### SR3 config 三层合并 config-load

- Status: `passed`
- Evidence: `packages/core/src/workspace/config-load.ts:59` `GLOBAL_PROJECT_ONLY_FIELDS` 加入 `coverage`；`:394-396` `mergeWithDefaults` 新增 `doc.coverage` 分支经 `parseCoverage` 整体替换；全局白名单未加 coverage；`loadConfig` 签名与其余分支逐字不变。全局层拒绝经 C1 场景 G2（文案 "coverage is a project-level field"）验证。
- Findings: `none`

### SR4 计算源扩展 coverage-compute

- Status: `passed`
- Evidence: `packages/core/src/task/coverage-compute.ts:90` `CoverageFormat` 六成员含 `cobertura-xml`；`:385-405` `parseCoberturaXml`（class filename 经 resolveReportPath 归一、line number/hits、hits>0 覆盖、根缺失 err、同文件多 class 取并）；`:203-209` `inferFormat` 新增 `<coverage` + `<lines>` 规则、既有三规则不变；`:477-481` 逐报告内容推断优先、unsupported 回退 `formatHints[index]`；`:186-194` `meetsThreshold` 第三参缺省 `DEFAULT_THRESHOLD` 整数交叉乘；`:96-134` `LANGUAGE_DEFAULTS` 九语言键 format 映射逐键正确（go→go-coverprofile，ts/js/python/rust/c/cpp→lcov，java/kotlin→jacoco-xml）、command 骨架与 plan 一致（go 含 go test 与 <profile>、java 含 gradle）；`:28-58` `EXTENSION_LANGUAGE` 20 后缀单源、`EXECUTABLE_EXTENSIONS` 由键派生、`detectLanguage` 未命中与 .d.ts 返回 null；`:136-141` `FORMAT_NORMALIZE`。文件 526 行 ≤600；无写文件副作用。行为经 C2 探针 A–H 全过。
- Findings: `none`

### SR5 门禁消费配置 case-gates

- Status: `passed`
- Evidence: `packages/core/src/task/case-gates.ts:357-363` `loadConfig(worktree)` 抛错追加 `coverage_config`（ISSUE_CODES `:50`），不抛裸异常；`:388-390` formatHints 经 `buildFormatHints` 单源构造；`:449` `meetsThreshold` 传入配置阈值；`:451/:454` 两条 issue 文案含 `configured threshold` 与阈值插值（默认值经 `DEFAULT_THRESHOLD` 插值，无裸 90 字面量重复定义——P2 修复见 Resolved Findings）；其余问题码只增 coverage_config、豁免/缺席/not_applicable 分支语义不变；文件 479 行 ≤600。行为经 C3 探针 A–G 全过（80.0 拒/80.1 过、缺省 90、coverage_config、.elm 回退、单语言广播 vs 多语言纯推断）。
- Findings: `none`

### SR6 workflow 2.3 文案同步

- Status: `passed`
- Evidence: `packages/core/resources/workflow/workflow.md:97` "strictly greater than the configured threshold (default 90%, `coverage.threshold`)"；`:113` "above the configured threshold (default 90%)"；`git diff main` 无 `version:` 行增删（`case-evidence/c5-asset-sync.log` 第 7 组核对）；英文文本；其余句子不改。
- Findings: `none`

### SR7 采集脚本消费配置 task-diff-coverage

- Status: `passed`
- Evidence: `packages/core/resources/scripts/task-diff-coverage.mjs:14-21` import `loadConfig` 与 `buildFormatHints`/`meetsThreshold`（全部 dist，不 import src）；`:94-98` `main` 读 `loadConfig(root)`（非法配置原样抛错非零退出，C4 场景 F）并传 formatHints；`:100-107` `--check` 按配置阈值输出 `Threshold: N%` + `Pass: yes/no`（JSON 合并 threshold/pass 字段），无 `--check` 输出形态不变（C4 场景 C）；usage 含 `--check`；既有 `--json`/`--out-dir`/`--exclude`/位置参数行为不变（既有用例全绿）。
- Findings: `none`

### SR8 包扫描语言检测 scan-packages

- Status: `passed`
- Evidence: `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs:21` 静态 import core dist 的 `detectLanguage`（上溯四级，仓库与发布布局同形——migrate-config 先例；单源无第二映射）；`:52-78` `detectPackageLanguages`（排除目录跳过、深度上限 6、排序去重）；`:131-132/:443-444` 候选条目与 repo 根条目挂 `languages`；既有候选检测规则不变（既有单测回归全绿）。语言栈集合判定经 C4 探针二（{go,typescript,java}、纯文档空集、repo 根条目回归）。
- Findings: `none`

### SR9 packages-scan SKILL 提议 coverage

- Status: `passed`
- Evidence: `packages/core/resources/skills/workloom-packages-scan/SKILL.md:15` 新步骤 3 Propose coverage defaults（据 LANGUAGE_DEFAULTS 提议、经 workloom-config-edit 与 packages 一并确认、无内置默认的语言标注 manual format/command 不猜默认）；`:16-22` 展示/确认/写入步骤联动；`:3` description 提及 coverage 提议；`:61` 旧 `scan-packages.test.js` 引用同步为 `.test.ts`（全文零命中旧名）；`:66-67` Boundaries 更新；英文文本；setup 指引不变。
- Findings: `none`

### SR10 config-edit 字段清单同步

- Status: `passed`
- Evidence: `packages/core/resources/skills/workloom-config-edit/SKILL.md:33` 白名单表新增 `coverage` 行（九字段，既有 8 字段不删）；`:21` 计数句改 "The nine snake_case top-level keys"（完整句式 `The eight snake_case` 零命中）；`:35-60` Coverage configuration 节含 threshold/languages/四枚举/三占位符说明与 JSON 示例（示例经 loadConfig 合法，C1 场景 B 同形配置实测通过）；`:3` description 触发列表加 coverage；五步纪律/Boundaries/doctor 句不改。
- Findings: `none`

### SR11 spec 新条目与阈值句同步

- Status: `passed`
- Evidence: `.workloom/spec/repo/workflow/index.md:10` 新增单行英文 `- coverage-config:` 条目（默认 90 可配、四格式、白名单 fail loud、内置语言与 EXTENSION_LANGUAGE 单源、非内置 unsupported 回退阈值硬、packages-scan 经 config skill）；`:9` incremental-coverage 条目阈值句改为 "configurable via `coverage.threshold` (default 90%)" 并补 Cobertura 格式；既有条目不删；改动在 worktree 分支副本（`c5-change-set.log` 首行）。
- Findings: `none`

### SR12 config.test.ts coverage 用例

- Status: `passed`
- Evidence: `packages/core/test/config.test.ts:1665-1751` 五个 coverage 用例：缺省（`:1665`）、自定义回读（`:1677`）、非法 threshold/format/未知子字段/未知占位符七形态含字符串 '90'（`:1703`，P2 补测）、全局层项目字段（`:1728`）、renderCoverageCommand 三 token 与未知 token（`:1741`）；HOME 隔离沿用 homeDir 注入；既有用例不删；`node --test test/config.test.ts` 85 用例全绿（`case-evidence/c1-config-tests.log` 退出码 0）。
- Findings: `none`

### SR13 coverage-compute.test.ts 扩展用例

- Status: `passed`
- Evidence: `packages/core/test/coverage-compute.test.ts:324-420` 新用例：cobertura 复算（`:324`）、根缺失 err + inferFormat 区分（`:343`）、cobertura+lcov 混合 → mixed（`:352`，P2 补测）、formatHints 内容优先与回退（`:375`）、meetsThreshold 参数化（`:401`）、detectLanguage/同源（`:409`）、buildFormatHints 广播/undefined（`:421`）、内置默认与占位符白名单（`:431`）；既有用例不删；全绿（`case-evidence/c2-compute-tests.log` 退出码 0，新用例名逐条可定位）。
- Findings: `none`

### SR14 case.test.ts 门禁配置用例

- Status: `passed`
- Evidence: `packages/core/test/case.test.ts:23-25` 模块级 HOME 重定向（command-ops.test.ts 先例口径，node --test 每文件独立进程，无需 finally 恢复）；`:718` 配置阈值 80（80.0 拒/80.1 过）；`:737` below_threshold 达标矛盾（P2 补测，覆盖 case-gates:451）；`:750` coverage_config 不抛裸异常；`:762` 非内置回退（拒/过/not_applicable 反规避三态，P2 扩展）；`:788` 门禁 formatHints 单语言广播/多语言纯推断（P2 补测）；`:15` 既有 90 边界与 unsupported 自报回退用例保持（仅夹具文件名按 formatHints 语义换为 notes.md，属必要 ripple）；全绿（`case-evidence/c3-case-tests.log` 退出码 0）。
- Findings: `none`

### SR15 contract-asset.test.ts 钉住更新

- Status: `passed`
- Evidence: `packages/core/test/contract-asset.test.ts:1148-1149` workflow 两句 pin 更新为新文案（含 configured threshold/default 90%）；`:1172` 字段遍历加 `coverage`、`:1175-1176` nine 句与 coverage 示例 pin；`:1197-1200` spec coverage-config 条目 pin；`:1208-1220` packages-scan 步骤 6/Boundaries/Propose coverage defaults/旧 .test.js 完整文件名缺席 pin；既有 pin 不删；全绿（`case-evidence/c5-core-tests.log`）。
- Findings: `none`

### SR16 task-diff-coverage.test.mjs 脚本用例

- Status: `passed`
- Evidence: `packages/core/resources/scripts/task-diff-coverage.test.mjs:9-11` HOME 模块级隔离；`:119` CLI --check 判定极性（threshold 90 pass/threshold 100 fail、markdown `Pass: no`、无 --check 时 pass 字段 undefined）；`:139` CLI 读 config languages（单语言 unsupported 内容回退内置默认 format，显式配置 cobertura 后解析器分派改变）；既有用例不删；全绿（`case-evidence/c4-script-tests.log` 退出码 0）。
- Findings: `none`

### SR17 scan-packages.test.ts 语言检测用例

- Status: `passed`
- Evidence: `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts:67-92` 语言检测用例：三语言恰检出、.d.ts/README 忽略、repo 根条目并集、纯文档目录空集对照（P2 补测）；既有用例不删；临时目录 finally 清理；全绿（`case-evidence/c4-script-tests.log`）。SR8 采 import 方案（单源由 import 构成），一致性用例按检查 2 的"以实现为准"不适用。
- Findings: `none`

## Runtime Results

### C1 config 解析探针：默认、自定义、fail loud 与全局拒绝

- Status: `passed`
- Executed at: `2026-11-24T11:23:30.000Z`
- Actions:
  1. `cd <WT>/packages/core && node --test test/config.test.ts`（记录退出码与 coverage 用例名，输出存 `case-evidence/c1-config-tests.log`）。
  2. `node case-evidence/probes/c1-config-coverage-probe.mjs`（经 dist `workspace/config-load.js` 直调 `loadConfig(root, { homeDir })`，14 场景）。
- Observed: 步骤 1 退出码 0（85 用例全绿，coverage 用例名可定位）；探针 14 场景全 PASS——A 默认 `{threshold:90,languages:{}}`、B 自定义逐字段回读、C 四非法 threshold（90.5/-1/101/'90'）均抛 WorkloomConfigError 且 field=coverage.threshold、文案不含 "0 means unlimited"、D 非法 format field=coverage.languages.java.format、E 两未知子字段 field 对应路径、F 未知占位符 `<unknown>`、G1 全局无 coverage 不影响默认、G2 全局 coverage 报 "coverage is a project-level field"。
- Evidence:
  - `case-evidence/c1-config-tests.log`
  - `case-evidence/c1-config-probe.log`
- Findings: `none`

### C2 cobertura 复算与 formatHints 探针

- Status: `passed`
- Executed at: `2026-11-24T11:23:40.000Z`
- Actions:
  1. `cd <WT>/packages/core && node --test test/coverage-compute.test.ts`（输出存 `case-evidence/c2-compute-tests.log`）。
  2. `node case-evidence/probes/c2-cobertura-hints-probe.mjs`（夹具 `case-evidence/fixtures/c2/cobertura.xml`，A–H 八场景）。
- Observed: 步骤 1 退出码 0；探针全 PASS——A 复算 `src/main/App.java` 3/4（uncovered {4}）、overall 3/4、format cobertura-xml、filename 后缀命中；B 根缺失 err "cobertura <coverage> element not found"；C inferFormat cobertura-xml vs jacoco-xml 正确区分；D 内容优先（hint lcov 被内容覆盖）；E 空 cobertura（无 <lines>）+ hint → format cobertura-xml、missingExecutableFiles=['src/A.java']；F 多语言无 hint 纯推断 lcov（2/3）；G renderCoverageCommand 渲染与未知 token err；H 边界 800/1000@80=false、801/1000@80=true、90/100@default=false、91/100@default=true。
- Evidence:
  - `case-evidence/c2-compute-tests.log`
  - `case-evidence/c2-cobertura-hints-probe.log`
  - `case-evidence/fixtures/c2/cobertura.xml`
- Findings: `none`

### C3 门禁配置探针：阈值、回退与 coverage_config

- Status: `passed`
- Executed at: `2026-11-24T11:23:50.000Z`
- Actions:
  1. `cd <WT>/packages/core && node --test test/case.test.ts`（输出存 `case-evidence/c3-case-tests.log`，用例定位见 `case-evidence/c3-case-test-checklist.md`）。
  2. `node case-evidence/probes/c3-gate-config-probe.mjs`（dist `task/case-gates.js` 函数级直调，HOME 隔离，A–G 七场景，夹具镜像 case.test.ts 形态）。
- Observed: 步骤 1 退出码 0；探针全 PASS——A threshold 80 自报 800/1000 (80.0%) → 含 coverage_threshold 且不含 coverage_recompute；B 801/1000 (80.1%) → 问题码空；C 缺省 90（900/1000 拒、901/1000 过）；D threshold -1 → 恰 `[coverage_config]`（函数正常返回）；E .elm 变更 + unsupported 报告 → 80/100 拒（阈值硬）、81/100 过、not_applicable 仍含 coverage_not_applicable（反规避）；F 单语言 java + cobertura-xml 提示 + 空 cobertura → 含 coverage_missing_file（提示使机械复算生效）；G 多语言同报告 → 无 missing 且问题码空（纯推断回退）。
- Evidence:
  - `case-evidence/c3-case-tests.log`
  - `case-evidence/c3-case-test-checklist.md`
  - `case-evidence/c3-gate-config-probe.log`
- Findings: `none`

### C4 脚本消费与包扫描语言检测探针

- Status: `passed`
- Executed at: `2026-11-24T11:24:00.000Z`
- Actions:
  1. `cd <WT>/packages/core && node --test resources/scripts/task-diff-coverage.test.mjs resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts`（输出存 `case-evidence/c4-script-tests.log`）。
  2. `node case-evidence/probes/c4-script-config-probe.mjs`（CLI 子进程、env HOME 隔离、三夹具 worktree，A–F 六场景）。
  3. `node case-evidence/probes/c4-packages-scan-probe.mjs`（mktemp 项目直跑 scan-packages CLI）。
- Observed: 步骤 1 退出码 0；探针一全 PASS——A `--check` threshold=80 pass=false（80.0% ≤ 80）、B 9/10 → pass=true 且 markdown `Pass: yes`、C 无 `--check` 时 JSON 无 threshold/pass 字段、D 单语言 java + config cobertura-xml + 空 cobertura → format=cobertura-xml（广播生效）、E 多语言 → format=unsupported（纯推断）、F config threshold -1 → 非零退出 stderr 含 coverage.threshold 错误。探针二全 PASS——多语言夹具语言栈恰 {go,java,typescript}（repo 条目挂载）、纯文档目录空集、repo 根条目回归不变。
- Evidence:
  - `case-evidence/c4-script-tests.log`
  - `case-evidence/c4-script-config-probe.log`
  - `case-evidence/c4-packages-scan-probe.log`
- Findings: `none`

### C5 标准验证全表、资产同步与 dist 守卫

- Status: `passed`
- Executed at: `2026-11-24T11:25:00.000Z`
- Actions:
  1. `pnpm -r build`；2. `pnpm -r typecheck`；3. `pnpm lint`；4. `cd packages/core && pnpm test`；5. `cd packages/dsh-workloom && pnpm test`（五份日志逐份落 case-evidence：build/typecheck/lint/core-tests/dsh-tests）。
  6. dist 状态核对（`case-evidence/c5-dist-status.log`）。
  7. 资产同步七组 grep（`case-evidence/c5-asset-sync.log`）。
  8. `git diff --check`。
  9. 变更集审计（`case-evidence/c5-change-set.log`）。
- Observed: 步骤 1–5 退出码均 0；core 800 用例 0 fail（含 dist-mirror/dist-dts/contract-asset/case-templates 守卫）、dsh 213 用例 0 fail、lint 无告警；dist 变更为 core 11 文件（非空属预期：随 src 同批重建，同 commit 由主会话 2.4 提交；dsh 无 src 变更故 dist 无差异）；资产核对全过（coverage 表行/nine 句/示例/workflow 两句/packages-scan coverage 三处/旧 test.js 零命中/spec coverage-config 恰一行/COVERAGE_CONFIG 定义与使用处/六文件行数 ≤600/version 不升）；`git diff --check` 无输出；变更集 28 项，非排除文件恰为六个可执行源码文件且全部有 SR 目标（config-defaults/config-load/coverage-compute/case-gates/task-diff-coverage/scan-packages），无 CASE 缺项。
- Evidence:
  - `case-evidence/c5-build.log`
  - `case-evidence/c5-typecheck.log`
  - `case-evidence/c5-lint.log`
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-dist-status.log`
  - `case-evidence/c5-asset-sync.log`
  - `case-evidence/c5-change-set.log`
- Findings: `none`

### C6 本任务自身增量覆盖率证据（双轨）与指纹

- Status: `passed`
- Executed at: `2026-11-24T11:26:00.000Z`
- Actions:
  1. 路径解析与目录准备（`coverage/`、`case-evidence/home` HOME 隔离目录）。
  2. 双包 lcov 采集（Aggregate command 三 glob + dsh glob，spec 输出逐份存 case-evidence 的 c6-core-coverage-run.log 与 c6-dsh-coverage-run.log）。
  3. 轨道二：Aggregate command 的 `task-diff-coverage.mjs` 命令原样执行（HOME 隔离、排除集与 CASE Exclusions 逐项相同）。
  4. 轨道二断言核对。
  5. 单文件交叉核对（coverage-compute.ts 手算 vs 脚本值，`case-evidence/c6-cross-check.md`）。
  6. `--check` 复证（同参数追加 `--check`）。
  7. 轨道一整文件汇总（探针 `case-evidence/probes/c6-lcov-summary.mjs` → `coverage/whole-file-summary.md`）。
  8. 指纹：`node packages/core/resources/scripts/task-fingerprint.mjs "$WT"`。
  9. 旧门禁真跑验证（轨道一验收闭环）：`git worktree --detach` 取 7997e50^（S1 合入前、运行中插件口径的门禁代码），node 直跑该提交的 `evaluateCaseOutcomeGate` 对真实 task.json 与本 RESULT 求值，输出存 `case-evidence/c6-old-gate-validation.log`（临时 worktree 已清理）。
- Observed: 轨道二 `format=lcov`、`missingExecutableFiles=[]`、`overall=377/379（99.5%）>90%`、`files` 恰为六个可执行文件（Developer 自证据 `coverage/summary.json` 336/337 未含 scan-packages.mjs，执行轮重采为准，两侧均达标）；交叉核对 coverage-compute.ts 手算 161/161 与脚本值完全一致（差异 0）；`--check` 输出 threshold=90 pass=true；轨道一整文件汇总 2250/2306（97.6%）；指纹 `codeFingerprint=0515bb32…d9c43e`（最后一次代码修复之后计算）；旧门禁真跑 issue count=0（RESULT 以旧格式过旧门禁）。残留未覆盖变更行仅 scan-packages.mjs L61–62（readdirSync 防御性 IO catch，无业务语义，见 `case-evidence/c6-cross-check.md`）。
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
  - `case-evidence/c6-old-gate-validation.log`
- Findings: `none`

## Coverage

- Status: `generated`
- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter；轨道二增量交集经本任务配置化的 `packages/core/resources/scripts/task-diff-coverage.mjs`（HOME 隔离、`--check` 复证 threshold=90 pass）
- Command:
  ```bash
  node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov-core.info 'packages/core/test/*.test.ts' 'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' 'packages/core/resources/scripts/*.test.mjs'
  node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov-dsh.info 'packages/dsh-workloom/test/*.test.ts'
  HOME=<isolated> node packages/core/resources/scripts/task-diff-coverage.mjs <WT> - coverage/lcov-core.info coverage/lcov-dsh.info <CASE Exclusions 逐项 --exclude> --out-dir coverage --json
  ```
- Overall lines: `2250/2306 (97.6%)`
- Raw reports:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`
  - `coverage/whole-file-summary.md`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/workspace/config-defaults.ts` | `314/318` | `98.7%` | `166-167,169-170` | `coverage/whole-file-summary.md` |
| `packages/core/src/workspace/config-load.ts` | `391/398` | `98.2%` | `135-136,163-167` | `coverage/whole-file-summary.md` |
| `packages/core/src/task/coverage-compute.ts` | `521/526` | `99.0%` | `423,472-475` | `coverage/whole-file-summary.md` |
| `packages/core/src/task/case-gates.ts` | `457/479` | `95.4%` | `170-172,333-337,379-381,385-386,395-396,417-418,426-427,470-475` | `coverage/whole-file-summary.md` |
| `packages/core/resources/scripts/task-diff-coverage.mjs` | `121/122` | `99.2%` | `68` | `coverage/whole-file-summary.md` |
| `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs` | `446/463` | `96.3%` | `61-62,191,323-336` | `coverage/whole-file-summary.md` |

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/dist/` | `构建产物，镜像 src；C5 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核` |
| `packages/dsh-workloom/dist/` | `构建产物，镜像 src；C5 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核` |
| `packages/core/test/` | `测试夹具与 config/compute/gate/contract-asset 用例自身；C1 至 C3 与 C5 验全绿` |
| `packages/dsh-workloom/test/` | `dsh 钉住用例自身（本任务预期无 dsh 变更）；C5 验全绿` |
| `packages/core/resources/scripts/task-diff-coverage.test.mjs` | `脚本单测自身；C4 验全绿（脚本本体留 scope 内，由该单测运行覆盖）` |
| `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts` | `扫描单测自身；C4 验全绿（scan-packages.mjs 本体留 scope 内，由该单测运行覆盖）` |
| `packages/core/src/workspace/config.d.ts` | `手写类型声明锚点，无运行时行（lcov 不报告）；dist 分发一致性由 dist-dts 守卫验证，类型面由 SR1 静态审` |
| `packages/core/resources/skills/workloom-packages-scan/SKILL.md` | `skill 文档英文资产，无运行时行；SR9 静态审 + C5 grep 验 coverage 提议与手配标注` |
| `packages/core/resources/skills/workloom-config-edit/SKILL.md` | `skill 文档英文资产，无运行时行；SR10 静态审 + C5 grep 验 9 字段清单与示例` |
| `packages/core/resources/workflow/workflow.md` | `工作流 guidance 英文文本，无运行时行；SR6 静态审 + C5 grep 验 configured threshold 文案与 version 不升` |
| `.workloom/` | `任务元数据与 worktree 侧 spec 副本，非代码；spec 条目经 SR11 静态审与 C5 grep 验证` |
| `coverage/` | `开发者工作区自测报告（如存在），非代码不提交；CASE 证据统一写任务目录 coverage/，由主会话在 2.4 提交前删除 worktree 副本` |

### Collection Failure

`none`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | 0 | `case-evidence/c5-build.log` |
| `pnpm -r typecheck` | 0 | `case-evidence/c5-typecheck.log` |
| `pnpm lint` | 0 | `case-evidence/c5-lint.log` |
| `cd packages/core && pnpm test` | 0 | `case-evidence/c5-core-tests.log`（800 用例 0 fail，含 dist-mirror/dist-dts/contract-asset 守卫） |
| `cd packages/dsh-workloom && pnpm test` | 0 | `case-evidence/c5-dsh-tests.log`（213 用例 0 fail） |

## Resolved Findings

- `packages/core/src/task/case-gates.ts:451` [P2] issue 文案以裸字面量写 "(default 90%)"，DEFAULT_THRESHOLD 变更会与文案失同步 — fixed: 改为 `(default ${DEFAULT_THRESHOLD}%)` 插值（渲染不变，C3/C5 全绿）
- `packages/core/test/config.test.ts:1703` [P2] SR12 要求的非法 threshold 字符串形态（`'90'`）用例缺失 — fixed: cases 数组补一条 `threshold: '90'`（C1 场景 C 同形态实测 fail loud）
- `packages/core/test/coverage-compute.test.ts:352` [P2] SR13 要求的 cobertura+lcov 混合 → `mixed` 用例缺失 — fixed: 新增混合多报告用例（逐文件合并行覆盖取并，b.ts 1/2 + Foo.java 2/3 → mixed）
- `packages/core/test/case.test.ts:788` [P2] SR14 要求的门禁级 formatHints 用例与非内置回退达标过/not_applicable 变体缺失 — fixed: 新增"门禁 formatHints"用例并扩展非内置用例为三态（拒/过/not_applicable 反规避）
- `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.test.ts:85` [P2] SR17 要求的纯文档目录空集对照缺失 — fixed: 用例内补 docs-only 对照断言（languages 键不落）
- `packages/core/test/case.test.ts:737` [P2] 轨道二证据显示 case-gates.ts:451（below_threshold 与达标矛盾分支）变更行未覆盖 — fixed: 新增"below_threshold 声明与实际覆盖矛盾"用例（case-gates.ts 变更行 25/25 全覆盖）

## Open issues

- none
