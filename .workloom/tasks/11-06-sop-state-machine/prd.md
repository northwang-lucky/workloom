# 任务模式状态机

## Context

子任务一与子任务二完成骨架与清理后，任务生命周期仍散在四处：task-store 的 status 与 stage 判断、task-mode 值域、active-task 指针、alignment 凭据；门禁是函数集合，承载不了三模式迁移表；确认流程没有自治度维度。SOP 要求三种任务模式成为代码一等公民。本任务建显式状态机，把门禁收编为迁移守卫，并落自治模式的门禁侧。

## Goal

core 内建三模式声明式迁移表与守卫函数；任务生命周期读写收敛到状态机模块单一入口；确认流程按 manual、semi、auto 接自治度字段；doctor 检查集按新状态机重建为五类。完成后可观测：非法迁移被表拒绝且错误可判定；三模式阶段序列各自闭合；旧任务记录经兼容层可读。

## Scope

包含：

1. 新建状态机模块（迁移表、守卫、迁移入口），落 core/src/task/。
2. task-store 重写：status 与 stage 迁移判断改调状态机迁移入口，读写面按存储、迁移、派发记录分层。
3. task-gates 重写：六类门禁收编为迁移守卫，门禁函数集合形态退役。
4. task-mode 值域改 light、standard、parent；旧 full 兼容读作 standard；建任务参数可指定 mode=parent，加有子任务者兜底推断为 parent。
5. 阶段枚举与序列：主线 aligning、planning、implementing、checking、archived；parent 主线 aligning、planning、orchestrating、integrating、archived；CASE 轨道 casePhase 取 none、designing、reviewing、approved、executing、done，与主线并行；checking 进入守卫要求 implementing 完成且 casePhase 为 approved；light 无 CASE 轨道，implementing 直达 archived。
6. autonomy 字段（manual、semi、auto，默认 manual）与确认迁移：manual 维持现状；semi 的 PRD 确认人工、PLAN 确认自动记录；auto 两确认均自动记录；自动记录在 summary 注明 autonomy 与自动来源。
7. active-task 指针读写收进状态机模块，指针文件机制不变。
8. doctor 检查集重建为五类：生命周期一致性、确认记录完整性（对照 autonomy）、CASE 记录一致性、worktree 一致性、config 检查。
9. adapter 工具门禁改查状态机：tasks.ts 八工具的放行拦截与 executor 派发门禁。
10. planReview 轨道：none、reviewing、revising、clean 四值；Judger 评审派发置 reviewing，带意见回报置 revising，复审零意见置 clean；plan 确认迁移守卫要求 clean；该轨道与 autonomy 无关。本任务落阶段、记录与守卫；Judger 角色派发绑定归子任务四。

不包含（non-goals）：

1. 角色体系与 executor 重写、旧 kind 值域切换、failover 错误码分类与单次重试（子任务四）。
2. 父子编排逻辑与集成 CASE 机制实现（子任务五）；本任务只定 orchestrating 与 integrating 阶段及守卫（子任务全归档、集成 CASE 通过）。
3. 对齐 skill 与 workflow 文档的自动模式行为（子任务七）。
4. 迁移 skill（子任务六）。
5. 生产切换（容器决定 10）。
6. Judger 角色的派发绑定与评审会话编排（子任务四）；本任务只落 planReview 阶段、记录与守卫。

## Assumptions, Constraints and Dependencies

1. CASE 设计与代码实现并行（SOP 标准模式流程），故主线与 CASE 轨道正交；对齐确认的"六阶段"以主线五阶段加 CASE 轨道落实，门禁行为与确认序列等价。
2. 旧任务记录（含归档）不改写；兼容层收在状态机读取单点。
3. 自动驾驶的对齐阶段行为（不出提问轮）属 skill 侧，归子任务七；本任务只落门禁侧确认迁移。
4. 新代码一律 TS 且仅可擦除语法。
5. doctor 空槽提示行随检查集重建退役，五类就位后不再输出该行。
6. Judger 评审是角色工作，与 autonomy 无关：auto 模式也先跑 Judger 评审到零意见，再自动记录 PLAN 确认。

## Requirements

- R1: 迁移表为三模式允许迁移与通过条件的唯一事实源，全部生命周期迁移经表执行。
- R2: 非法迁移被拒绝并给出可判定错误（当前状态、请求迁移、理由）。
- R3: task-store 的 status 与 stage 写入口单一，指针读写收编，四处分管收敛。
- R4: task-gates 函数集合形态退役，六类门禁收编为迁移守卫。
- R5: 模式值域 light、standard、parent；旧 full 兼容读作 standard；parent 由参数加兜底推断认定。
- R6: 三模式阶段序列按 Scope 5；checking 进入守卫为 implementing 完成且 casePhase approved；light 的 implementing 直达 archived 不要求 CASE。
- R7: autonomy 三值的门禁侧行为按 Scope 6；自动记录含审计来源。
- R8: doctor 五类检查集就位，空槽提示行退役。
- R9: adapter 工具与派发门禁查状态机，无本地门禁判断。
- R10: planReview 轨道四值与 plan 确认守卫按 Scope 10；Judger 评审在任何 autonomy 值下都不跳过。

## Acceptance Criteria

- AC1: 覆盖 R1、R2、R3、R4：状态机模块行为可判定。验证方法：探针脚本对三模式各走一条合法迁移链全程通过；非法迁移抽样（跳过确认进 implementing、light 进 checking、standard 未批 CASE 进 checking）全部被拒且带理由；grep task-gates 旧导出名零命中。
- AC2: 覆盖 R5：模式兼容可判定。验证方法：探针读旧 full 记录得 standard；新建 parent 参数与兜底推断两路都得 parent；grep task-mode 旧值域常量零命中。
- AC3: 覆盖 R6：序列守卫可判定。验证方法：探针验 standard 的 checking 进入在 casePhase 未批准时失败、批准后通过；light 链无 CASE 轨道；parent 的 integrating 进入在子任务未全归档时失败。
- AC4: 覆盖 R7：自治度门禁可判定。验证方法：探针验 semi 的 PLAN 确认迁移以自动记录通过且 summary 含自动来源；manual 行为不变；auto 两确认均自动；grep 确认调用点全经状态机入口。
- AC5: 覆盖 R8：doctor 五类可判定。验证方法：临时目录探针输出五类检查结果；构造非法状态任务样本时生命周期一致性报 issue；空槽提示行零命中。
- AC6: 覆盖 R9：adapter 门禁收敛可判定。验证方法：grep tasks.ts 与 executor.ts 直调旧门禁函数零命中；工具放行拦截行为测试全绿。
- AC7: 覆盖 R1 至 R9：仓库标准验证全绿。验证方法：pnpm lint、pnpm -r typecheck、pnpm -r build、两包 node --test 全退出码 0。
- AC8: 覆盖 R10：planReview 守卫可判定。验证方法：探针验 planReview 非 clean 时 plan 确认迁移失败、clean 后通过；semi 与 auto 记录同样经过 Judger 评审轨道；grep plan 确认入口全含 plan-review-clean 守卫。

## Edge Cases and Failure Paths

1. 旧记录 stage 旧值（implement、check 等）：兼容层读取时映射到新枚举，映射表单点收敛；未映射值报可判定错误，不静默默认。
2. autonomy 中途切换只影响未发生的确认迁移，已记录确认不追溯改变。
3. parent 兜底推断与参数冲突时参数优先，推断只补未传参数者。
4. CASE 轨道与主线并发写：迁移入口经 file-atomic 写锁串行化任务记录写入。
5. planReview 的 revising 轮数只记录不判定；doctor 生命周期一致性只看轨道值合法性，轮数不设上限。

## Risks and Open Questions

无。建模说明（主线五阶段加 CASE 轨道落实已确认的六阶段门禁）记于 Alignment Decisions。

## Alignment Decisions

1. 声明式迁移表加守卫函数。拒绝每模式一个类与函数集合形态：表是唯一事实源，门禁与 doctor 共查。
2. 值域 light、standard、parent 加兼容读。拒绝改写存量记录与保留 full 命名：改写历史无收益，兼容层单点且体量极小。
3. parent 由参数加兜底推断认定。拒绝纯推断与纯参数：意图显式且现存容器任务不被判非法。
4. CASE 设计与实现并行、以独立轨道建模，checking 进入需双完成。拒绝把 case-design 并入 implementing：会丢门禁判定点。已确认的"standard 六阶段"以主线五阶段加 CASE 轨道落实，门禁行为等价。
5. doctor 检查集五类。拒绝三类：确认记录与 CASE 记录是状态机新增门禁，doctor 要能诊断卡在非法状态的任务。
6. planReview 以独立轨道建模（比照 casePhase），plan 确认前守卫要求 clean。拒绝把评审状态折进 planning 阶段黑盒：守卫需要可判定记录。用户于 2026-11-07 明确 Judger 为一等公民角色，功能跨子任务三与子任务四落地。
7. 收敛摘要：五决策节点全采纳推荐；前沿为空；建模说明已记录。

## References

1. 去留评估基线：[.workloom/tasks/11-06-sop-refactor/rewrite-reuse-eval.md](../11-06-sop-refactor/rewrite-reuse-eval.md)（task-store 与 task-gates 重写行、基线规则 1 与 4）
2. 需求增补记录：[.workloom/tasks/11-06-sop-refactor/requirements-addendum.md](../11-06-sop-refactor/requirements-addendum.md)（自治模式五项决定与审计口径）
3. 子任务二归档：tasks/archive/2026-11/sop-cleanup（doctor 空槽与 kind 过渡衔接点）

## Notes

1. 旧 kind 值域切换归子任务四，状态机不碰 kind。
2. orchestrating 与 integrating 的具体编排和集成 CASE 机制归子任务五，本任务只定阶段与守卫。
