---
version: 1
task: tasks/11-06-plan-pseudocode-standard
caseHash: 547c5e0b2cc976f3812aef7bb5a1ab36873037b2574f5038479b3538a6adce4f
codeBaseline: workloom/11-06-plan-pseudocode-standard @ 28da1c0（实施已提交，工作区干净）codeFingerprint=be957f309a8cdd5084a7afd949ff5572a422e7c15e150345739c5a6148d56771
checkSession: 91dd860d-802a-44f4-bbdd-fa49626745c4
status: passed
startedAt: 2026-11-06T04:14:00Z
completedAt: 2026-11-06T04:32:30Z
---

# CASE Result: 改造 PLAN 伪代码编写规范

## Summary

- Static review: `13/13`
- Runtime cases: `6/6; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 PLAN 协议字段结构校验

- Status: `passed`
- Evidence: `task-gates.js` 新增有序常量 `PLAN_PROTOCOL_FIELDS`（328 行）与行首形态正则 `PLAN_PROTOCOL_FIELD_LINE_RE`（331 行）；`extractEditRegionLines`（349 行）只取 `- Edit:` 到 `- Verify:` 之间正文，Edit 缺失返回 null 跳过协议检查；`stripCommonIndent` 剥公共缩进、围栏行不参与字段识别；缺失/空值报 `plan_protocol_missing`、重复报 `plan_protocol_duplicate`、乱序报 `plan_protocol_order`，三者互异；`inspectPlanStructure` 尾部保留 AC 聚合，协议问题与 AC 问题一次返回。
- Findings: `none`

### SR2 协议校验测试矩阵与夹具清扫

- Status: `passed`
- Evidence: `task-gates.test.js:626-708` 新增八个协议用例（齐全/none/fence、缺字段按常量序、空值与纯空白、乱序且缺字段不叠加顺序问题、重复、跨区域隔离、Edit 缺失只报外层、bullet/缩进/无冒号不识别）。六个测试文件共扫出 10 处 `- Edit:` 夹具：9 处为合法五字段伪代码；`task-ops.test.js:720` 为刻意负面样本（带注释断言聚合拒绝），非漏改。断言均核对具体问题码与消息。
- Findings: `none`

### SR3 confirm 复用同一结构分类器

- Status: `passed`
- Evidence: `git diff main` 确认 `alignment-service.ts` 零改动；review（结构诊断）与 confirm（blockers 聚合）仍调用同一 `inspectPlanStructure`，服务层无字段判断复刻；结构不合格时 confirm 拒绝并零写入（C3 第 3 步实测）。
- Findings: `none`

### SR4 start 门禁保持结构归类与顺序

- Status: `passed`
- Evidence: `evaluateStartGate` 顺序保持 PRD 结构 → PLAN 结构 → PLAN 确认 → PRD 确认；`planIssues.length === 0` 守卫使结构不合格时不叠加 `PLAN_NOT_CONFIRMED`；`task-ops.ts:197` 注释维持"PLAN 结构/确认缺失"措辞，该文件与 service 层均零改动。
- Findings: `none`

### SR5 workflow 写作门槛与面包屑括注

- Status: `passed`
- Evidence: 1.4 Authoring bar（`workflow.md:66`）改为五字段顺序要求 + `none` 语义 + 现状代码仅作唯一定位锚点 + 禁完整修改后代码与新文件完整实现；planning 面包屑（132 行）改"five-field pseudocode protocol in Edit"且无 `exact code change`；`version: 25`、`####` 步骤集合与 main 逐一相同，Loading protocol 句与 2.1 集中提问句与 main 基线逐字一致（C4 step1）。
- Findings: `none`

### SR6 alignment 技能主文件

- Status: `passed`
- Evidence: SKILL.md 51 行写作指针改为五字段伪代码门槛并删除 `exact code change`；收敛协议、`readyToConfirm` 门禁与两次内容确认表述未动；全文无 CJK。
- Findings: `none`

### SR7 PLAN 编写参考

- Status: `passed`
- Evidence: `plan-authoring.md:20-28` 按序给出 Input/Output/Preconditions/Procedure/Failure 模板，`none` 语义明示（25、27 行）；Target（19 行）限定现状代码片段仅作唯一锚点；规则 2（37 行）禁止完整修改后代码与新文件完整实现；`- **Covers** —`、`` `(internal)` `` 与 AC 覆盖完成判据保留；无 CJK。
- Findings: `none`

### SR8 alignment 评测

- Status: `passed`
- Evidence: `evals.json` 可解析，8 个场景；新增 `align-plan-pseudocode`：断言接受合法五字段伪代码、核对字段顺序、把缺输入输出与缺失败路径明确列为问题、`none` 为合法值；无场景要求完整实现代码；断言文本无 CJK。
- Findings: `none`

### SR9 迁移技能

- Status: `passed`
- Evidence: `migrate-plan/SKILL.md:32` 要求迁移产物携带五字段协议并禁止完整实现代码；`## Step 1: Scan` 至 `## Step 4` 标题与 `[executed <commit/date> — <verification state>]` 关键句保留（33 行）；无 CJK。
- Findings: `none`

### SR10 执行器纪律与评审指引

- Status: `passed`
- Evidence: `PRESCRIPTIVE_PLAN_DISCIPLINE` 新句（executor-context.js:209-212）要求跟随协议字段、真实锚点与验证命令，锚点失配阻塞上报，代码块仅定位；review Conformance 改查五字段/行为完整性/失败路径/AC 覆盖/可验证命令，Feasibility 改查锚点定位、伪代码契合现场与验证命令可运行并新增禁令句；diff 仅两处 hunk，Fidelity/Quality 与其余 kind 未动（C5 step3）。
- Findings: `none`

### SR11 资产与纪律文本测试

- Status: `passed`
- Evidence: `contract-asset.test.js` Authoring bar 断言改为五字段句 + 仅定位句 + 旧措辞缺席断言，plan-authoring 断言保留 Covers/(internal)/AC 判据并新增字段模板与禁令断言；`executor-context.test.js` 纪律句逐字更新、review pins 扩充、词数用例 33→39 词；未删断言规避；`protocol.test.js` 零改动通过。
- Findings: `none`

### SR12 DSH 技能测试同步

- Status: `passed`
- Evidence: `adapter-dsh/test/skills.test.js` 新增迁移产物五字段断言与 `align-plan-pseudocode` 场景断言（含"missing input/output fields and a missing failure path"关键词），只断言资产文本；`pnpm test` 177/177 通过。
- Findings: `none`

### SR13 Pi 技能构建副本与测试同步

- Status: `passed`
- Evidence: `adapter-pi/test/skills.test.ts` 新增同步产物五字段断言（alignment SKILL、plan-authoring 逐字段、migrate-plan），不复制协议判断逻辑；`pnpm build && bun test` 206/206 通过；三个构建副本与 assets 源文件 `cmp` 字节一致。
- Findings: `none`

## Runtime Results

### C1 全量验证、旧要求清空扫描与覆盖率

- Status: `passed`
- Executed at: `2026-11-06T04:14:20Z`
- Actions:
  1. `pnpm lint && pnpm -r typecheck && pnpm -r build`（exit 0，adapter-pi 同步 11 个技能目录）
  2. `cd packages/core && node --test 'test/*.test.js'`（753 pass / 0 fail / 0 skipped）
  3. 旧措辞清零扫描六个目标文件 + 五字段存在性断言（三个编写类资产全含五字段，workflow 与 plan-authoring 含 `pseudocode`）
  4. Coverage 聚合命令生成 lcov 与 summary
  5. `git status --short` 确认仅 23 个已跟踪文件修改，无未跟踪残留，dist 与 Pi skills 由构建生成
- Observed: 旧要求句全部缺席；唯一 `after-code` 原始命中是 SR10 要求新增的禁令句（精化扫描见证据）；覆盖率 executor-context.js 98.22%、task-gates.js 93.33%
- Evidence:
  - `case-evidence/c1-gates.txt`
  - `case-evidence/c1-absence-scan.txt`
  - `case-evidence/c1-coverage.txt`
  - `coverage/lcov-core.info`
  - `coverage/summary.txt`
  - `coverage/coverage-test.log`
- Findings: `none`

### C2 PLAN 协议结构校验矩阵与本任务自证

- Status: `passed`
- Executed at: `2026-11-06T04:16:40Z`
- Actions:
  1. 从 dist 动态导入 `inspectPlanStructure`，执行 18 项矩阵断言（合法样本、五字段逐一缺失、空值、纯空白、乱序、缺字段不叠加顺序、重复、Verify 区域与后续步骤跨区域隔离、Edit 缺失只报外层、AC 覆盖缺失）
  2. 自证：对本任务真实 prd.md 与 plan.md 运行校验器
- Observed: 合法五字段与 `none` 通过；缺/空/乱序/重复分别返回可区分问题码；Verify 区域与后续步骤字段不补位不污染；本任务 PLAN 零问题
- Evidence:
  - `case-evidence/c2-protocol-matrix.txt`
- Findings: `none`

### C3 confirm/start 共用校验端到端

- Status: `passed`
- Executed at: `2026-11-06T04:20:06Z`
- Actions:
  1. 临时根 mkdtemp + initWorkloom + 关闭 worktree，executeCreateTask 建完整任务
  2. 缺 Failure 样本：target=prd confirm 成功后，target=plan review 报 `plan_protocol_missing`、confirm 拒绝且零写入、start 拒绝且消息同源
  3. 乱序样本与 Covers 漏 AC 样本重复三类断言
  4. 合法五字段 PLAN（覆盖全部 AC）：review 通过 → confirm 成功（`planConfirmation` 恰含 passedAt/summary）→ start 成功 in_progress
  5. finally 清理临时根
- Observed: 三类缺陷下 align review/confirm 与 task start 同源拒绝；合法伪代码 PLAN 一次走通全链；`/tmp` 无残留
- Evidence:
  - `case-evidence/c3-confirm-start.txt`
- Findings: `none`

### C4 workflow 与编写/迁移资产伪代码标准一致

- Status: `passed`
- Executed at: `2026-11-06T04:21:50Z`
- Actions:
  1. 29 项资产断言（1.4 bar 五字段/none/锚点边界/禁完整实现/旧句缺席、面包屑、版本 25、保留句逐字对照 main、步骤 id 集合、plan-authoring 模板、alignment/migrate-plan、evals 场景、CJK 扫描）
  2. `node --test test/contract-asset.test.js test/protocol.test.js`
- Observed: 29/29 断言通过；契约与协议测试 49/49 通过；终稿代码字样仅出现在评测的否定句中
- Evidence:
  - `case-evidence/c4-assets.txt`
- Findings: `none`

### C5 执行器纪律与评审指引注入

- Status: `passed`
- Executed at: `2026-11-06T04:23:10Z`
- Actions:
  1. 从 `dist/domain/executor-context.js` 导入 `EXECUTOR_CONTRACT_BY_KIND`，断言 implement/frontend 新纪律句与旧句清零、review Conformance/Feasibility 关键词
  2. `git diff main` 断言仅两处 hunk 且增删行不触碰 Fidelity/Quality/其他 kind，改动量 9+/7-
  3. `node --test test/executor-context.test.js`
- Observed: 实施纪律跟随协议字段与验证命令、锚点失配阻塞上报；评审纪律把缺失协议、异常路径、验证列为问题；43/43 测试通过
- Evidence:
  - `case-evidence/c5-discipline.txt`
- Findings: `none`

### C6 双 adapter 技能测试一致

- Status: `passed`
- Executed at: `2026-11-06T04:24:30Z`
- Actions:
  1. `cd packages/adapter-dsh && pnpm test`
  2. `cd packages/adapter-pi && pnpm build && bun test test/*.test.ts`
  3. Pi 三个技能构建副本与 assets 源文件 `cmp` 字节比对；adapter 双 src 扫描 `inspectPlanStructure|Preconditions|Procedure` 命中数
  4. `git status --short` 与 `git diff --stat` 留痕
- Observed: DSH 177/177、Pi 206/206 通过；三个副本字节一致；adapter 源码协议逻辑命中 0；改动为 23 文件 522+/53-，产物均由命令生成
- Evidence:
  - `case-evidence/c6-adapters.txt`
- Findings: `none`

## Coverage

- Status: `generated`
- Tool: `Node v24.18.1 内置 --experimental-test-coverage（lcov reporter + --enable-source-maps，dist 经 source map 归因到 src）`
- Command: `cd packages/core && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'test/*.test.js' > coverage/lcov-core.info 2> coverage/coverage-test.log && node coverage/collect-core.mjs`
- Overall lines: `1815/1886 (96.24%)`
- Raw reports:
  - `coverage/lcov-core.info`
  - `coverage/summary.txt`
  - `coverage/coverage-test.log`
  - `coverage/collect-core.mjs`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/domain/executor-context.js` | `885/901` | `98.22%` | `743-744, 787-788, 797-798, 802-803, 805-806, 848-849, 868-869, 879-880` | `coverage/summary.txt` |
| `packages/core/src/domain/task-gates.js` | `602/645` | `93.33%` | `173, 226-237, 278, 280-281, 464-465, 467-469, 472-473, 512-515, 517-520, 529-530, 562-563, 574-581` | `coverage/summary.txt` |
| `packages/core/src/service/alignment-service.ts` | `328/340` | `96.47%` | `146-147, 213-214, 226-227, 252-253, 301-302, 318-319` | `coverage/summary.txt` |

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/src/**/*.d.ts` | `手写类型锚点无运行语句，由 typecheck 与 dist-dts 测试强制与实现一致。` |
| `packages/core/test/**` | `测试代码，由 C1–C6 的真实运行覆盖。` |
| `packages/core/dist/**` | `tsc 构建产物，经 source map 归因到 src，不重复统计。` |
| `packages/assets/**` | `Markdown/JSON 契约与评测夹具，无可执行生产行，由 C4 文本断言与契约测试覆盖。` |
| `packages/adapter-dsh/src/**` | `薄适配层，本任务不修改协议逻辑，由 C6 与 SR12 覆盖。` |
| `packages/adapter-dsh/test/**` | `测试代码，由 C6 运行覆盖。` |
| `packages/adapter-dsh/dist/**` | `构建产物，由 C1/C6 重建并核对。` |
| `packages/adapter-pi/src/**` | `薄适配层，本任务不修改协议逻辑，由 C6 与 SR13 覆盖。` |
| `packages/adapter-pi/test/**` | `测试代码，由 C6 运行覆盖。` |
| `packages/adapter-pi/skills/**` | `gitignored 构建副本，由 C6 校验与 assets 源文件字节一致。` |

### Collection Failure

`none`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm lint && pnpm -r typecheck && pnpm -r build` | `0` | `case-evidence/c1-gates.txt` |
| `cd packages/core && node --test 'test/*.test.js'` | `0` | `case-evidence/c1-gates.txt` |
| `cd packages/core && node --test test/contract-asset.test.js test/protocol.test.js` | `0` | `case-evidence/c4-assets.txt` |
| `cd packages/core && node --test test/executor-context.test.js` | `0` | `case-evidence/c5-discipline.txt` |
| `cd packages/adapter-dsh && pnpm test` | `0` | `case-evidence/c6-adapters.txt` |
| `cd packages/adapter-pi && pnpm build && bun test test/*.test.ts` | `0` | `case-evidence/c6-adapters.txt` |
| `node coverage/c2-matrix.mjs && node coverage/c3-confirm-start.mjs && node coverage/c4-assets.mjs && node coverage/c5-discipline.mjs` | `0` | `case-evidence/c2-protocol-matrix.txt` |

## Resolved Findings

- `.workloom/tasks/11-06-plan-pseudocode-standard/case.md:183 [P2] C1 旧措辞扫描模式含裸 `after-code`，命中 SR10 要求新增的禁令句（executor-context.js:295 "never hunt for after-code — the plan must not contain it"）— fixed: 按语义精化为旧要求句清零（"before-snippets locate uniquely, after-code fits its context" 等三句已不存在，禁令句必须在场），精化扫描记录于 `case-evidence/c1-absence-scan.txt`，CASE 断言意图全部成立`
- `.workloom/tasks/11-06-plan-pseudocode-standard/case-result.md:6 [P2] 提交 28da1c0 后代码指纹变化（28fa15b0… 为提交前脏工作区状态），codeBaseline 标注"实施未提交"已过期 — fixed: 基线刷新为 @ 28da1c0 + codeFingerprint=be957f30…，提交后重跑 core 全套（753/753）、C2 自证矩阵（全过）与 evaluateCaseOutcomeGate（0 问题）确认结果仍有效`

## Open issues

- none
