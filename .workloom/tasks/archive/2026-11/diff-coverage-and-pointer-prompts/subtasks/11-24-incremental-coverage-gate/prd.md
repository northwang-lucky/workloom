# 增量覆盖率门禁与采集脚本

> 种子来源：容器 11-24-diff-coverage-and-pointer-prompts 已确认 PRD 的 P1 部分（用户已确认）。本子任务仍需走自身 1.1 对齐收敛并确认 PRD。

## Context

zephyra B07 检查通过后报告覆盖率 628/1038（60.5%），用户质疑指标意义。核实三个事实：

1. 口径是整文件覆盖率。CASE 模板 Scope 为"项目源码 + 变更的可执行文件"，RESULT 的 Changed Files 表按整文件统计，workflow 2.3 要求"整体行覆盖率、变更文件行覆盖率"。分母混入历史任务既有代码（B07 中 `internal/account/profile.go` 52/61，未覆盖行属 B01–B06）。
2. 机器门禁没有数值阈值。`case-gates.ts` 只校验 Overall 格式、文件集合一致、排除项一致、原始报告存在，百分比不看；zephyra spec 也无覆盖率条目。
3. 文件集合不是真正的任务 diff。`gitChangedFilesSync` 用工作区相对 HEAD 的 diff 加未跟踪文件；实现提交后工作区干净，清单为空，门禁回退到 SR 声明文件集。

## Goal

覆盖率门禁只测本任务产出的代码：CASE 通过后，任务 diff 中新增/修改的可执行行覆盖率严格大于 90% 是硬门禁；不达标时 checker 与 developer 附原因交主会话审核，属实记录豁免放行，不属实退回排查。观察方式：新任务 RESULT 呈现逐文件变更行覆盖率与总体百分比；不达标任务必须有豁免记录或退回动作。

## Scope

范围内：

- core 门禁与口径：`case-gates.ts`、`case-structure.ts`、`case-scope.ts`、`git-query.ts`；任务记录豁免字段；`workloom_task_check` 可选 coverageWaiver 参数。
- 采集资产：core 变更行提取与覆盖率交集脚本（`resources/scripts/`，与 `task-fingerprint.mjs` 同机制），支持 go coverprofile、lcov 与 jacoco-xml（java/kotlin）。
- resources：`case.md`/`case-result.md` 模板 Coverage 节、`workflow.md` 2.3 措辞。
- 测试与 spec：更新 `case.test.ts`、`contract-asset.test.ts`；spec 新增覆盖率口径条目；dist 同 commit 重建。

非目标：

- 派发注入纯指针化与模板 init 落盘归 S2；config 编辑 skill 归 S3；覆盖率工具配置驱动归 S4（本任务门禁先按 CASE 声明/报告推断格式，S4 再接配置）。
- 不回测 B07，不改 zephyra；不改项目侧采集命令本身；不引入第三方 diff-cover 依赖。

## Assumptions, Constraints and Dependencies

- 任务 diff 口径：task.json `base_branch...branch`（merge-base 三点 diff，原语收 baseRef 用 `baseRef...HEAD`）；仅当分支字段为空（light/container 无分支）才回退两点 `git diff HEAD` 加未跟踪文件读行；声明的 base_branch/branch ref 无效（如分支已删）一律 fail loud，不回退。
- 删除行不进分母：已不存在、无法被覆盖；删除正确性由 SR 审查与测试通过保证（用户确认）。
- 阈值严格大于 90%：恰好 90.0% 算不达标。
- 豁免审核权在主会话；豁免绑定 RESULT codeBaseline 代码指纹，代码再变更即失效。
- 运行中插件是旧版本：本任务 CASE/RESULT 用旧格式过旧门禁，新脚本算本任务自身增量覆盖率作证据；新门禁自部署后下一个任务生效。
- 语言分工（repo/language）、验证命令（repo/code-style verify）、编码约束（600 行、常量、err 首位元组、卫语句）。

## Requirements

### A 组：增量口径

- R1：RESULT Coverage 改任务增量口径——分母是任务 diff 新版本新增/修改的可执行行，分子是与覆盖率报告交集；Changed Files 表逐文件列变更行 covered/total 与未覆盖变更行区间，Overall lines 汇总，格式沿用 `covered/total (pct%)`。可执行后缀的变更文件必须出现在覆盖率报告或 Exclusions（带原因）中，缺席报 coverage_missing_file 硬拒（闭合 go 新包缺席规避通道）；非可执行文件（md/json/spec 等）缺席不触发。
- R2：采集产物含任务 diff 变更行清单、工具原生报告、机器可读交集结果，全部落任务目录 `coverage/`。
- R3：整文件覆盖率退出门禁与 RESULT 必填字段；原生报告可保留整文件数据作参考。

### B 组：阈值门禁

- R4：增量覆盖率大于 90% 是 core 硬门禁：不达标且无有效豁免时 check/archive 拒绝，force 不可绕过（归入 core CASE failure）。
- R5：无可执行变更行（纯文档/spec 任务）为 not_applicable，原因载体为零分母独立原因行（放宽现有"非空 Exclusions"约束）；Exclusions 机制继续适用，排除项不得用于规避阈值；可执行文件缺席报告须以带原因的排除项处理，否则硬拒（R1）。
- R6：RESULT Coverage 新增 below_threshold 状态：附逐文件未覆盖变更行与原因，Summary 的 Coverage 字段同步。

### C 组：不达标审核

- R7：不达标时 checker 附逐文件原因、developer 附说明，主会话审核：属实记录豁免放行；不属实退回——无关代码交 developer 删除，case 缺口交 checker 补用例，全量重跑。
- R8：豁免写入 task.json：绑定代码指纹，含原因、审核时间、来源；指纹变化豁免失效。
- R9：`workloom_task_check` 增可选 coverageWaiver 参数（原因必填）：门禁见有效豁免才接受 below_threshold，豁免随 check 凭据一次写入，不新增工具。

### D 组：采集资产

- R10：core 变更行提取脚本（`resources/scripts/`）：输入 worktree 与基线 ref，输出逐文件变更行区间（新版本行号），跟随重命名。
- R11：脚本支持 go coverprofile、lcov 与 jacoco-xml 交集（jacoco-xml 逐行 ci>0 即覆盖，java/kotlin 共用）；门禁从原始报告 + diff 机械复算核对 RESULT；不支持格式回退一致性校验（文件集合、行区间在 diff 内、算术一致），CASE 须声明工具与计算命令。

### E 组：同步

- R12：既有测试更新到新行为并通过，新行为有测试覆盖；spec 新增条目；dist 同 commit 重建；部署按 repo/deployment。

## Acceptance Criteria

- AC1（R1、R2、R3）：变更文件混入未改动行的夹具，门禁与脚本只计变更行，未改动行不进分母；`coverage/` 含 diff 清单、原生报告、交集结果。验证方法：core `node --test` 口径用例 + 脚本对夹具 diff 输出核对。
- AC2（R4、R6）：夹具 RESULT ≤90% 且无豁免时门禁报阈值问题，check/archive 拒绝且 force 不可绕过；>90% 通过。验证方法：core 门禁单测含 force 路径。
- AC3（R5）：纯文档变更夹具 not_applicable + 原因通过；缺原因拒绝。验证方法：core 单测。
- AC4（R7、R8、R9）：below_threshold + 有效 coverageWaiver（指纹匹配、原因非空）check 通过，task.json 记录原因/时间/来源；指纹变化豁免失效拒绝。验证方法：core 单测 + check 参数校验测试。
- AC5（R10、R11）：脚本对 go coverprofile、lcov 与 jacoco-xml 夹具复算交集，门禁复算值与 RESULT 一致；不支持格式回退一致性校验。验证方法：脚本单测 + 门禁单测。
- AC6（R10）：新脚本算本任务自身 diff 增量覆盖率，逐文件明细落 `coverage/` 作证据，结果大于 90%（不达标按 R7 附原因）；本任务 RESULT 仍用旧格式过旧门禁。验证方法：脚本输出 + 证据文件核对。
- AC7（R12）：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、两包 `node --test` 全退出 0；spec 新条目存在；dist 与 src 同 commit。验证方法：命令退出码 + git 核对。

## Edge Cases and Failure Paths

- 无可执行变更行：not_applicable + 原因；排除全部变更文件同样 not_applicable 且原因逐项可审。
- 基线 ref 无效（声明的 base_branch/branch 已删或不存在）：门禁 fail loud 给修复指引，不静默放行；分支字段为空走无分支回退（此类任务 case.required=false，本就不受门禁）。
- 不支持格式：回退一致性校验，数字由 checker 计算并附命令，CASE 声明工具。
- 豁免后代码再变更：指纹不匹配，豁免失效，重测或重新审核。
- 重命名/移动：脚本跟随重命名，避免整文件误判新增。
- light/container：case.required=false 门禁豁免语义不变。

## Risks and Open Questions

- 风险：不支持格式数字仍靠 checker 自报（一致性校验兜底）；接受，三种格式覆盖目标仓库与 java/kotlin，其余按需扩展。
- 风险：本任务自身 CASE 用旧格式，新门禁真实任务端到端验证推迟到部署后下一个任务；接受，单测 + 自身 diff 证据（AC6）补偿。
- 无未决问题（种子已确认；本子任务对齐如有新节点再补）。

## Alignment Decisions

- 口径改任务增量（base...HEAD 新增/修改可执行行），整文件退出门禁。理由：整文件分母混历史代码，指标失真。
- 删除行不进分母，由 SR 与测试保证。理由：删除行已不存在；diff-cover 类工具同口径。
- 阈值严格 >90%，core CASE failure，force 不可绕过。来源：用户原始要求。
- 不达标审核权在主会话：属实豁免（绑定指纹、可审计），不属实退回区分无关代码与 case 缺口。来源：用户原始要求。
- 门禁机械复算：脚本解析 go coverprofile、lcov 与 jacoco-xml 复算核对；其他格式一致性校验。理由：数字不可自报虚高；jacoco-xml 支撑 java/kotlin 内置（用户要求纳入）。
- 豁免经 workloom_task_check coverageWaiver 一次写入，不新增工具。理由：审核结论与凭据原子记录。
- 本任务 CASE 旧格式 + 新脚本自身证据，不中途升级插件。理由：不中断会话。
- 不回测 B07、不改 zephyra。来源：用户选择。
- 报告缺席的可执行文件硬拒（P1-5=B，用户确认）：可执行后缀的变更文件须在报告或带原因的排除项中，否则 coverage_missing_file 硬拒；非可执行文件缺席不触发。理由：闭合 go coverprofile 新包缺席的阈值规避通道，与 R5 反规避一致；可执行扩展名集合与 S4 内置语言对齐。
- 基线口径澄清（P1-2）：字段为空才回退两点工作区 diff，声明 ref 无效一律 fail loud；原语收 baseRef 用 baseRef...HEAD，消除区间接口矛盾。
- not_applicable 原因载体（P1-7）：零分母独立原因行，放宽非空 Exclusions 约束；unsupported 格式阈值仍作用自报 Overall，expected 回退 diff 文件集（P1-8）。

## References

- `packages/core/src/task/case-gates.ts`、`case-structure.ts`、`case-scope.ts`、`packages/core/src/workspace/git-query.ts`。
- `packages/core/resources/templates/case.md`、`case-result.md`、`packages/core/resources/workflow/workflow.md`。
- B07 证据：zephyra `.workloom/tasks/11-17-zephyra-rewrite/subtasks/11-17-center-platform/subtasks/11-17-room-discovery/coverage/scope.txt`、`summary.txt`。
- 规范：repo/language、repo/code-style、repo/deployment、repo/workflow（asset-version-bump）。

## Notes

- 部署需用户授权重启；新门禁自部署后下一个任务生效。
- workflow.md states/step 不变，仅改 guidance，按 asset-version-bump 不升 version。
- S4 后续接配置驱动格式选择；本任务门禁先按 CASE 声明/报告推断格式，接口预留。
