# PLAN 评审报告：plan-pseudocode-standard

tasks/11-06-plan-pseudocode-standard:mw4e272zuv4yqtij

冲突声明（一处）：评审指令的 Conformance 维度要求“every step anchored to a file, a symbol, and exact code”，与本任务 PRD 的 R1/R4 及任务提示直接冲突——本任务正是要建立伪代码标准、取消完整 before/after 代码要求。按“任务提示优先”处理，Conformance 按新标准（真实锚点、五部分协议、可验证）评审，不据此扣分。

## 结论

计划总体可执行：三步划分清晰，AC1–AC4 均有步骤 Covers 覆盖；plan.md 自身五个 Edit 块已按 Input/Output/Preconditions/Procedure/Failure 五部分协议书写且顺序正确，自洽地践行了新标准；所有 Target 文件与符号均真实存在（task-gates.js 的 PLAN_REQUIRED_FIELDS/inspectPlanStructure、workflow.md 1.4、plan-authoring.md、evals.json、executor-context.js、双 adapter skills 测试均已逐一核实）；Verify 命令与 package.json scripts 吻合。发现 1 个 P0、1 个 P1、4 个 P2，均给出修复建议。

## P0

### P0-1 步骤 1 的测试夹具清扫清单不完整，按现状执行步骤 3 全量测试必红

- 计划锚点：plan.md 步骤 1 的 Target 与 Procedure 第 30 行（“更新相关测试夹具为合法五字段伪代码”）。
- 事实核对：现有 core 测试中共有 6 个文件写有 `- Edit:` 的 PLAN 夹具，Target 只列了 3 个，遗漏：
  - `packages/core/test/case.test.js`：第 309 行直接断言 `inspectPlanStructure(plan, PRD)` 深等于 `[]`，其夹具是四字段老格式（`- Edit: exact`）。协议校验一上，该断言必挂——这是现有唯一针对 inspectPlanStructure 的单元断言。
  - `packages/core/test/worktree-compat.test.js` 第 121 行、`worktree-lifecycle.test.js` 第 222 行：两处 `satisfyStartGate` 帮助函数写四字段 plan 后走 start 门禁，协议字段缺失会让这些场景里的 start 被拦截，用例变红。
- 影响：步骤 1 的 Verify 只跑三个文件所以当场不红；步骤 3 跑完整 `node --test test/*.test.js` 时必失败，触发 Failure 回流。属于“按现状执行计划必然失败”。
- 修复建议：把 `case.test.js`、`worktree-compat.test.js`、`worktree-lifecycle.test.js` 补进步骤 1 的 Target 枚举，并在 Procedure 中写明“全仓清扫：所有含 `- Edit:` 的测试夹具统一升级为五字段伪代码格式”。

## P1

### P1-1 实施侧纪律句 PRESCRIPTIVE_PLAN_DISCIPLINE 未纳入改造，实施执行器提示与新标准自相矛盾

- 计划锚点：plan.md 步骤 2 的 Target（executor-context.js 仅列“review Conformance 指引”）与 Procedure 第 48 行。
- 事实核对：`packages/core/src/domain/executor-context.js` 第 208 行 `PRESCRIPTIVE_PLAN_DISCIPLINE` 原文为 “follow its file, symbol, and snippet anchors and its code blocks exactly”，注入到 implement/frontend 纪律段（第 266、303 行）。伪代码标准下 PLAN 不再含 after-code 块，实施执行器仍被指示“逐字跟随代码块”；`executor-context.test.js` 第 937–954 行对该句做逐字断言（implement/frontend 必须含、research/check 必须不含）。
- 影响：R8 要求同一套伪代码标准贯穿各面，此处是唯一漏点：评审不再产出逐字代码，实施侧却被要求逐字执行代码块，首个伪代码 PLAN 的实施派发即产生口径冲突。不违反 AC 字面，但属明显的更优方案未采纳。
- 修复建议：步骤 2 的 Target 增加 `PRESCRIPTIVE_PLAN_DISCIPLINE` 常量及其逐字断言测试，Procedure 增加一条：把该句改为伪代码语义（跟随协议字段、真实锚点与验证命令；锚点与现场不符时按阻塞项上报，不得即兴发挥），并同步更新 executor-context.test.js 的逐字 pin。

## P2

### P2-1 评审纪律段 Feasibility 维度措辞未列入改造范围

- 计划锚点：plan.md 步骤 2 Procedure 第 48 行（仅点名 Conformance）。
- 事实核对：executor-context.js 评审段 Feasibility 维度仍写 “before-snippets locate uniquely, after-code fits its context”。新标准下 PLAN 只含少量现状代码锚点、无 after-code，该措辞会误导评审执行器去找不存在的 after-code。
- 修复建议：同一条 Procedure 中补充“Feasibility 改为核对真实锚点、现状代码片段唯一可定位、伪代码步骤与现场契合、验证命令可运行”。

### P2-2 workflow.md 第二处 exact-code 文案位置应显式枚举

- 计划锚点：plan.md 步骤 2 Target 的“workflow.md 的 1.4 与 planning 指引”。
- 事实核对：workflow.md 第 66 行（1.4 Authoring bar）与第 132 行（`[workflow-state:planning]` 面包屑括注 “every step anchored to a concrete file, symbol, and exact code change”）各有一处。“planning 指引”措辞可覆盖第 132 行但不够显式；contract-asset.test.js 第 776 行对面包屑含 “prescriptive authoring bar” 有逐字断言，改写时需保留或同步更新该句。
- 修复建议：Target 写明两处坐标（1.4 Authoring bar 段 + planning state 面包屑括注），避免执行者只改 1.4 漏掉面包屑。

### P2-3 协议字段的识别词法规则需钉死边界

- 计划锚点：plan.md 步骤 1 Design decisions 第 2–3 条与 Procedure 第 26–27 行。
- 事实核对：“独立成行”“允许字段值位于冒号后或后续缩进行”未定义基线缩进、字段名后是否必须跟冒号、Procedure 正文里自然出现 “Input:” 开头行时如何区分、以及外层 `Edit` 缺失时协议检查是否跳过（此时已报 plan_step_field，重复报协议缺失会双计）。
- 修复建议：Procedure 补一句判定口径：仅在 Edit 区域内、行首零缩进（围栏基线）且 `字段名:` 形式才认作协议字段；五个字段按出现位置与常量序比较；Edit 缺失的步骤跳过协议检查。相应测试用例（跨区域误识别、Edit 缺失）已在其列，口径写清即可。

### P2-4 workloom-migrate-plan 技能未纳入同步范围

- 计划锚点：plan.md Design decisions 第 6 条（“不修改归档 PLAN”）与步骤 2 Target 清单。
- 事实核对：`packages/assets/skills/workloom-migrate-plan/SKILL.md` 第 31 行仍以 before-snippet 语言描述锚点校验，其产出的 plan.md 是旧四字段形态；新 start 门禁下这类迁移任务会再次被协议检查拦截。不在 R8 字面清单内，但属同一标准的 obvious 缝隙。
- 修复建议：两种处置任选并在 Design decisions 记录：A. 步骤 2 Target 加入 migrate-plan 技能，其 PLAN 产出模板升级为五字段协议；B. 明确“迁移任务须按新参考重写 plan.md”为接受代价。推荐 A，改动量小。

## 已核实无误的关键事实

- task-gates.js 的 PLAN_REQUIRED_FIELDS（第 325 行）与 inspectPlanStructure（第 333 行）存在；confirm（alignment-service.ts confirmPlanAlign）与 start（evaluateStartGate）均消费 inspectPlanStructure，扩展该函数即可同时满足 AC4 的“确认与启动均拒绝”。
- workflow.md version: 25，与步骤 2“保留版本 25”一致；步骤集合不变与 contract-asset.test.js 的步骤 id 断言（第 330 行）相容。
- “Loading protocol”句（workflow.md 第 161 行）与“阻塞集中提问句”（contract-asset.test.js 第 86 行 pin）存在，步骤 2 的保留清单可落实。
- contract-asset.test.js 第 738–757 行对 1.4 Authoring bar 的逐字断言（含 before/after 要求句）在步骤 2“更新所有逐字文本断言”覆盖范围内。
- adapter-dsh skills.test.js 第 362 行断言 evals.json 可解析且含 review blocker 场景，步骤 2 改 evals 时该文件已在 Target 内。
- 双 adapter 测试无 PLAN 夹具（仅技能名单与 evals 解析断言），dist 同步由步骤 3 的 `pnpm -r build` 覆盖 adapter-pi 的 sync-skills 脚本。

## 遗留问题

无阻塞项。P0-1 的修复只需扩充清单，不影响三步结构与顺序。

---

# Round 2 复查

tasks/11-06-plan-pseudocode-standard:mw4e272zuv4yqtij

## Round 1 处置核对

逐项复核 Round 1 的 1 个 P0、1 个 P1、4 个 P2，全部已落实，核对方式与结果如下。

- P0-1（测试夹具清扫清单）：已修复。步骤 1 Target 现枚举全部 6 个含 `- Edit:` 夹具的 core 测试文件（新增 case.test.js、worktree-compat.test.js、worktree-lifecycle.test.js），Procedure 第 32 行补“全仓清扫”口径。与 grep 实况一致，无遗漏文件。
- P1-1（PRESCRIPTIVE_PLAN_DISCIPLINE）：已修复。步骤 2 Target 增补该常量，Procedure 第 53 行明确改为跟随协议字段、真实锚点与验证命令、锚点不符按阻塞项上报、不再逐字执行代码块；executor-context.test.js 已在 Target 内。
- P2-1（Feasibility 措辞）：已修复。Procedure 第 52 行改为核对现状锚点唯一可定位、伪代码契合现场、验证命令可运行，明确不再寻找 after-code。
- P2-2（workflow 两处坐标）：已修复。Target 写明“1.4 Authoring bar 与 planning state 面包屑括注”，与 workflow.md 第 66、132 行两处实况吻合。
- P2-3（识别词法边界）：已修复。Procedure 第 26–28 行钉死：Edit 起点到 Verify 起点提取、Edit 缺失跳过协议检查、剥离公共缩进后仅认行首 `字段名:` 形式（bullet、额外缩进、无冒号不算）、重复字段按乱序或重复处理；测试用例清单同步增加重复字段与 Edit 缺失。
- P2-4（migrate-plan）：已修复。Design decisions 第 7 条记录该决策，步骤 2 Target 与 Procedure 第 55 行纳入，产出升级为五字段协议。

Round 1 发现全部关闭，无升级项。

## Round 2 新发现

### P2-1 步骤 1 的 Verify 命令未覆盖新增的 3 个夹具文件

- 计划锚点：plan.md 步骤 1 Verify 行。
- 事实核对：Target 已扩到 6 个测试文件，但 Verify 仍只跑 `task-gates.test.js`、`task-ops.test.js`、`task-store.test.js` 三个。case.test.js 的 `inspectPlanStructure` 断言、两个 worktree 测试的 start 门禁夹具不在步骤 1 的验证范围内，要到步骤 3 全量跑才会暴露。
- 影响：不阻断（步骤 3 兜底，Failure 有回流路径），但步骤 1 的自证范围与 Target 不一致，回归定位变慢。
- 修复建议：Verify 改为 `node --test 'test/*.test.js'`（core 全量）或至少补上 `case.test.js worktree-compat.test.js worktree-lifecycle.test.js` 三个文件。

### P2-2 migrate-plan 技能改写需同步 adapter-dsh 的边界 pin

- 计划锚点：plan.md 步骤 2 Procedure 第 55 行。
- 事实核对：[skills.test.js](packages/adapter-dsh/test/skills.test.js) 第 282–308 行对 migrate-plan SKILL.md 有内容级断言：`## Step 3: Rewrite the plan as plan\.md` 标题、`dispatch \`research\``、`never scan, never migrate`、`Covers` 等正则 pin。改写 Step 3 产出模板时这些 pin 可能失配；该测试文件已在步骤 2 Target 内，属可发现可修复。
- 影响：若执行者只改资产不跑 adapter 测试，步骤 2 Verify 的 `pnpm test`（adapter-dsh）会红。
- 修复建议：Procedure 第 55 行补半句：改写后核对该测试的 Step 标题与边界短语 pin，失配时同步更新测试预期。adapter-pi 仅 pin 技能名单，不受影响。

## 复查通过的项

- 全资产清扫确认：workflow.md（第 66、132 行）、plan-authoring.md、alignment SKILL.md（第 51 行）、migrate-plan SKILL.md（第 31 行）是全部仍写 exact before/after 或 before-snippet 的位置，现均在步骤 2 Target 内，AC2 的“workflow 与 PLAN 编写参考”覆盖完整。
- 计划自身仍满足五部分协议：三个 Edit 块字段齐全、顺序正确、无空值，与步骤 1 将要实现的判定口径（公共缩进剥离 + 行首 `字段名:`）自洽。
- AC1–AC4 的 Covers 映射、三步依赖顺序（步骤 2 前置步骤 1、步骤 3 前置 1+2）、版本 25 与步骤集合不变的约束，Round 2 文本中保持完好。
- adapter-pi 对 migrate-plan 仅有名单 pin，无内容 pin；core 的 migrate.test.js 测领域迁移逻辑，与资产改写无关。

## 遗留问题

无阻塞项。两个 P2 均为一句话级修补，可在确认 PLAN 时顺手并入。

## 主会话处理记录

- Round 2 的测试范围问题已修复：步骤 1 改为运行 core 全量测试，覆盖全部修改夹具。
- migrate-plan 的测试提醒已加入步骤 2，明确要求同步核对 adapter-dsh 的 Step 标题与边界短语断言。
- 两轮后已无 P0/P1；上述两个 P2 均已处理，不再追加评审轮次。
