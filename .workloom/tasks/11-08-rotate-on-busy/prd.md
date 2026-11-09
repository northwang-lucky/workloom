# rotate_on_busy 轮换恢复

## Context

子任务二曾按评估改判"角色制下模型由派发方显式指定，轮换失去意义"删除同类并发轮换（executor-rotation.js 与 executor.ts 轮换段，62332be）。用户 2026-11-08 推翻该改判：新版必须支持 rotate_on_busy。现状（子任务四归档后）：subagent_profiles[i].roles 条目解析不接受 rotate_on_busy（unknown field 即 loadConfig 抛错）；DispatchModelSource 保留 'rotate' 为惰性历史值；fallback_models 解析链存在且已恢复消费（单次重试一跳：model-failover.ts 加 executor-spawn.ts 加 settle 钩子）。用户全局配置四角色均配 rotate_on_busy: true——不恢复轮换即切换生产 pin 会导致 loadConfig 抛错、全链路瘫痪（增补记录"全局配置事故记录"节④）。本任务排序在子任务四后、子任务五前，生产 pin 切换前必须归档。

## Goal

在新角色派发链路恢复 rotate_on_busy 能力，语义全盘沿旧实现：同角色忙时再派发，从 fallback_models 池顺延取首个未占用模型起步，环序物化为线性重试链并与子任务四的单次重试一跳衔接，留痕与回执标注恢复。完成后可观测：配置解析 rotate_on_busy 且严格校验；轮换选取、回绕、占用取数、链物化行为被测试钉住；轮换派发记录 modelSource='rotate'、receipt 含 (rotated: <model>) 标注；开关关、显式 model、续用轮、容量拒绝四路径零行为变化；标准验证全绿。

## Scope

范围内：

1. 配置解析：roles 条目放行 rotate_on_busy——boolean 严格校验（字符串/数字布尔不收，fail loud），仅显式 true 落内存字段 rotateOnBusy（false 与缺省等价不落），落点 config-subagent.ts（现仅剩 subagent_profiles 一层，旧"两层同语法"已成历史）。
2. 轮换纯函数按角色值域以 TS 重写移植：selectRotationStartIndex 与 materializeRingChain（函数级拷贝口径，非文件搬迁；落位归 plan，唯一消费方先例参照 dispatch-binding 迁 dsh）。
3. 派发编排接线：容量闸放行后的同步段执行轮换选取（判定到选取到 in-flight 登记之间无 await 间隙）；进入条件为开关 true 且未显式传 model 且 fallback 链非空。
4. 留痕与回执：DispatchModelSource 'rotate' 转活；receipt 追加 (rotated: <model>) 标注。
5. 测试面：R1-R6 全部行为的钉住测试。

范围外（非目标）：

- 容量闸语义（max_concurrent 判定不变，轮换只在闸放行后选模）。
- 单次重试语义（子任务四决定 5 已定形；本任务只以"重试链即物化链"衔接，不改 settle 钩子逻辑）。
- 画像节形态（Q3=A 不展示开关，子任务四定形的钉住面不动）。
- spec 与 workflow 文档更新（transport-failover 等过期条目归子任务七）。
- 生产 pin 切换与全局配置迁移执行（容器决定 10；本任务归档后前置清单仅剩 roles 字段改名与角色键改名两项）。

## Assumptions, Constraints and Dependencies

- 环境约束同子任务四：Node v24 原生 TS type stripping（禁 enum/namespace/参数属性）；dsh 经 file:../core 的 exports 解析 core dist，验 dsh 前先 pnpm -r build；dist 同 commit 重建入库；提交分组纪律（实施步骤只验证不提交、末步单一 work commit、簿记另走 chore）；测试 HOME 加 TMPDIR 隔离惯例。
- 依赖子任务四产物：executor-roles 值域与 tryNormalizeExecutorRole、executor-spawn.ts 共享组装、model-failover.ts 分类、settle 一跳重试钩子、容量闸 role 化契约（record.role/roleLimit/roleCount）、roles 配置面。
- 旧实现事实源：git 62332be^ 的 executor-rotation.js 全文、executor.ts 轮换段（67-73、384-389、540-570）、config.js:20-22 与 600-608 解析口径。
- 单文件 600 行风格线；目录入口原则；禁 Magic String；模块成员对外不可见优先。

## Requirements

- R1: 配置解析恢复——subagent_profiles[i].roles[<role>] 条目放行 rotate_on_busy；值必须为 boolean，字符串与数字布尔抛 WorkloomConfigError（文案含字段路径）；仅显式 true 落内存 rotateOnBusy 字段，false 与缺省等价不落。
- R2: 轮换纯函数沿旧语义以 TS 重写：selectRotationStartIndex（池 [主模型位, fallback_models…] 按序返回首个不在占用集合的下标；全占用或空池返回 0）与 materializeRingChain（起始条目加环序剩余线性链；空池 fail loud；下标越界夹回池内），落位派发链路供编排与测试共用。
- R3: 派发编排接线——rotateOnBusy 为 true 且未显式传 model 且 fallback 链非空时，容量闸放行后的同步段执行轮换（无 await 间隙）；主模型位条目（含 PARENT_MODEL_LABEL 继承形态）归一进池；占用取数三级优先：进程内绑定登记 → 本任务 dispatches 记录（值经 tryNormalizeExecutorRole 归一，历史旧值兼容计入）→ 读不到保守按主模型位归一；全占用回绕主模型位并视同主模型位起步（不拒绝、不排队、无轮换留痕）。
- R4: 零变化路径——开关缺省或 false、显式 model 参数、续用轮（continue 路径）、容量闸拒绝四种场景的派发行为与现状完全一致：不进轮换、modelSource 不为 'rotate'、receipt 无 rotated 标注。
- R5: 留痕与回执——轮换选中链条目起步（起始下标大于 0）的派发：记录 modelSource='rotate'（'rotate' 值从惰性历史转活），receipt 追加 (rotated: <model>) 标注含实际选定模型；主模型位起步无标注。
- R6: 重试衔接——轮换起步派发的单次重试一跳所取"链中下一模型"即物化线性链首元素（环序后继）；主模型位起步与现状链恒等；settle 钩子与一跳重试逻辑本身不变，衔接点为派发组装时传入的链值。
- R7: 测试与验证——R1 至 R6 行为全部有钉住测试；标准验证（pnpm -r build、pnpm -r typecheck、pnpm lint、两包 pnpm test）全绿；dist 同 commit 重建且镜像守卫通过。

## Acceptance Criteria

- AC1: 覆盖 R1：配置解析可判定。验证方法：单元测试构造 roles 条目 rotate_on_busy 为 true/false/字符串"true"/数字 1/缺失五种形态——true 落 rotateOnBusy，false 与缺失不落，字符串与数字抛 WorkloomConfigError 且文案含字段路径。
- AC2: 覆盖 R2、R3：轮换选取与回绕可判定。验证方法：纯函数单测钉住池序取首个未占用、全占用返回 0、空池物化抛错、越界夹回；编排级测试覆盖占用取数三级（进程内登记、dispatches 记录含旧值归一、保守归一）各至少一例；同步段无 await 间隙由静态复核承载（CASE 的 SR 条目观察）。
- AC3: 覆盖 R4：四路径零变化。验证方法：单元测试四场景（开关关、显式 model、续用轮、容量拒绝）派发记录与回执无轮换痕迹（modelSource 非 'rotate'、无 rotated 标注），与现行夹具一致。
- AC4: 覆盖 R5、R6：留痕与衔接可判定。验证方法：单元测试——轮换起步派发记录 modelSource='rotate' 且 receipt 含 (rotated: <model>)；轮换起步时 settle 钩子收到的链为物化环序（首元素为起点后继）；一跳重试的重派模型等于该后继；主模型位起步无标注且链恒等。
- AC5: 覆盖 R7：基线全绿。验证方法：pnpm -r build、pnpm -r typecheck、pnpm lint、两包 pnpm test 全零退出；dist 镜像守卫测试通过。

## Edge Cases and Failure Paths

- 全占用回绕：池内模型全部被同角色在飞会话占用——回绕主模型位起步，视同现状绑定，无轮换留痕（沿旧语义"回绕即零行为变化"）。
- 空链：rotate_on_busy 为 true 但无 fallback_models——链非空条件不满足，不进轮换，零行为变化。
- dsh 重启：进程内绑定登记丢失——占用取数回落第二级 dispatches 记录（running 状态记录计入），再缺失走第三级保守归一。
- 历史旧值记录：dispatches 里旧 kind 值的 running 记录经 tryNormalizeExecutorRole 归一后计入对应角色占用（跨切换边界不漏计）。
- 轮换起步后模型不可达：一跳重试取环序后继（R6）；重试再失败结算 failed 附文案（子任务四语义不变）。
- 与容量闸次序：容量闸先判（max_concurrent 拒绝路径不进轮换），放行后同步段才选模——次序不可颠倒，避免为将被拒绝的派发做选取。

## Risks and Open Questions

- 风险：同步段接线点在子任务四重构后的 executor.ts 与 executor-spawn.ts 结构中需精确定位（抽取共享组装后编排面有变化）。缓解：plan 编写前实读现码定锚，Judger 评审轮专项核接线点与无 await 纪律。
- Open Questions：无——Q1、Q2、Q3 全部定案（用户"全按推荐"）。

## Alignment Decisions

1. 轮换语义全盘沿旧实现（Q1=A）：环形池顺延、全占用回绕不拒不排、同步段选取、占用三级取数、四路径零变化、'rotate' 留痕与 receipt 标注。拒绝项：简化占用取数为仅 dispatches 记录（重新引入"已登记未落盘"异步窗口竞态）。
2. 重试链即轮换物化后的线性链（Q2=A）：沿旧"物化环、线性消费"组合，单次重试一跳取环序后继。拒绝项：重试与轮换解耦（产生第二套链序语义，重试可能跳回刚被判定占用的模型）。
3. 画像节不展示轮换开关（Q3=A）：沿子任务四定形的四段形态（model/effort/tools/source），行为态经 receipt 与派发记录可见。拒绝项：加标注（改动刚定形的钉住文案与测试面，收益低）。
4. 模块落位与编排细节归 plan 裁定：轮换纯函数落派发链路（唯一消费方归属先例：dispatch-binding 迁 dsh）；配置解析恢复落 config-subagent.ts。

## References

- 旧实现事实源：git 62332be^ 的 packages/core/src/dispatch/executor-rotation.js、packages/dsh-workloom/src/dispatch/executor.ts 轮换段（67-73、384-389、540-570）、packages/core/src/workspace/config.js:20-22 与 600-608
- 需求增补记录：.workloom/tasks/11-06-sop-refactor/requirements-addendum.md（"全局配置事故记录"节③④、"子任务四实现与检查遗留观察"节 6）
- 子任务四归档：tasks/archive/2026-11/sop-roles（prd/plan/case 为现行派发机制基线）
- 评估基线改判历史：.workloom/tasks/11-06-sop-refactor/rewrite-reuse-eval.md 的 executor-rotation.js 改判删除条目（本任务经用户裁定推翻）

## Notes

- UI Design 不适用（无前端呈现面）；测试先行不作强制交付模式（行为恢复类，验证以既有全量套件加新增钉住测试为准）。
- 本任务归档后更新 pin 切换前置清单：删去 rotate_on_busy 项，保留"全局配置 roles 字段改名加角色键改名"两项（见增补记录）。
- 术语：「轮换池」指 [主模型位, fallback_models…]；「主模型位」指生效配置 model 或 PARENT_MODEL_LABEL 继承形态；「占用」指同角色在飞会话已绑定的模型。
