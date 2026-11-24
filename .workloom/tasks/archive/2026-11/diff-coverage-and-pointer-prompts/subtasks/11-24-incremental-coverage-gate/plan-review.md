> 注入标记：tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate:mwu7b4odsix7o99f 。冲突声明（仅此一次）：会话注入的 always-on Executor 规范要求 test-first 实现并验证，与 Judger 执行器契约「只评审 plan、不改代码」冲突，以契约为准，本轮只审计 plan.md；全局「阅读所有 AGENTS.md」与契约「不重新发现仓库」冲突，仅读已注入的根 AGENTS.md 与按需指针 spec。

# plan-review.md — S1 增量覆盖率门禁与采集脚本

## Round 1（2026-11-24，Judger，plan.md 237 行版）

评审对象：[plan.md](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md)。对照 [prd.md](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/prd.md) 与真实代码逐项核查。方法：LSP 符号大纲定位结构，read 核对锚点行号与现状片段，grep 枚举使用方，node 实测阈值算术，git ls-files 核对 dist 入库。

### 一、已核实通过项

1. 锚点真实性（文件 + 符号 + 行号均存在且唯一，现状片段与源码一致）：
   - Step 1：[git-query.ts:35-42](packages/core/src/workspace/git-query.ts#L35-L42) `GIT_DIFF_CHANGED_ARGS` 内容与 Input 引用一致；runGit/toError/execFileSync 模式存在。
   - Step 4：[case-structure.ts:76](packages/core/src/task/case-structure.ts#L76) `coverageStatuses = ['generated','not_applicable','failed']` 一致。
   - Step 6：[case-gates.ts:253-294](packages/core/src/task/case-gates.ts#L253-L294) Coverage 段范围精确；Input 列举的现有校验项与源码一致。
   - Step 7：[records.ts:102-105](packages/core/src/task/storage/records.ts#L102-L105) `TaskCheckRecord {passedAt,summary}` 一致；[read-write.ts:141](packages/core/src/task/storage/read-write.ts#L141) check 透传 cast，「兼容读不迁移」成立。
   - Step 8：[task-ops.ts:463-471](packages/core/src/task/task-ops.ts#L463-L471) CheckTaskParams、L500-562 checkTaskInternal、L952-958 ExecuteCheckTaskParams、L967-987 executeCheckTask、[guards.ts:217-220](packages/core/src/task/state/guards.ts#L217-L220) guardCaseOutcomeReady 无 options 调用，均与 Input 一致。
   - Step 9：[surface.ts:82-83](packages/core/src/injection/surface.ts#L82-L83) taskCheck snippet 逐字一致；[tasks.ts:101-111](packages/dsh-workloom/src/tooling/tasks.ts#L101-L111) check schema、L350-360 checkTaskTool 一致，additionalProperties:false 属实。
   - Step 10：[case.md:56-69](packages/core/resources/templates/case.md#L56-L69) 与 [case-result.md:41-67](packages/core/resources/templates/case-result.md#L41-L67) Coverage 节范围精确。
   - Step 11：[workflow.md:96](packages/core/resources/workflow/workflow.md#L96) 采集句逐字一致（反引号差异不计）。
   - Step 12：[case.test.ts:367-467](packages/core/test/case.test.ts#L367-L467) 门禁用例范围成立；[contract-asset.test.ts:1078-1086](packages/core/test/contract-asset.test.ts#L1078-L1086) coverage pin 成立。
2. Edit 五字段齐全且顺序正确（13 个 Step 全部 Input/Output/Preconditions/Procedure/Failure）；Procedure 均为行为边界伪代码，无完整代码，无「优化」「相应调整」类未锚定指令。
3. AC 覆盖：AC1–AC7 均被至少一个 Step 的 Covers 覆盖；R1–R12 全部落到步骤（R7 退回路由措辞不完整，见 P2-12）。prd 的 R/AC 编号与验证方法齐全，无格式缺口。
4. 设计决策核实：
   - 单一源 + dist 相对 import 成立：core dist 已入库（182 文件，.gitignore 例外）；tsconfig rootDir=src、outDir=dist，`resources/scripts/../../dist/task/coverage-compute.js` 解析正确；core `files:["dist","resources"]`、`type:"module"`，安装形态下相对 import 与具名导入均成立；`rewriteRelativeImportExtensions` 使 .ts 引用编译为 .js。
   - 归档复核链路成立：[transitions.ts:66-68](packages/core/src/task/state/transitions.ts#L66-L68) checking→completed/archived 均重跑 case-outcome-ready；TaskView 展开原始记录（[view.ts:46](packages/core/src/task/state/view.ts#L46)），门禁可读 task.check.coverageWaiver。首次 check 迁移路径断裂，见 P0-1。
   - 阈值算术实测：node 验证 9/10*100 === 90、90/100*100 === 90，现实行数规模下 `pct>90` 不会把恰好 90% 误判通过；显示舍入规则未定，见 P2-5。
   - asset-version-bump 合规：Step 11 仅改 guidance，states/step 与 version 不升，符合 [workflow spec](.workloom/spec/repo/workflow/index.md) 条目。
   - 语言分工合规：模板/workflow/spec 条目英文，源码注释中文（repo/language）。
   - 新文件名无冲突：coverage-compute.ts、task-diff-coverage.mjs 均不存在；core test 脚本已含 `resources/scripts/*.test.mjs`，新脚本测试自动纳入。
5. coverageStatuses 使用方 grep 枚举：定义（case-structure.ts）+ 循环 pin（contract-asset.test.ts）两处，Step 4/12 覆盖；门禁本身硬编码状态字符串（现有模式），below_threshold 分支在 Step 6。模板与 workflow 文本使用方见 P1-12、P2-3。

### 二、P0（阻塞，按文执行必失败或违反验收）

#### P0-1 首次 check 的迁移重评不携带豁免，below_threshold+waiver 首 check 必被拒

- plan 锚点：[plan.md:113](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L113)（options.coverageWaiver ?? task.check?.coverageWaiver）、[plan.md:149-150](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L149-L150)（经 ctx.coverageWaiver 传门禁；credential 仅当传入且通过）。
- 事实链：STANDARD 任务首次 check 在 IMPLEMENTING 阶段走迁移（[task-ops.ts:529-539](packages/core/src/task/task-ops.ts#L529-L539)）；该边守卫含 case-outcome-ready（[transitions.ts:65](packages/core/src/task/state/transitions.ts#L65)）；evaluateTransition 用全新 ctx `{root,taskRelPath}` 重跑全部守卫（[migrate.ts:119](packages/core/src/task/state/migrate.ts#L119)、[L134](packages/core/src/task/state/migrate.ts#L134)），不携带 coverageWaiver；credential patch 在守卫通过后才写入（[migrate.ts:220](packages/core/src/task/state/migrate.ts#L220)），此时 task.check 仍为 null；case-outcome-ready 是硬守卫（[guards.ts:272-279](packages/core/src/task/state/guards.ts#L272-L279) 不在 FORCEABLE 表）。
- 后果：checkTaskInternal 自身守卫（L518）带豁免通过，随后迁移重评无豁免可用，coverage_threshold 硬拒。AC4 主流程（首次 check 带有效豁免通过并持久化）按文执行必失败。Step 8 的门级单测不经过迁移，会掩盖该缺陷。
- 修正建议：新增步骤锚定 [migrate.ts:109-147](packages/core/src/task/state/migrate.ts#L109-L147) evaluateTransition 与 L205 起 migrateTask：迁移 options 增 coverageWaiver 并注入 L119 ctx；或让 evaluateTransition 在守卫求值前把 patch.check 应用到 evolving view（凭据本就只在守卫通过后才写入，语义自洽）。Step 8 同步说明透传路径；Step 12 增「IMPLEMENTING 首次 check + below_threshold + waiver」端到端用例。

### 三、P1（重要，可行性风险或明显更优方案未采用）

#### P1-1 Step 1 与 Step 5 基线区间接口自相矛盾

- plan 锚点：[plan.md:24](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L24)（原语固定 `${baseRef}...HEAD`）对 [plan.md:91-94](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L91-L94)（基线 `${base_branch}...${branch}`）。
- 问题：把 `base...branch` 整体当 baseRef 传入，实参变成 `base...branch...HEAD`，非法修订版，git 报错。worktree 的 HEAD 即分支尖端，两处口径本可统一。
- 修正建议：原语只收 baseRef（用 `baseRef...HEAD`），Step 5 传 base_branch；或原语改收完整区间，Step 1 常量同步。二选一并写明。

#### P1-2 无分支回退口径错误，基线缺失分支灰区

- plan 锚点：[plan.md:91-96](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L91-L96)。
- 问题一：baseRef='HEAD' 经原语变成 `HEAD...HEAD`，恒为空 diff，丢失工作区未提交变更；prd Assumptions（[prd.md:33](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/prd.md#L33)）要求工作区相对 HEAD 的 diff 加未跟踪全行。
- 问题二：Failure「基线缺失 → 回退工作区口径」与 prd Edge（[prd.md:82](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/prd.md#L82)）「分支已删 → fail loud 给修复指引」冲突，未区分「字段为空」与「ref 无效」。
- 修正建议：无分支路径用两点 `git diff HEAD`（原语增模式或新原语）加未跟踪文件读行数；字段为空才回退，声明的 ref 无效一律 err 透传。未跟踪全行需读文件计行，二进制处理一并写明。

#### P1-3 hunk 解析遗漏 count 缺省语义

- plan 锚点：[plan.md:25](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L25)。
- 问题：git hunk 头新侧 count 省略时为 1（如新文件单行 `@@ -0,0 +1 @@`）。按 `+newStart,newCount` 形式解析会漏掉单行 hunk，分母少计，覆盖率虚高，AC1/AC2 口径失真。
- 修正建议：Procedure 写明「count 省略按 1」，旧侧同理；夹具含单行新增/修改用例。

#### P1-4 三格式报告路径与 diff 路径无对齐规则

- plan 锚点：[plan.md:7](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L7)、[plan.md:43-44](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L43-L44)。
- 问题：go coverprofile 文件名是 import 路径（如 `github.com/org/repo/internal/x/a.go`）；jacoco package+sourcefile 拼出 `com/example/Foo.java`，缺源根前缀（diff 路径为 `src/main/java/com/example/Foo.java`）；lcov SF 可能是绝对路径。按文件键直接求交集，go 与 jacoco 现实夹具交集为空，AC5 无法成立。
- 修正建议：逐格式定义路径归一规则（go 剥模块前缀或后缀匹配；jacoco 后缀匹配或声明源根；lcov 绝对转 repo 相对），写明多候选歧义处理；三格式夹具各覆盖路径形态。

#### P1-5 报告未列文件整体退出分母，偏离 R1 且可规避阈值

- plan 锚点：[plan.md:6](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L6)（报告未列的变更行视为非可执行，不计）。
- 问题：R1 分母是「新增/修改的可执行行」。go coverprofile 只含编入测试二进制的包；新增且无测试引用的包整体缺席报告，按此规则全部行退出分母，覆盖率虚高，形成阈值规避通道（与 R5 反规避意图相悖）。lcov/jacoco 通常列出零覆盖文件，go 是特例。
- 修正建议：区分「文件缺席报告」与「文件内非可执行行」。可执行后缀的缺席文件按未覆盖计入分母，或 fail loud 要求 CASE 声明理由；把 go profile 完整性边界写进 spec 条目与模板提示。此项属口径决策，建议主会话确认。

#### P1-6 R2 变更行清单产物无生产者

- plan 锚点：[plan.md:39](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L39)（输出仅 covered/total/uncoveredRanges）、[plan.md:58-62](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L58-L62)（CLI 仅输出交集结果）、[plan.md:181](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L181)（模板要求 coverage/changed-lines.json）。
- 问题：changed-lines.json（diff 原始变更行区间）没有任何步骤产出，R2 产物链断。
- 修正建议：computeDiffCoverage 结果增 changedRanges 字段，或 CLI 增 `--changed-lines` 输出；脚本一次运行同时写变更行清单与交集结果。

#### P1-7 not_applicable 原因载体未定，现有 exclusions 约束未处理

- plan 锚点：[plan.md:115](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L115)（分母 0 或 expected 空 + 原因）。
- 问题：现有门禁要求 not_applicable 必须有非空 Exclusions（[case-gates.ts:281](packages/core/src/task/case-gates.ts#L281)）。纯文档任务可以没有任何排除项，AC3 夹具按现有约束必被拒；plan 未说明保留还是放宽该约束，也未说明「原因」写在哪个字段。
- 修正建议：明确原因载体（Exclusions 逐项理由，或零分母路径的独立原因行）；零分母路径放宽 L281 约束；补「缺原因拒绝」用例（AC3 验证方法明确要求）。

#### P1-8 unsupported 回退分支两处灰区

- plan 锚点：[plan.md:107](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L107)、[plan.md:116](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L116)。
- 问题一：expected 定义为「有可测变更行的文件」，unsupported 格式无法解析可测行，expected 无定义。
- 问题二：未说明 unsupported 时阈值是否仍作用于 RESULT 自报 Overall。R4 是无条件硬门禁；若 unsupported 跳过阈值，换格式即规避。
- 修正建议：unsupported 的 expected 回退 diff 文件集（减 .workloom/Exclusions，沿用现有口径）；阈值仍校验自报 Overall，一致性校验只替代机械复算。写明两分支判定顺序。

#### P1-9 复查覆盖凭据丢失既有豁免

- plan 锚点：[plan.md:150](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L150)（credential 含 coverageWaiver 仅当传入且门禁通过）。
- 问题：复查路径整体覆盖 record.check（[task-ops.ts:559](packages/core/src/task/task-ops.ts#L559)；[task-store.test.ts:1191](packages/core/test/task-store.test.ts#L1191) 钉住覆盖行为）。不带 coverageWaiver 复查时，门禁经 task.check 回退通过，新凭据却不带豁免，归档复核即失败。
- 修正建议：门禁经回退通过时，credential 继承既有有效 task.check.coverageWaiver；补「复查不带参、豁免保留」用例。

#### P1-10 CaseStructureOptions 扩展无文件锚点

- plan 锚点：[plan.md:110](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L110)（options 扩 coverageWaiver/changedLines）、[plan.md:103](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L103)（Target 仅 case-gates.ts）。
- 问题：接口定义在 [case-structure.ts:43-47](packages/core/src/task/case-structure.ts#L43-L47)，不在 case-gates.ts。Step 4 只改 coverageStatuses，没有任何步骤锚定该接口的编辑位置。
- 修正建议：Step 4 或 Step 6 的 Target 显式加 case-structure.ts L43-47 CaseStructureOptions，写明新增可选字段。

#### P1-11 changedLines 测试注入到不了复算

- plan 锚点：[plan.md:39](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L39)（computeDiffCoverage({root,baseRef,reports})）、[plan.md:110-112](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L110-L112)、[plan.md:214](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L214)。
- 问题：computeDiffCoverage 无 changedLines 入参，内部自跑 git；options.changedLines 注入只影响 expected，复算仍走 git。现有夹具根不是 git 仓库（[case.test.ts:234-248](packages/core/test/case.test.ts#L234-L248)），复算必 err，新门禁用例无法按注入路径跑绿。
- 修正建议：computeDiffCoverage 接受 changedLines 与 {root,baseRef} 互斥输入；门禁把 options.changedLines 透传给复算；或 Step 12 明确全部改用真实 git 夹具并写明构建步骤。

#### P1-12 workflow 2.3 两处使用方漏改

- plan 锚点：[plan.md:191-199](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L191-L199)（Step 11 仅替换 L96 采集句）。
- 问题：[workflow.md:111](packages/core/resources/workflow/workflow.md#L111)「The tool writes check.passedAt + check.summary」未含 coverageWaiver 写入；[workflow.md:112](packages/core/resources/workflow/workflow.md#L112)「coverage is generated or validly not_applicable」与 below_threshold+有效豁免可 check 的新行为矛盾。两处都在 2.3 节内（L94-114），是本次措辞变更的使用方（repo/code-style red-green-expectations 要求枚举齐全）。
- 修正建议：Step 11 Target 扩至 L111-112，同步凭据写入字段与合格状态枚举；contract-asset 新文本 pin 覆盖这两句。

### 四、P2（机械，措辞不精确或引用不完整）

1. P2-1 entry guard 引用失真：[plan.md:57](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L57) 写 `process.argv[1] === import.meta.url`；实际是 `pathToFileURL(resolve(process.argv[1])).href === import.meta.url`（[task-fingerprint.mjs:31-32](packages/core/resources/scripts/task-fingerprint.mjs#L31-L32)）。照抄字面值 guard 永不触发。修正：更正引用。
2. P2-2 fixture 锚点错误：[plan.md:207-210](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L207-L210) 把 validResult 归到 fixtures/task-artifacts.js；该文件只有 markTaskLegacy（[task-artifacts.js](packages/core/test/fixtures/task-artifacts.js)），validCase/validResult 与 '8/10 (80%)' 在 [case.test.ts:44](packages/core/test/case.test.ts#L44)、[L135](packages/core/test/case.test.ts#L135)、[L198](packages/core/test/case.test.ts#L198)。修正：删除该锚点或改为实际编辑位置。
3. P2-3 模板锚点范围不全：[plan.md:177-183](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L177-L183) 的「checker-discipline Result discipline 行」实为 [case.md:10](packages/core/resources/templates/case.md#L10)（HTML 注释块 L6-11），在 Target 的 Coverage L56-69 之外；[case-result.md:17](packages/core/resources/templates/case-result.md#L17) Summary 枚举行也需加 below_threshold，未显式锚定。修正：扩 Target 范围至这两处。
4. P2-4 输出缺 err 通道：[plan.md:39-47](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L39-L47) computeDiffCoverage 输出裸对象，Failure 却说「git err → 整体 err」；code-style 要求含 Error 用 err 首位元组。修正：签名改 `[err, ComputeDiffCoverageResult|null]`。
5. P2-5 pct 比对舍入规则未定：[plan.md:112](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L112) 复算核对 overall，RESULT pct 是显示值（如 33.3%），直接字符串比对会误拒。修正：只比对 covered/total 整数，阈值用整数交叉乘（covered*100 > total*90）；或写明舍入位与容差。
6. P2-6 报告读取细节未定：[plan.md:112](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L112) 未说明报告路径相对任务目录解析（与 [case-gates.ts:305](packages/core/src/task/case-gates.ts#L305) validateReferencedFiles 同口径）、多报告合并规则、报告文件缺失时走 unsupported 还是报错。修正：补齐三点。
7. P2-7 复算比对未同步排除过滤：[plan.md:111-112](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L111-L112) expected 排除 Exclusions，computeDiffCoverage 不知 Exclusions，直接比对会误拒含排除项的任务。修正：复算结果先按 .workloom/Exclusions 同口径过滤再比对。
8. P2-8 测试使用方枚举不全：[plan.md:207](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L207) 缺 [surface.test.ts:254-257](packages/core/test/surface.test.ts#L254-L257)（taskCheck pin）、[tasks.test.ts:75-84](packages/dsh-workloom/test/tasks.test.ts#L75-L84)（dsh check schema）、git-query 单测宿主 [git.test.ts](packages/core/test/git.test.ts)；新用例清单缺「force+阈值拒绝」（AC2 验证方法明确要求 force 路径）与「not_applicable 缺原因拒绝」（AC3）。修正：补枚举与两个用例。
9. P2-9 夹具 codeBaseline 缺指纹：[case.test.ts:139](packages/core/test/case.test.ts#L139) 为 'main@abc'；Step 8（[plan.md:149-151](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L149-L151)）提取 codeFingerprint 缺失即抛错，豁免用例夹具必须带 `codeFingerprint=<64-hex>`。修正：Step 12 显式写明夹具 codeBaseline 改造。
10. P2-10 自身证据命令占位：[plan.md:234](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L234) `<worktree> <base> <reports>` 未锚定实际值，AC6 验证不可直接执行。修正：写明本任务 base ref 与报告生成命令（如 node --test 覆盖率 lcov reporter），命令可复跑。
11. P2-11 超行数文件继续追加：[task-ops.ts](packages/core/src/task/task-ops.ts) 已 1289 行，超 code-style 600 行拆分线；Step 8 继续追加未说明拆分安排。修正：给出拆分计划或本轮不拆的理由。
12. P2-12 R7 退回路由措辞缺失：[plan.md:195](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L195) 仅「阈值 + 审核概述」；R7 的「无关代码交 developer 删除、case 缺口交 checker 补用例」路由未落任何步骤输出。修正：Step 11 措辞补审核结论路由（全量重跑句已在 workflow L96 存在，保留）。
13. P2-13 工具描述可选同步：[surface.ts:50-51](packages/core/src/injection/surface.ts#L50-L51) TOOL_DESCRIPTIONS.taskCheck 凭据描述仅提 summary，可补 coverageWaiver 选项提升模型可见性。修正：可选，随 Step 9 一并处理。

### 五、结论

本轮发现：P0 × 1，P1 × 12，P2 × 13。P0-1 豁免链路在首次 check 迁移处断裂，须先补 migrate.ts 步骤；P1 集中在差分解析语义（P1-1/2/3）、三格式路径与分母口径（P1-4/5）、产物与注入链路（P1-6/10/11）、回退分支定义（P1-7/8）、凭据覆盖（P1-9）与 workflow 使用方（P1-12）。plan 骨架（单一计算源、dist import、归档复核、五字段、AC 映射）核实成立。建议修订后进入 Round 2 复核；P1-5 属口径决策，请主会话一并确认。

## Round 2（2026-11-24，Judger，plan.md 264 行 14 步版 + prd.md 119 行刷新版）

评审对象：修订后 [plan.md](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md) 与 [prd.md](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/prd.md)（R1/R5/Assumptions/Edge/Alignment 已刷新，P1-5=B 经用户确认，Alignment L104-106 记录在案）。方法同 Round 1：LSP 定位 + read 核锚点 + grep 枚举使用方。

### 一、Round 1 闭合核对

- P0-1 闭合：新 Step 9 锚定 [migrate.ts:109-119](packages/core/src/task/state/migrate.ts#L109-L119)（evaluateTransition options/ctx）与 [migrate.ts:209-212](packages/core/src/task/state/migrate.ts#L209-L212)（migrateTask 调 evaluateTransition 处），行号逐字核实；patch.check 守卫后 Object.assign（[migrate.ts:220](packages/core/src/task/state/migrate.ts#L220)）属实。patch.check.coverageWaiver → evaluateTransition options → ctx → guardCaseOutcomeReady → 门禁链路闭合；Step 13 含首 check 迁移端到端用例。归档迁移 patch 无 check，透传 undefined，门禁经 task.check 回退，行为正确。
- P1-1/2/3 闭合：Step 1 原语收 baseRef（非空三点、null 两点工作区 + 未跟踪读行、二进制跳过），hunk count 省略按 1、旧侧同理；Step 5 传 base_branch，字段空才 null，声明 ref 无效 err 透传。与 prd Assumptions L33、Edge L82 一致。
- P1-4 闭合：Design L9 逐格式归一（go 剥 module 前缀/无 go.mod 后缀匹配、jacoco 唯一后缀匹配歧义 err、lcov 剥 worktree 前缀），夹具覆盖路径形态。残留接口问题见新 P1-2。
- P1-5 闭合（B）：EXECUTABLE_EXTENSIONS + missingExecutableFiles + coverage_missing_file 硬拒，prd R1/R5/Alignment L104 同步。与 unsupported 分支的交互矛盾见新 P1-1。
- P1-6 闭合：Step 2 输出 changedRanges，Step 3 CLI 一次写 changed-lines.json + diff-coverage.json。
- P1-7 闭合：零分母独立 `- Reason:` 行，放宽 [case-gates.ts:281](packages/core/src/task/case-gates.ts#L281)；Step 11 模板加 Reason 行；Step 13 缺原因拒用例。
- P1-8 闭合：unsupported expected 回退 diff 文件集（减排除），阈值仍作用自报 Overall；prd Alignment L106 记录。
- P1-9 闭合：Step 8 L157 复查经回退通过继承既有有效豁免；Step 13 复查继承用例。
- P1-10 闭合：Step 4 Target 加 [case-structure.ts:43-47](packages/core/src/task/case-structure.ts#L43-L47) CaseStructureOptions，三可选字段（coverageWaiver/changedLines/exclusions）。
- P1-11 闭合：computeDiffCoverage 互斥输入 {root,baseRef,reports}/{changedLines,reports}，Step 6 透传，Step 13 注入复算。互斥设计的副作用见新 P1-2。
- P1-12 闭合：Step 12 扩至 [workflow.md:111-112](packages/core/resources/workflow/workflow.md#L111-L112)，三句同步 + R7 路由；Input 引用与源码逐字一致。
- P2 闭合：1 entry guard 更正（[task-fingerprint.mjs:31-32](packages/core/resources/scripts/task-fingerprint.mjs#L31-L32) 核实）；2 fixture 锚点改 case.test.ts（L44/L135/L198/L139 核实）；3 模板 L10/L17 入 Target；4 err 首位元组；5 整数交叉乘 covered*100>total*90、只比整数；6 报告路径相对任务目录（同 L305）、缺失 err（合并规则残留见新 P2-4）；7 复算先过滤再比对；8 使用方枚举 surface.test/dsh tasks.test/git.test + force 阈值 + 缺原因用例；9 夹具 codeFingerprint；10 命令实值（base_branch 取 task.json，worktree 占位残留见新 P2-3）；11 task-ops 不拆理由 + buildWaiver 下沉；12 R7 路由入 Step 12；13 TOOL_DESCRIPTIONS 入 Step 10。

### 二、重审通过项

1. 锚点：14 步全部 Target 文件 + 符号 + 行号存在且唯一。新增锚点核实：migrate.ts L109-119/L209-212/L220；case-gates.ts L281/L305；surface.ts TOOL_DESCRIPTIONS.taskCheck L50-51；guards.ts GuardContext（L42-47）；read-write.ts:141。现状片段引用与源码一致。
2. 五字段齐全有序，Procedure 为行为边界伪代码，无未锚定指令。依赖序无环（7→6→8→9；9 的 Preconditions 7,8 成立）。
3. AC1–AC7 全覆盖；R1–R12 全落地，R1/R5 新增子句（缺席硬拒、Reason 载体）在 Step 2/6/11 有对应。prd 编号与验证方法齐全，Alignment 新条目带理由与来源。
4. ripple 使用方齐全：coverageStatuses（Step 4/11/13）、模板 L10/L17/L43（Step 11）、workflow 三句（Step 12）、surface snippet/描述/参数（Step 10）、dsh schema/工具（Step 10）、GuardContext（Step 8）、migrate ctx（Step 9）、records/read-write（Step 7）、fixture 与六处测试 pin（Step 13）。discipline-text.ts 与 session-context 无覆盖率措辞，无需改。
5. 设计核实：dist 相对 import、ESM、files 字段（Round 1 已验）；meetsThreshold 整数判定恰好 90% 不达标；buildWaiver 下沉 coverage-compute 属 task 子包内聚，task-ops 导入无分层问题；asset-version-bump 与语言分工合规。

### 三、新发现

#### P1-1 unsupported 与缺席硬拒交互矛盾，回退分支被堵死

- plan 锚点：[plan.md:50](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L50)（missingExecutableFiles = 可执行变更文件 − 报告文件集 − Exclusions，无条件）、[plan.md:120](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L120)（非空即硬拒，无 unsupported 例外）。
- 问题：unsupported 报告解析不出文件集，报告文件集为空，全部可执行变更文件都列入 missingExecutableFiles，L120 先于回退处理硬拒。R11/AC5 要求的 unsupported 一致性回退对含可执行变更的任务不可达，Step 13「unsupported 阈值」用例按文执行必失败。
- 修正建议：写明 unsupported 格式跳过缺席检测（报告文件集未知，反规避由 CASE 工具声明 + 一致性校验承担）；L120 加「仅 supported 格式」限定，并补 unsupported + 可执行变更通过回退的用例。

#### P1-2 互斥输入使路径归一失去 worktree 上下文

- plan 锚点：[plan.md:43](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L43)（input 互斥）、[plan.md:117-118](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L117-L118)（门禁先解析 changedLines，复算输入二选一未定）。
- 问题：门禁必然先有 changedLines（options ?? listCaseChangedLines），自然传 {changedLines,reports}，该分支无 root：lcov 绝对 SF 无法剥 worktree 前缀（geninfo/llvm-cov 常见绝对路径），go.mod 读不到只能退后缀匹配。生产门禁对绝对路径 lcov 报告交集为空，coverage_recompute 误拒合法 RESULT。若改传 {root,baseRef} 又重复跑 git 且与 listCaseChangedLines 的基线/过滤逻辑双源。
- 修正建议：输入改 {root?, baseRef?, changedLines?, reports, exclusions?}，changedLines 优先于 git，root 常驻供路径归一；门禁统一传 root + changedLines，消除二选一歧义与基线双源。

#### P2-1 computeDiffCoverage 输入签名缺 exclusions

- plan 锚点：[plan.md:43](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L43) 对 [plan.md:50](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L50)（Exclusions 由门禁传入或入参）。
- 问题：Output 声明的两个输入变体均无 exclusions 字段，缺席检测却要吃 Exclusions；CLI 无 exclusions 时自身证据的 missingExecutableFiles 会含 dist 等约定排除项。修正：签名补 exclusions?:Map（随 P1-2 一并）；CLI 可选 --exclude 或证据注明未过滤。

#### P2-2 CLI --out-dir 缺省行为歧义

- plan 锚点：[plan.md:64-68](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L64-L68)。
- 问题：「写两产物（--out-dir，缺省 stdout）」与「stdout markdown 表或 JSON」冲突，缺省时产物与表格混输。修正：写明仅 --out-dir 时写文件，stdout 恒为表格或 --json 结果。

#### P2-3 自身证据命令 worktree 仍占位（P2-10 部分闭合）

- plan 锚点：[plan.md:261](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L261)。
- 问题：base_branch 已说明取 task.json，但 `<worktree>` 仍是占位符；lcov 生成句未写重定向目标路径。修正：worktree 取 task.json worktree_path（空则 repo 根），写明 `... --test-reporter=lcov > <任务目录>/coverage/lcov.info` 形态，命令可直接复跑。

#### P2-4 多报告合并规则未定（P2-6 残留）

- plan 锚点：[plan.md:117](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L117)（仅「多报告合并」）。
- 问题：合并语义未写。修正：写明可测行取并集、覆盖取任一报告 count>0（或按格式优先级），冲突处理一句话定死。

#### P2-5 EXECUTABLE_EXTENSIONS 集合开放

- plan 锚点：[plan.md:10](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L10)（列举后带「等」）。
- 问题：常量须封闭集合，「等」无法实现也无法测试。修正：删「等」，钉死本轮列表；S4 扩展走常量修订。

#### P2-6 case-scope 单测宿主文件未锚定

- plan 锚点：[plan.md:105](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L105)、[plan.md:233](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L233)。
- 问题：Step 5 Verify 的 case-scope 用例未指明宿主文件，Step 13 Target 枚举也未含。修正：指定新建 case-scope.test.ts 或并入现有文件，并补入 Step 13 枚举。

### 四、结论

Round 1 的 P0×1、P1×12 全部闭合，P2×13 闭合 11 条、部分闭合 2 条（P2-6/P2-10 残留并入本轮 P2-4/P2-3）。本轮新发现：P0 × 0，P1 × 2，P2 × 6。两条 P1 均为 Round 1 修复引入的接口交互问题：unsupported 与缺席硬拒的分支矛盾（P1-1）、互斥输入丢失路径归一上下文（P1-2），修正集中在 Step 2 输入签名与 Step 6 分支限定，改动面小。建议修订后进入 Round 3 复核。

## Round 3（2026-11-24，Judger，plan.md 268 行 14 步版，终审）

### 一、Round 2 闭合核对

- P1-1 闭合：Design L10 与 Step 2 L51「仅 supported 格式计算，unsupported 返回空」、Step 6 L121「supported 格式且非空才硬拒，unsupported 跳过缺席检测」三处一致，回退分支恢复可达。
- P1-2 闭合：Step 2 L44 入参 `{root?,baseRef?,changedLines?,reports,exclusions?}`，L47 changedLines 优先、L48 归一用 input.root；Step 6 L119 门禁统一传 `{root, changedLines, reports, exclusions}`，二选一歧义与基线双源消除。
- P2×6 闭合：exclusions 入签名（L44/L51）；CLI 省略 --out-dir 仅 stdout 不写文件（L65/L69）；自身证据 WT/BASE 从 task.json 解析 + lcov 重定向（L262-265，命令细节残留见本轮 P2-1）；多报告按文件合并行覆盖取并、混格式分别推断（Design L11、Step 2 L48）；EXECUTABLE_EXTENSIONS 冻结封闭集合 19 项去「等」（Design L10）；case-scope 单测宿主锚定 case.test.ts（Step 5 L106）。

### 二、重审通过项

1. 锚点：14 步 Target 与现状引用沿用 Round 2 已核实锚点，本轮改动段（Design L10-11、Step 2/3/5/6/14）无新文件锚点引入，全部成立。
2. 五字段齐全有序，Procedure 为行为边界伪代码，无未锚定指令；依赖序无环。
3. AC1–AC7 全覆盖，R1–R12 全落地；prd 刷新版（R1/R5/Assumptions/Edge/Alignment L104-106）与 plan 一致。
4. ripple 使用方齐全（Round 2 枚举不变）：coverageStatuses、模板 L10/L17/L43、workflow L96/L111/L112、surface 三处、dsh schema/工具、GuardContext、migrate ctx、records/read-write、fixture 与六处测试 pin。
5. 设计链闭合：首 check 迁移豁免透传、复查继承、归档指纹复核、整数阈值、缺席硬拒与 unsupported 回退互不冲突。

### 三、新发现（仅 P2 机械项）

#### P2-1 Step 14 自身证据命令两处实证缺陷

- plan 锚点：[plan.md:263-265](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L263-L265)。
- 实证一：本机 Node v24.18.1 实测 `node --test <目录>`（含/不含尾斜杠）报 MODULE_NOT_FOUND，目录参数不被当作测试发现入口；glob 形式 `node --test 'sub/*.test.ts'` 正常。L264 `node --test ... packages/core/test/` 按文执行失败，lcov 无输出。修正：改 glob 形式 `'packages/core/test/*.test.ts'`（与 core package.json test 脚本同形）。
- 实证二：worktree_path 为项目根相对路径（[worktree-lifecycle.ts:164](packages/core/src/workspace/worktree-lifecycle.ts#L164) 注释与 L270/L332 relWorktreePath），L263 从任务目录取 WT 后直接 `cd "$WT"` 解析错误。修正：WT 相对项目根 resolve；并补 `mkdir -p "$WT/coverage"`（重定向目标目录须存在）。
- 级别说明：两处均为运行时响亮报错、机械可修，不影响门禁设计与验收逻辑，列 P2。

#### P2-2 自身证据仅采 core 包报告

- plan 锚点：[plan.md:264-265](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L264-L265)。
- 问题：本任务同时改 packages/dsh-workloom；仅 core lcov 使 dsh 可执行变更行退出分母，缺席文件会列入 missingExecutableFiles（可见但证据不完整）。修正：dsh 包测试同法产 lcov，CLI 传两份报告（多报告合并已设计）；或在证据注明采集范围。

#### P2-3 Step 6 复算 root 未显式 worktree 口径

- plan 锚点：[plan.md:119](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L119)。
- 问题：evaluateCaseOutcomeGate 的 root 入参是项目根；lcov 剥前缀与 go.mod 读取需要 worktree 根（Design L11 已写明 worktree 语义）。修正：L119 显式 `root: worktreeDirectory(root, task)`，与现有 L270 用法一致。

#### P2-4 修订头部引用未更新

- plan 锚点：[plan.md:1-3](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate/plan.md#L1-L3)。
- 问题：标题仍「Round 2 修订」，修订依据仅引 Round 1。修正：标注 Round 3 修订并补 Round 2 处置引用。

### 四、结论

Round 2 的 P1×2、P2×6 全部闭合。本轮终审：P0 × 0，P1 × 0，零发现结论（阻塞级）；余 P2 × 4 均为机械项（证据命令实证缺陷、双包采集、worktree 口径措辞、修订头部），可在实现时随手修正，不构成 plan 确认阻塞。plan 锚点、五字段、AC/R 覆盖、ripple 使用方与设计链路全部核实成立，建议确认 plan 进入实现。
