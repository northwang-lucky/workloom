# 角色体系与子会话派发

## Context

workloom-sop 重构容器任务的需求点 4：SOP 定义五角色（Owner、Researcher、Judger、Developer、Checker），但现行代码的派发值域仍是旧 kind 五值（research、implement、check、frontend、review），角色叙述与代码值域两套名词并存。frontend 在 SOP 叙述层没有位置，但机制层有两个活的消费方：对齐参考件 ui-design.md 的前端派发门禁，以及状态机 ui-dispatch-ready 守卫（子任务三刚裁定原样保留）。

派发链路的历史遗留也在本任务集中清偿：failover.js 与 dispatch-binding.js 滞留 core、NATIVE_TOOLS_DSH 驻 core、prompt-compose.ts 超 600 行、resolveTurnTask 缺直测且存在回退直读通道、state-machine.ts（1427 行）与 task-storage.ts（1146 行）超限（子任务三裁定拆分计划留本任务）、constants.ts 与 cordis.patch.yml 有过期注释。

配置解析现行三级：显式参数 > subagent_profiles 命中条目 > 根层级 subagents（legacy 层）。用户已裁定根层级 subagents 字段在新版不再支持。

## Goal

五角色成为派发值域的唯一名词：researcher、developer、frontend-developer、checker、judger 五个成员（Developer 拆通用与前端专项两个派发类型），旧 kind 值域的全部消费点一次成组切换，派发、配置、守卫、门禁与机械文档字样全部绑定角色。Judger 评 PLAN 环节接上子任务三落好的 planReview 轨道：评审派发自动置 reviewing，新工具 workloom_task_planreview 供 Owner 标 revising 与 clean。派发链路遗留清偿完成（模块归属、大文件拆分、直测、注释）。

完成的可观测标志：构建、类型检查、lint、两包单测全绿；旧值在 src 与 resources 的派发消费点零残留；dist 与 src 同 commit 重建入库。

## Scope

范围内：

1. 角色值域与成组切换：值域模块（executor-kinds.ts 过渡栖身地）、local-prompts 派发 target、session-context 画像节、workloom_execute 参数与校验、状态机 ui-dispatch-ready 判定、executor-guard 受守卫集合、ui-design.md 门禁字样（机械引用部分）。
2. 派发记录兼容读（历史记录不改写）。
3. 配置：根层级 subagents 字段退役（fail loud 加迁移指引）；resolveSubagentDefaults 删 legacy 层；角色键缺失继承宿主默认，画像节在 session-context 重建（五角色清单加 info 行）。
4. planReview 派发联动与 workloom_task_planreview 新工具。
5. dsh 派发链路重写与模块归属：failover.js 错误码分类与文案迁 dsh、单次重试在新派发层重建接线；dispatch-binding.js 迁 dsh；NATIVE_TOOLS_DSH 移 dsh 清单参数化；executor-guard 与 executor-toolface 的重复派发记录扫描抽共享实现。
6. 大文件拆分：state-machine.ts 拆 task/state/、task-storage.ts 拆 task/storage/、prompt-compose.ts 拆到单文件 600 行以下。
7. resolveTurnTask 补三态直测；删 session-context 与 workflow-service 的回退直读通道。
8. constants.ts 与 cordis.patch.yml 过期注释修正。

范围外（非目标）：

- skill 与 workflow 文档的整体叙述改写（归子任务七；本任务只改机械引用旧值域的字样）。
- 父子任务编排（子任务五）、迁移 skill（子任务六）。
- 生产 pin 切换（容器最终验收后统一处理）。
- 状态机迁移表与守卫的语义变更（子任务三已定，本任务只拆分不改语义；ui-dispatch-ready 仅切换判定所用值）。

## Assumptions, Constraints and Dependencies

- Node v24 原生 TS type stripping：禁 enum、namespace、参数属性。
- 构建时序：dsh 经 file:../core 的 exports 解析 core 的 dist（tsconfig 无 paths），凡验 dsh 的 typecheck 与 test 前先 pnpm -r build。
- dist 入库纪律：同 commit 重建两包 dist（git 子目录安装无构建步骤）；dist 镜像守卫测试已由子任务三落地，本任务沿用。
- 提交分组纪律：实施步骤只验证不提交；末步单一 commit 落代码加两包 dist；簿记另走 chore commit；executor 约定禁止 commit 时暂存交还主会话提交。
- 测试隔离惯例：HOME 加 TMPDIR 隔离（防全局配置残留污染）。
- 依赖子任务三产物：planReview 轨道（none、reviewing、revising、clean）、plan-review-clean 确认守卫、autonomy 字段、三模式状态机。本任务不改其语义。
- 单文件 600 行风格线；目录结构原则：目录根层级只保留对外入口，内部逻辑收敛子目录，外部不得直接引用子目录内文件。
- 编码原则：重复字符串定义为枚举常量，禁 Magic String；模块成员对外不可见优先。

## Requirements

- R1: 派发值域替换为 researcher、developer、frontend-developer、checker、judger 五个成员；显示名 Researcher、Developer、Frontend Developer、Checker、Judger；Owner 是主会话，不进值域。
- R2: 旧 kind 值的全部消费点在本任务一次成组切换，清单至少含值域模块、local-prompts 派发 target 与错误文案、session-context Last dispatch 行、workloom_execute 参数校验、状态机 ui-dispatch-ready 判定、case-gates 与 executor-injection 的硬编码字面量、surface 注册面文案、executor-guard 受守卫集合、workflow.md 与 skill 文档中派发指令处的机械 kind 字样、ui-design.md 门禁字样；切换后 src 与 resources 中旧值在派发消费点零残留（兼容读映射与历史夹具数据除外）。
- R3: workloom_execute 的 kind 参数改名 role，取值新值域，不留 kind 别名；传旧参数名或旧值显式报错（fail loud）。
- R4: 历史派发记录（task.json dispatches、journal、归档）读取时把旧值映射为新角色（research→researcher、implement→developer、check→checker、review→judger、frontend→frontend-developer）；历史文件不改写；无法识别的值显式报错。
- R5: 根层级 subagents 字段不再解析；配置中仍存在该字段时 loadConfig 抛 WorkloomConfigError 并给出迁移到 subagent_profiles 的指引；resolveSubagentDefaults 删除 legacy 层，解析链变为显式参数 > subagent_profiles 命中条目 > 宿主默认；subagent_profiles 条目的内层字段 subagents 改名 roles（用户裁定 2026-11-08），条目出现旧字段名同样抛 WorkloomConfigError 并给出改名 roles 的迁移指引（与根层级退役同一 fail loud 口径）。
- R6: subagent_profiles 命中条目缺某角色键时，model 与 effort 继承父会话默认；session-context 重建执行器画像节（原渲染模块已随子任务二清理删除），按五角色值域渲染各角色生效配置，缺配置角色输出 not configured（inherits parent session model）风格的 info 行；渲染内嵌 session-context，不立独立模块。
- R7: 为 plan 评审目的派发的 Judger 子会话自动把任务 planReview.phase 置为 reviewing；新工具 workloom_task_planreview 仅主会话可用，标记 revising 与 clean 并写记录；非 plan 评审目的的 Judger 派发（如追溯代码评审）不触碰 planReview 轨道；目的区分沿用既有 purpose 参数模式（同 check 派发的 case-design 与 execution）。
- R8: ui-dispatch-ready 守卫语义不变——UI Design 章节有实质内容且无 frontend-developer 派发记录时，拒绝 implementing 迁入 checking；light 任务豁免与 force 越权留痕保持；判定经兼容读对历史记录同样成立（旧 frontend 记录计入）。
- R9: Researcher 与 Judger 派发的子会话仅允许写 <cwd>/.workloom/ 内路径（调研产物、评审报告）；守卫身份重建兼容历史记录的旧 kind 值（旧 research 与 review 记录同样识别为受守卫身份）；派发记录扫描逻辑抽共享实现。
- R10: dsh 的 executor.ts 及同族模块按角色绑定重写（prompt 组装、标题标签、receipt、容量闸与失败重试全部以角色值为准）；failover.js 的错误码分类与文案迁入 dsh，单次重试在新派发层重建接线——模型不可达分类命中时按 fallback_models 链的下一模型一跳重派，重试再失败或无链则结算 failed（重试编排原已随子任务二删除，此处按其"单次重试落子任务四接线"的在档裁定重建）；dispatch-binding.js 迁入 dsh 并修正过期注释；NATIVE_TOOLS_DSH 移出 core，dsh 工具清单参数化；死导出清理。
- R11: state-machine.ts 拆为 task/state/ 子目录（index.ts 唯一对外入口，含值域与兼容映射、迁移表与守卫键、守卫实现等分文件）；task-storage.ts 拆为 task/storage/ 子目录（index.ts 入口，含记录类型、读写序列化、创建校验等分文件）；prompt-compose.ts 拆分为若干单文件 600 行以下的模块；task/ 目录外的代码只经子目录入口引用。
- R12: 补齐 resolveTurnTask 三态行为的直接测试；删除 session-context 与 workflow-service 中"未注入缓存记录"的回退直读通道；既有直连单测改走正规通道。
- R13: constants.ts 与 cordis.patch.yml 的过期注释修正，与重构后实况一致。

## Acceptance Criteria

- AC1: 覆盖 R1 至 R13：构建基线全绿。验证方法：依次执行 pnpm -r build、pnpm -r typecheck、pnpm lint，三条命令零错误退出。
- AC2: 覆盖 R4、R7、R8、R9、R10、R12：两包单测全绿。验证方法：cd packages/core && pnpm test 与 cd packages/dsh-workloom && pnpm test 通过；新增测试至少含 resolveTurnTask 三态直测、兼容读映射、planReview 联动、UI 门禁、写守卫身份重建、单次重试一跳（fallback_models 下一模型重派与无链结算 failed）；dist 镜像守卫测试同场通过。
- AC3: 覆盖 R1、R2：旧值零残留。验证方法：对 src 与 resources 按词边界检索旧 kind 五值，派发值域消费点零命中，输出命中清单人工复核（仅兼容读映射模块与历史夹具数据允许出现）。
- AC4: 覆盖 R3：工具面 role 参数就位。验证方法：单元测试校验 workloom_execute schema 参数为 role 且无 kind，传 kind 参数或旧值的调用返回显式报错；会话上下文工具说明可见 role 参数。
- AC5: 覆盖 R5、R6：配置退役与默认继承。验证方法：单元测试构造带根层级 subagents 的配置，观察 loadConfig 抛 WorkloomConfigError 且文案含 subagent_profiles 迁移指引；构造 profile 条目内层用旧字段名 subagents 的配置，观察抛错且文案含 roles 迁移指引，roles 字段正常条目解析通过；构造角色键缺失配置，观察 session-context 画像节为该角色输出 info 行且解析结果继承宿主默认。
- AC6: 覆盖 R7：planReview 联动可判定。验证方法：单元测试驱动派发与工具调用，观察 plan 评审目的的 Judger 派发后 task.json 的 planReview.phase 为 reviewing，workloom_task_planreview 仅主会话可调用且标 revising 与 clean 均写记录，非 plan 评审目的的 Judger 派发不改变轨道。
- AC7: 覆盖 R8：UI 门禁可判定。验证方法：单元测试驱动状态机迁移，观察 UI Design 有实质内容的任务无 frontend-developer 派发时迁入 checking 被拒、补派发后可迁移、携带旧 frontend 历史记录的任务经兼容读同样满足门禁、light 豁免与 force 留痕行为不变。
- AC8: 覆盖 R9：只读角色写限制可判定。验证方法：单元测试驱动守卫判定与重建流程，观察 Researcher 与 Judger 子会话写 .workloom/ 外路径被拒、写 .workloom/ 内路径放行、dsh 重启后从历史派发记录（含旧 kind 值）重建受守卫身份集成功。
- AC9: 覆盖 R10、R11：模块归属与拆分形态就位。验证方法：文件树观察加 wc -l 统计——packages/core/src/dispatch/ 下无 failover.js 与 dispatch-binding.js，core 不再导出 NATIVE_TOOLS_DSH，task/state/ 与 task/storage/ 存在且各含 index.ts，task/ 根层级无 state-machine.ts 与 task-storage.ts，拆分涉及的全部文件行数低于 600。
- AC10: 覆盖 R13：注释清理完成。验证方法：检索原过期字样零命中，人工复核新注释与实况一致。

## Edge Cases and Failure Paths

- 兼容读遇到未知值（既非旧 kind 也非新角色）：显式报错，不静默按缺省处理，与既有记录规范化行为一致。
- 主会话模型取不到时：subagent_profiles 的 whenMain 条目全部跳过，走无 whenMain 的回退条目或宿主默认（现语义不变）。
- 配置同时写根层级 subagents 与 subagent_profiles：加载期先报根层级退役错误，不进入解析链。
- dsh 重启后写守卫身份集为空：任一触发点按项目懒重建，历史旧 kind 记录经兼容映射识别为受守卫身份，防旧子会话失守。
- Judger 派发发生在 planning 阶段但目的不是 plan 评审（如追溯评审）：purpose 参数区分，不误置 reviewing。
- bash 写文件绕过：守卫只管 write 与 edit 工具的路径参数，bash 写文件维持已知边界不根治（现语义保持，不扩大承诺）。
- 存量配置无受损面：本仓库与生产 profile 的 executor profiles 当前均未配置根层级 subagents，退役不破坏现有环境。

## Risks and Open Questions

- 风险：成组切换消费点分散在 core、dsh、resources 三处，存在漏改单点风险。缓解：AC3 词边界检索清单复核，Judger 评审 plan 轮把关，子任务七文档层二次清理。
- 风险：拆分与重写同任务进行，diff 体量大，评审负担重。缓解：plan 中把移动与拆分（不改行为）同语义变更（值域、配置、联动）分步骤隔离，check 独立按 CASE 复核。
- Open Questions：无——对齐轮全部决策节点已定案（Q1 至 Q7）。

## Alignment Decisions

1. 角色值域形态（用户提议，替代主会话原推荐）：五角色叙述不变，Developer 拆 developer 与 frontend-developer 两个派发类型，frontend 的机制价值（UI 派发门禁）保留为 Developer 的专项分支。拒绝项：撤销 frontend 并同步撤 ui-dispatch-ready 门禁（子任务三刚保留该守卫，立即撤销属反复，UI 纪律从机制强制降级为文档建议）；保留 frontend 为五角色体系外的第六类型（值域叙述不成体系）。
2. 专项类型命名 frontend-developer（Q7=A）。拒绝项：developer-ui（业界通行度低）、保留原值 frontend（值域命名不成体系，省的只是一条映射表项）。
3. 历史派发记录兼容读、不改写（Q2=A）。拒绝项：一次性迁移改写（归档与 journal 是不可变事实记录，改写风险大收益零）。
4. planReview 联动（Q3=A）：评审派发自动置 reviewing，新工具 workloom_task_planreview 由 Owner 标 revising 与 clean。拒绝项：三态全手动（派发是可观测事实，自动置位少一次人为遗漏）。
5. 配置（Q4=A 加用户补充变更）：角色键缺失继承宿主默认加 info 行；根层级 subagents 字段退役，出现即 fail loud 给迁移指引。拒绝项：缺键拒绝派发（破坏零配置可用基线）、静默忽略旧字段（配置漂移无提示）。
6. workloom_execute 参数 kind 直接改名 role、不留别名（Q5=A）。拒绝项：保留 kind 别名过渡（工具面无外部消费方负担，别名徒增第二条维护路径）。
7. 大文件拆分采子目录收敛（Q6=B，修订后推荐获用户采纳）：task/state/ 与 task/storage/ 各以 index.ts 为唯一对外入口。拒绝项：平铺兄弟文件（违反目录根只留对外入口的编码原则，评审单元边界不清）。
8. 单次重试语义（Q8=A，事实盘点后补裁）：模型不可达错误码分类命中时，按该角色 fallback_models 链的下一模型一跳重派；重试再失败或无链则结算 failed 并报错；fallback_models 配置面随之恢复消费，'rotate' 模型来源值保持惰性历史值（值域只增不减）。拒绝项：同模型重试（对不可达类错误无意义，配置面沦为死配置）、不重建重试（与子任务二"单次重试落子任务四接线"的在档裁定相悖）。
9. R6 info 行载体（Q9=A，事实盘点后补裁）：重建 session-context 执行器画像节，按五角色值域渲染清单，缺配置角色输出 not configured（inherits parent session model）风格 info 行；渲染内嵌 session-context 不立独立模块（兼顾子任务二"不值得单列模块"裁定），派发 receipt 的模型来源显示照旧。拒绝项：以 receipt 来源显示替代并收窄验收基线、info 行挪 doctor 输出（失去常显可见性）。
10. subagent_profiles 条目内层字段 subagents 改名 roles（用户 2026-11-08 提议，即变更确认）：名实一致——条目按角色承载配置，键词汇即五角色值；条目出现旧字段名 fail loud 给 roles 迁移指引，与根层级 subagents 退役同口径。拒绝项：内层字段保留原名（字段名与角色词汇脱节，pin 切换时配置迁移再背一处补丁）。

## References

- 需求增补记录（流程规矩、Judger 一等公民澄清、追溯评审意见路由第 5 至 9 与 14 条、子任务三实现裁定）：.workloom/tasks/11-06-sop-refactor/requirements-addendum.md
- 重写复用评估基线（executor-guard.ts 改造保留条目）：.workloom/tasks/11-06-sop-refactor/rewrite-reuse-eval.md
- SOP 原文提取（角色定义）：/tmp/workloom-sop.txt
- 关键代码现状：packages/core/src/dispatch/executor-kinds.ts、packages/core/src/workspace/config-subagent.ts、packages/core/src/task/state-machine.ts、packages/core/src/injection/prompt-compose.ts、packages/dsh-workloom/src/dispatch/executor-guard.ts、packages/core/resources/skills/workloom-alignment/references/ui-design.md

## Notes

- UI Design 章节不适用：本任务为 CLI 与插件代码重构，无前端界面呈现，对齐的 UI 适用性节点判否。
- 测试先行不作强制交付模式：本任务主体是行为保持的重构加机制切换，验证以既有 node --test 全量套件加新增直测（R12 与各 AC 所列）为准。
- 术语约定：「专项派发类型」指 frontend-developer；「旧 kind 值」指 research、implement、check、frontend、review 五值；「宿主默认」指继承父会话模型与 effort。
