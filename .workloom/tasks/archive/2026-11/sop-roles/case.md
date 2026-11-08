---
version: 1
task: tasks/11-06-sop-roles
---

# CASE: 角色体系与子会话派发

## References

- PRD: `prd.md`
- Implementation: `plan.md`（十四设计决定 / 十八步骤；行号锚点以 main HEAD `7da3846` 为准，终态以步骤 18 的单一 work commit 为准）
- Code target: worktree `.workloom/worktree/11-06-sop-roles`（分支 `workloom/11-06-sop-roles`，基线 `main`@`7da3846`）。下文相对路径以该 worktree 为根；`<task>` 指主检出侧任务目录（本文件所在 `.workloom/tasks/11-06-sop-roles`，不是 worktree 副本），可用 `$(cd "$(git rev-parse --git-common-dir)/.." && pwd)/.workloom/tasks/11-06-sop-roles` 解析。
- Facts: `research/roles-dispatch-facts.md`（盘点报告，下文以「盘点 §n」引用其章节事实）
- Source task: none（容器任务 workloom-sop 重构的子任务四，无归档来源）

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7、R8、R9、R10、R11、R12、R13
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5、AC6、AC7、AC8、AC9、AC10
- Out of scope:
  - skill 与 workflow 文档的整体叙述改写，以及 workflow.md 的旧 stage 字样（stage `implement`/`check`）——归子任务七（plan 决定 11 的用户已确认裁定）；本 CASE 只验派发指令处的机械 kind 字样切换，旧 stage 字样在 C3 命中清单中按「归子任务七」归属标注，不计残留。
  - 父子任务编排（子任务五）、迁移 skill（子任务六）、生产 pin 切换（容器最终验收后统一处理）。
  - 状态机迁移表与守卫的语义变更（子任务三已定形，本任务只拆分与切换判定值；ui-dispatch-ready 按现语义口径验证）。
  - 生产 DSH 实例操作：任务期间运行中的 `dsh web`（端口 3088，tmux 会话 dshweb）不重启、不执行 `dsh-stop`/`dsh-start`、profile 不重钉；全部探针在 worktree 内经 node 直跑，生产目录只读。
  - 代码提交：CASE 执行轮不产生任何 git commit 与 push；步骤 18 的单一 work commit 由主会话执行，本 CASE 只观察其形态（C13）。本 CASE 自身产物（case-result.md、case-evidence/、coverage/）只写主检出 `<task>`；探针临时夹具建在隔离 HOME 加 TMPDIR 下并在脚本内自清理。

## Static Review

### SR1 值域模块：五角色、显示名与兼容映射单点

- Covers: AC2、AC3
- Target: `packages/core/src/dispatch/executor-roles.ts#normalizeExecutorRole`
- Checks:
  1. EXECUTOR_ROLES 为冻结对象且恰五键：RESEARCHER='researcher'、DEVELOPER='developer'、FRONTEND_DEVELOPER='frontend-developer'、CHECKER='checker'、JUDGER='judger'（as const 加 Object.freeze 形态，无 TS enum 关键字）；ExecutorRole 类型为五值联合；isExecutorRole 守卫对域外值判否；Owner 不入值域（无第六成员）。
  2. ROLE_LABELS 冻结映射值到显示名恰为：researcher→Researcher、developer→Developer、frontend-developer→Frontend Developer、checker→Checker、judger→Judger；dsh 侧 KIND_LABELS 退役（grep KIND_LABELS 在 packages/dsh-workloom/src 零命中），executor-injection.ts 改消费 core 的 ROLE_LABELS。
  3. LEGACY_KIND_TO_ROLE 冻结映射恰五条：research→researcher、implement→developer、check→checker、review→judger、frontend→frontend-developer；normalizeExecutorRole 对新值原样返回、五旧值按表映射、其余值抛含 ERR_PREFIX 与未知值字面的可判定错误；tryNormalizeExecutorRole 为未知值返回 null 的非抛错变体（供运行期扫描与收集面使用）。
  4. 过渡容忍 isExecutorRoleOrLegacy 已随步骤 7 退役：grep isExecutorRoleOrLegacy 与 EXECUTOR_KINDS 在两包 src 零命中；executor-kinds.ts 文件不存在，core index.ts 无旧导出段。
  5. 模块为纯常量零业务依赖，头注释写明设计意图；本模块是 R4 兼容读的唯一映射单点（盘点 §10 的 8 处记录直读点与视图层全部经此归一，与 SR3 互验）。
- Expected: 值域、显示名与兼容映射有唯一事实源，旧值域模块与过渡守卫零残留，未知值可判定报错。

### SR2 工具面：workloom_execute 的 role 参数与 fail loud

- Covers: AC3、AC4
- Target: `packages/dsh-workloom/src/dispatch/executor-schema.ts#buildExecutorSchema`
- Checks:
  1. schema properties 含 role（type string 加 enum 恰五新值，描述引 PARAM_DESCRIPTIONS.role），无 kind 属性；required 恰为 ['role','prompt','title']；purpose 的 enum 恰为 ['case-design','execution','plan-review']（case-executor.test 的 enum 钉住句同步更新为三值）。
  2. core surface.ts：PARAM_DESCRIPTIONS 的 kind 键改名 role，model/effort 描述改指 subagent_profiles[i].roles.<role> 路径字样（决定 15，无根层级 subagents 字样）；TOOL_DESCRIPTIONS.executor 与 TOOL_SNIPPETS.executor 切 role 词汇；buildCrossKindReuseRejectText 改名 buildCrossRoleReuseRejectText，续用拒绝三文案切 role 词汇（surface.test 钉住同步）。
  3. prompt-compose 入口的 assertKind 改名 assertRole 并收严：只收五新值，旧值与未知值抛 'invalid role' 风格可判定错误（不留 kind 别名；grep assertKind 在两包 src 零命中）。
  4. 传旧参数名或旧值双层显式报错：传 kind 而缺 role 经 required 校验拒绝；传旧值 role 经 schema enum（第一层）或 assertRole（第二层）拒绝，错误文案含新值域清单；无任何静默降级路径，错误经 executeTool 透传。
  5. 会话上下文工具说明可见 role 参数：session-context 渲染的工具说明面（TOOL_SNIPPETS 与 PARAM_DESCRIPTIONS 词汇）含 role 字样——C5 直出验证。
- Expected: role 参数就位且带 enum 约束，无 kind 别名，旧参数名与旧值两层可判定报错。

### SR3 兼容读：视图层归一与记录级直读点

- Covers: AC2
- Target: `packages/core/src/task/state/view.ts#toTaskView`
- Checks:
  1. toTaskView 对 dispatches 逐条经 normalizeExecutorRole 归一（守卫与视图消费方天然见新值）；storage 规范化层的 normalizeDispatchRecord（read-write.ts）不改 kind 值，任何写回路径都不改写磁盘历史值。
  2. 盘点 §10 的 8 处记录级直读点全部显式归一，统一口径为记录值与比较目标两侧经 normalizeExecutorRole 归一后再比较：ui-dispatch-ready 守卫（state/guards.ts）、CASE 轨道推进三处（dispatch-records.ts）、CASE 执行链回溯（case-gates.ts，常量更名 CHECK_KIND→CHECK_ROLE 且判定值改引 EXECUTOR_ROLES.checker）、doctor CASE 一致性两处（doctor-check-rules.ts）、session-context Last dispatch 行（显示前归一）、dsh 容量收集（executor-capacity.ts）、dsh 续用同角色校验（executor-continuation.ts，双侧经 tryNormalizeExecutorRole）、dsh 写守卫身份重建（executor-guard.ts，详见 SR8）。
  3. 未识别值（既非旧 kind 也非新角色）在兼容读入口 normalizeExecutorRole 显式抛错不静默；运行期扫描与收集面用 tryNormalizeExecutorRole 分面处理：容量收集面保留脏值记录并计入全局闸、仅角色闸计数排除并加 WARNING；过滤重建面（guard/toolface）脏值不入结果集并加 WARNING。
  4. 历史文件不改写：兼容读只发生在内存视图与判定点，磁盘 task.json 与归档 task.json 保持旧值原样（C4 探针以字节比对验证）。journal 模块已全仓退役（盘点 §10），无生产读取面，R4 的 journal 约束体现为历史文件（git 历史与归档 eval 夹具）保持原样、探针零触碰。
- Expected: 兼容映射单点生效，8 处直读点两侧归一，未知值可判定报错，历史文件零改写。

### SR4 配置：根层级 subagents 退役与两层解析链

- Covers: AC5
- Target: `packages/core/src/workspace/config-load.ts#loadConfig`
- Checks:
  1. 根层级 subagents 字段出现即抛 WorkloomConfigError（field 'subagents'，文案含 'is no longer supported; migrate to subagent_profiles' 迁移指引），全局层与项目层同口径（原 WARNING 放行、白名单特判与 provenance 跟踪链三处同步移除）；配置同时写根层级 subagents 与 subagent_profiles 时，加载期先报根层级退役错误，不进入解析链。
  2. DEFAULT_CONFIG 不含 subagents 字段；WorkloomConfig 类型面（config.d.ts）删 subagents 与 subagentsSource 字段；parseSubagents 删除；PROVENANCE_FIELDS 与 trackLayerProvenance、attachConfigProvenance 的 subagents 分支退役。
  3. resolveSubagentDefaults 解析链收敛为 显式参数 > subagent_profiles 命中条目 > undefined（继承宿主默认）：命中条目缺某角色键时 model 与 effort 均为 undefined；'legacy' 从 ResolveSubagentDefaultsResult 来源联合中删除；DispatchModelSource 的 'legacy' 成员保留惰性历史值（task-store.test 的「值域只增不减」放行用例不变）。
  4. roles 条目内部命中旧五值键时输出加载期一次性 WARNING（文案指向新 role 键名，不抛错不破坏存量环境——决定 15：WARNING 机制不变）；buildConflictNotice 文案切 subagent_profiles.<role>；configSourceSuffix 删 legacy 分支；doctor checkConfig 的 hint 文案无 subagents 字样。
  5. subagent_profiles 条目的内层字段 subagents 改名 roles（用户 2026-11-08 裁定，决定 15）：parseSubagentProfiles 读 entry.roles，config.d.ts 的 SubagentProfile 类型字段同步改名，resolveSubagentDefaults 命中查表改 roles 段（matched?.roles[role]）；条目内出现旧字段名 subagents 抛 WorkloomConfigError 且文案含 roles 改名迁移指引（与根层级退役同 fail loud 口径，不做兼容读）。
  6. config.test 原「全局遗留 subagents WARNING 加照常解析」用例反转为抛错且文案含迁移指引；原三层合并用例改两层；profile 条目夹具全部切 roles 字段名（dsh executor.test 等的 subagent_profiles 夹具同批同步）；条目内旧字段名 subagents 报错新增用例。
- Expected: 根层级与条目内旧字段名双双 fail loud 且带迁移指引，内层字段 roles 就位，解析链两层化，旧角色键 WARNING 不破坏存量。

### SR5 session-context：执行器画像节重建与 Last dispatch 归一

- Covers: AC2、AC5
- Target: `packages/core/src/injection/session-context.ts#assembleSessionContextText`
- Checks:
  1. 画像节为 session-context.ts 内嵌渲染函数，不立独立模块文件（grep executor-profiles 在 packages/core/src 零命中）；节位置在 Last dispatch 行后、Git 节前（按 62332be^ 历史形态实际线序）。
  2. 按 EXECUTOR_ROLES 五角色逐角色渲染：经 resolveSubagentDefaults(config, role, {}, mainModel) 取生效配置；有配置角色输出 model 与 effort 及来源标注（whenMain=… 或 fallback）；无配置角色输出 info 行，文案逐字 `not configured (inherits parent session model)`。
  3. 节头文案逐字沿旧：mainModel 在位时 `Executor profiles (main model <mainModel>):`；缺失时 `Executor profiles (main model unknown; whenMain entries skipped):`（此时 whenMain 条目全部跳过，走无 whenMain 的回退条目或宿主默认，现语义不变）。
  4. assemble 参数面扩 config 与 mainModel 可选入参；dsh plugin.ts 接线恢复（loadConfig 加 readMainModel 传参），main-model.ts 头注释「画像 whenMain 匹配」语义复原；config 加载失败时画像节降级为不渲染加 WARNING，会话上下文不中断。
  5. Last dispatch 行显示归一后的角色值（SR3 的显示归一），畸形值防御分支保留；session-context.test 的两处逐字钉住按归一后显示值更新并补新值主用例；inject.test 90 行的 'Executor profiles' 过期注释修正且集成面含画像节断言。
- Expected: 画像节按五角色值域渲染生效配置，info 行与节头文案逐字可判定，mainModel 注入接线恢复。

### SR6 planReview：派发联动与 workloom_task_planreview 工具

- Covers: AC2、AC6
- Target: `packages/core/src/task/doc-review.ts#executePlanReviewMark`
- Checks:
  1. purpose 值域扩为 case-design、execution（checker 专用）加 plan-review（judger 专用）：DispatchPurpose 类型联合扩展；dispatch-records 的 purpose 合法性校验按 role 分支（checker 收 case-design/execution、judger 收 plan-review、其余 role 传 purpose 拒绝）；buildDispatchRecord 的 purpose 写入分支扩到 judger。
  2. 自动置位：executor.ts 派发成功后，role=judger 且 purpose=plan-review 且当前 planReview.phase 属 {none, revising} 时调 recordPlanReview 置 reviewing；已 reviewing 幂等跳过；phase=clean 时不动轨道并输出一行 WARNING（clean→reviewing 非合法边）；置位失败仅 WARNING 不回滚派发（同 recordExecutorOverride 模式）；非 plan 评审目的的 judger 派发（无 purpose 或追溯代码评审）不触碰 planReview 轨道。
  3. executePlanReviewMark 入参 {phase:'revising'|'clean', taskPath?}，落位 doc-review.ts（与 executeAlignTask/executeTaskCase 同族；task-ops.ts 不新增编排），cwd/root/task 解析同 align 模式，写口复用 recordPlanReview（revising 轮数自增，非法边给可判定错误），返回视图投影。
  4. dsh tasks.ts 注册 workloom_task_planreview：schema 为 phase enum ['revising','clean'] 加可选 taskPath 加 additionalProperties false，描述引 PARAM_DESCRIPTIONS；主会话限制照抄 align 的 delegationDepthOf 硬拒绝样板（depth>0 抛 'only be called from the main session' 风格文案）；output 走 renderTask 投影。
  5. surface.ts 的 TOOL_NAMES 加第十二键 workloom_task_planreview，TOOL_DESCRIPTIONS 与 TOOL_SNIPPETS 补条目，TOOL_SNIPPETS 的计数文案「十一个工具」改「十二个」；core index.ts 导出 executePlanReviewMark。
  6. 测试面：tasks.test 补第十工具 schema 与主会话限制用例；executor.test 覆盖自动置位四观察点（judger 加 plan-review 置 reviewing、reviewing 再派幂等、clean 态派发不动轨道仅 WARNING、judger 无 purpose 不动轨道）且 checker 的 purpose 行为不变；task-ops.test 补 executePlanReviewMark 用例（revising 轮数加一、clean 落定、非法边报错；函数宿主在 doc-review.ts）。
- Expected: plan 评审派发自动置 reviewing，工具仅主会话可用且两种标记均写记录，非评审目的派发轨道零变化。

### SR7 ui-dispatch-ready 守卫：判定值切换且语义不变

- Covers: AC2、AC7
- Target: `packages/core/src/task/state/guards.ts#guardUiDispatchReady`
- Checks:
  1. 判定改用 EXECUTOR_ROLES.FRONTEND_DEVELOPER：基于 toTaskView 归一后的 view.dispatches 检查 frontend-developer 派发记录存在性；经 SR3 的视图层归一，历史旧 frontend 记录自然计入（盘点 §10 确认 frontend 旧值全仓零条真实历史记录，兼容面只能以夹具构造验证）。
  2. FRONTEND_DISPATCH_MISSING 拒绝文案（state/audit.ts）切为 'no frontend-developer dispatch recorded for a task with UI requirements'；state-machine.test 的文案钉住同步更新。
  3. 守卫语义不变：UI Design 章节有实质内容且无 frontend-developer 派发记录时拒绝 implementing 迁入 checking；UI_DESIGN_SECTION、UI_NOT_APPLICABLE_PREFIXES（中英词表）、空正文口径、PRD 缺失与小节缺失分支全部保持子任务三形态；light 任务豁免与 force 越权留痕（OVERRIDE_GATES 记录）行为不变。
  4. 测试面：UI 门禁用例夹具新旧双值——新值 frontend-developer 主用例加旧值 frontend 兼容用例（经兼容读同样满足门禁）。
- Expected: 门禁判定绑定 frontend-developer，旧 frontend 记录经兼容读计入，豁免与留痕语义与子任务三一致。

### SR8 写守卫：受守卫角色集合与派发记录扫描共享实现

- Covers: AC2、AC8
- Target: `packages/dsh-workloom/src/dispatch/dispatch-scan.ts#scanDispatchRecords`
- Checks:
  1. dispatch-scan.ts 导出 scanDispatchRecords(root)：遍历 <root>/.workloom/tasks/ 非归档任务的 task.json，返回带任务归属的派发记录列表；坏 JSON 与缺字段防御沿现有语义（单条脏记录不抛异常中断全项目重建），archive 排除内置，空集占位防毒化语义不变。
  2. executor-guard.ts：WRITE_GUARDED_KINDS 改名 WRITE_GUARDED_ROLES 且值恰为 [researcher, judger]；executor.ts 派发成功点的 registerWriteGuardChildId 接线按新集合判定；重建处改接 scanDispatchRecords 加 tryNormalizeExecutorRole 过滤收受守卫 childId——历史旧 research 与 review 记录识别为受守卫身份，脏值跳过加 WARNING。
  3. executor-toolface.ts 的 toolsAllow 重建改接同一 scanDispatchRecords（盘点 §11 第 10 条的两份独立扫描实现去重为一份），guard 与 toolface 两处行为零变化（既有重建与防毒化用例保持全绿）。
  4. 受守卫的 researcher 与 judger 子会话仅允许写 <cwd>/.workloom/ 内路径：write 与 edit 工具的路径参数在域外拒绝、域内放行、非受守卫角色放行；bash 写文件边界维持现状不扩大承诺。
  5. 新增 scan 共享模块直测（归档排除、坏 JSON 防御、多任务聚合）；既有写守卫用例保持并覆盖旧 kind 值夹具（rebuildWriteGuardChildIds 重建、空集防毒化、越界拒绝与域内放行、researcher/judger 派发接线登记、developer 不登记）。
- Expected: 扫描单实现两处共用，受守卫集合绑定新角色，历史旧值身份重建可判定。

### SR9 dsh 派发链路：角色绑定全面切换

- Covers: AC2
- Target: `packages/dsh-workloom/src/dispatch/executor.ts#executeTool`
- Checks:
  1. ExecutorArgs.kind 改名 role；resolveSubagentDefaults、detectExecutorConflicts、composeLocalDirectivesText、容量闸、buildChildLabel、in-flight 登记的传参链全部切 role；recordExecutorDispatch 写入新角色值且字段名 kind 保留（domain-module 规范禁止重命名 task.json 字段——决定 1）；WRITE_GUARDED 判定切新集合（SR8）；头注释与五处 startContinuable 注释改 startActivation。
  2. core local-prompts.ts：LOCAL_FRAGMENT_TARGETS 切七新 target（main/researcher/developer/frontend-developer/checker/judger/all）；TARGET_BY_FILE 新旧双文件名映射同一 target（researcher.md 与 research.md 均映射 researcher，其余同理——决定 4）；错误文案列新 target 清单（local-prompts.test 两处钉住同步更新）。
  3. core executor-capacity.js 与 .d.ts：契约整体 role 化（实施现场裁定）——入参 kind 改名 role、模块内部形状切 record.role、roleLimit、roleCount 与层标记 'role'，at capacity 回执文案切 '<role> role at capacity'；两侧归一保留（running 记录值与 role 入参均经 tryNormalizeExecutorRole 归一后比较，历史旧值可计入）；task.json 的 DispatchRecord.kind 字段形状不受容量模块 role 化影响（check 6 核对）；dsh executor-capacity.ts：LABEL_TO_ROLE 与 roleFromLabel 按 ROLE_LABELS 反解析（'Frontend Developer' 含空格标签解析正确），收集与 in-flight 登记值归一。
  4. executor-injection.ts：86 行硬编码字面量改 EXECUTOR_ROLES.checker；buildChildLabel 形态 [<RoleLabel>] <title>、回退 workloom-<role>；discipline-text.ts：EXECUTOR_CONTRACT_BY_KIND 改名 EXECUTOR_CONTRACT_BY_ROLE 恰五新键，五段纪律文案角色名词对应切换，标题函数消费 ROLE_LABELS（discipline-text.test 的 ALL_KINDS 五值数组钉住切换为新值域）。
  5. executor-continuation.ts：同角色校验双侧经 tryNormalizeExecutorRole（旧在飞记录可续，脏值跳过加 WARNING），跨角色拒绝文案接改名后的 buildCrossRoleReuseRejectText。
  6. 测试面：executor.test 的五角色 label 断言、subagent_profiles 夹具内层字段切 roles 且角色键切新五值（决定 15）、task.json 派发记录形状 {kind:<角色值>,at,title,childId} 断言不变（字段名 kind 保留、值为新角色值，容量契约 role 化不回写 task.json）、容量回执 '<role> role at capacity' 文案断言同步更新。
- Expected: prompt 组装、标题标签、receipt、容量闸与续用校验全部以角色值为准，本地片段与标签反解析双通道兼容。

### SR10 failover 迁移与单次重试一跳接线

- Covers: AC2、AC9
- Target: `packages/dsh-workloom/src/dispatch/executor-settle.ts#trackDispatchSettle`
- Checks:
  1. dsh model-failover.ts 承载迁移面：MODEL_INACCESSIBLE_CODES（12 个 DSH LlmFailure code 白名单与原一致）、isModelInaccessibleCode、extractFailureCode、buildFailoverNote、buildFailoverNotice，文案 kind 词汇切 role；core dispatch/failover.js 删除、index.ts 重导出段删除、grep failover 在 packages/core/src 零命中；failover.test 迁 dsh（model-failover.test）且文案断言更新。
  2. 派发组装共享模块 executor-spawn.ts：executor.ts 新派发分支的组装段抽出（入参含 model/effort 覆盖与 fallbackOf/fallbackAttempt 记录字段），executor.ts 与 executor-settle.ts 单向引入、无导入环；原新派发路径行为不变。
  3. trackDispatchSettle 登记面在派发成功点扩展：parent Agent 引用、本次 send 的原始 prompt 全文、role、title、toolsAllow、生效模型绑定——一跳重派的上下文来源（DispatchRecord 不存 prompt，登记即唯一通道，满足 repo/workflow transport-failover 的 keeping the original prompt 要求）。
  4. 结算重试钩子：终态 failed 且 extractFailureCode 命中白名单、该角色 fallback_models 链存在下一模型、原记录 fallbackOf 为空时，经 executor-spawn 以链中下一模型一跳重派——新子会话走插件生命周期 ctx 的 subagents 服务与独立 AbortController（原回合 signal 不可复用），重派 prompt 保留原始 prompt 全文且尾部附加 buildFailoverNote 段，新记录写 fallbackOf=原 childId 与 fallbackAttempt=2（跳序号语义：原派发是隐含首跳不落字段，第一个 failover 跳从 2 起，与 dispatch-records 的 MIN_FALLBACK_ATTEMPT=2 校验、字段注释与钉住测试同值——决定 5），通知走既有结算 followup 投影；重试再失败、无链、链耗尽或已重试过（fallbackOf 非空）结算 failed 并附 buildFailoverNotice 文案；一跳上限由 fallbackOf 非空判定硬挡。
  5. 钩子异步不阻塞结算，全链 try/catch WARNING 降级，钩子异常不回滚已结算 failed 记录；'rotate' 模型来源值保持惰性历史值，fallback_models 解析链保留并恢复消费（配置面不再是死配置）。
  6. 测试面：dsh 重试接线用例齐五观察点——有链一跳重派的记录形状（fallbackOf、fallbackAttempt=2、下一模型）、重派 prompt 含原 prompt 全文与尾部 note 段、二次失败不再跳、无链结算 failed 附文案、fallbackOf 非空不再重试。
- Expected: 分类与文案归 dsh，单次重试一跳语义可判定，重派保留原 prompt 并附 note 段。

### SR11 拆分布局：task/state、task/storage 与 prompt-compose 三件套

- Covers: AC1、AC9
- Target: `packages/core/src/task/state/index.ts#whole-file`
- Checks:
  1. task/state/ 恰十文件：index.ts、values.ts、view.ts、transitions.ts、audit.ts、guards.ts、migrate.ts、tracks.ts、confirm.ts、pointers.ts；task/storage/ 恰五文件：index.ts、records.ts、read-write.ts、create.ts、list-archive.ts；task/ 根层级无 state-machine.ts 与 task-storage.ts；拆分涉及的全部文件行数低于 600（wc -l 统计）。
  2. 两个 index.ts 为唯一对外入口、只做重导出承载零实现（重导出面覆盖原模块全部导出符号：storage 实测 40 个、state 实测 54 个，以 grep '^export' 全量清单为准）；共享私有件（ERR_PREFIX、toError 等）落点：state/ 侧一律 values.ts，storage/ 侧为 records.ts（实施现场裁定 1：同哲学类推的基底文件，两处 ESM 安全环已被加载验证），入口与分文件之间无循环导入面。
  3. task/ 目录外代码（injection、workspace、core index.ts）与 task/ 内同级文件（task-ops、doc-review、dispatch-records、case-gates、case-scope）一律经 task/state/index.ts 与 task/storage/index.ts 导入，不直接引用子目录内分文件（决定 9 口径：同级文件相对子目录也算外部）；子目录内部文件可互相直引；storage/records.ts 对三值域类型的 type-only 导入经 state/index.ts 入口（断环落点，type-only 无运行时环）。
  4. prompt-compose 平铺拆三：injection/prompt-compose.ts 入口保留（头注释、常量、校验、类型、主组装）加 prompt-sections.ts（注入段函数）加 prompt-io.ts（预算与文件工具），三文件全部低于 600 行；入口文件名不变使 core index 与 dsh 导入面零变动。
  5. dist 结构与 src 镜像一致（dist-mirror 双向差集守卫同场全绿），state-machine 与 task-storage 的 dist 旧产物已删除。
- Expected: 子目录入口唯一、拆分文件全部低于 600 行、外部引用只经入口、dist 镜像一致。

### SR12 core 派发模块归属与死导出清理

- Covers: AC9
- Target: `packages/core/src/dispatch/executor-tools.ts#buildAllowList`
- Checks:
  1. NATIVE_TOOLS_DSH 移出 core：grep NATIVE_TOOLS_DSH 在 packages/core 零命中；BuildAllowListParams 增 nativeTools 必填入参（readonly string[]），基集 = nativeTools 交 visibleNames 语义不变；15 名单落 dsh executor-dispatch.ts 顶部常量 NATIVE_TOOLS，其 35 行 runtime='dsh' 过期注释同批修正；executor-tools.test 的逐名钉住用例迁 dsh（改引 dsh 常量），core 侧留基集与 includes/excludes 语义用例（夹具自造清单）。
  2. packages/core/src/dispatch/ 下无 failover.js 与 dispatch-binding.js；dsh dispatch-binding.ts 承载 buildNewDispatchBinding 与 resolveDispatchModelSource（后者降级模块内私有、删 'legacy' 来源分支），Pi 共用过期注释删除、头注释改写为 dsh 派发绑定构造职责；dispatch-binding.test 迁 dsh 且 legacy 用例反转。
  3. PARENT_MODEL_LABEL 收进 core injection/surface.ts 模块内常量（唯一消费方），grep PARENT_MODEL_LABEL 在 packages/core/src 仅 surface.ts 命中、不跨模块导出。
  4. core index.ts 死导出清理：failover 五导出段、dispatch-binding 重导出段、NATIVE_TOOLS_DSH 导出段、EXECUTOR_KINDS 导出段全部删除，executor-roles.ts 具名重导出补齐（沿全具名导出风格，无 export *）。
- Expected: 派发链路滞留模块归 dsh，core 不再导出 DSH 专属清单，死导出清零。

### SR13 resolveTurnTask：三态直测与回退直读通道删除

- Covers: AC2
- Target: `packages/core/src/injection/session-assemble.ts#resolveTurnTask`
- Checks:
  1. 新增 core test/session-assemble.test.ts 直测三态行为，四观察点齐备：指针错误抛错、无指针返回 null、命中返回 TaskView、任务记录不可读抛错（定义处 session-assemble.ts 为 39 行独立模块——盘点 §11 第 1 条定位事实；三态逻辑本体不改，仅随 state/storage 拆分做导入改线，改线正确性由 C1 typecheck 验证）。
  2. session-context.ts 与 workflow-service.ts 的「未注入缓存记录」回退直读通道删除：缺省视同无活跃任务不再自解析；grep '兼容直连调用方' 在 packages/core/src 零命中；相关注释（session-context 111-115、workflow-service 94-98 原锚点）同步移除。
  3. 既有直连单测改走正规通道：session-context.test（28 处）、workflow-service.test（16 处）、inject.test（6 处）的直调点按用例意图显式传 turnTask: null 或构造记录（补参与 contextKey 参数删除同批改，原断言意图不变）。
  4. turnTask 声明类型维持 TaskRecordWithPath | null，turnTask 类型面零变动；回退删除后不再被消费的 contextKey 参数按编码原则 7 删除，且调用方同步——dsh plugin.ts 调用点与测试直调点随 turnTask 补参同批修改（主会话对实施现场裁定 8 的复核裁定）；resolveActiveTask 导入面收敛（仅剩候选任务扫描等真消费方）。
- Expected: 三态行为有直测，回退直读零残留，测试通道正规化。

### SR14 注释清理：R13 点名两处与随改面

- Covers: AC10
- Target: `packages/dsh-workloom/src/constants.ts#whole-file`
- Checks:
  1. constants.ts 头注释消费方清单补 tooling/tasks.ts（CONTEXT_KEY_PREFIX 的真实消费方——盘点 §8 缺项），与四常量实际消费面一致。
  2. cordis.patch.yml 第 2 行删「点 7-12 逐步填充」句，改为插件行职责自述（grep '点 7-12' 零命中）。
  3. 决定 12 的随改修正面无残留：grep startContinuable 在 packages/dsh-workloom/src 零命中（executor.ts 五处改 startActivation）；executor-dispatch.ts 的 runtime='dsh' 注释修正；config.d.ts 的已退役 runtime 参数签名与「map 形式按 runtime 取值」注释修正且与实现签名一致；main-model.ts 注释语义复原；inject.test.ts 90 行 'Executor profiles' 残留修正；dispatch-binding 的 Pi 注释随迁移删除（SR12）；原 state-machine.ts:667「机制细化归子任务五」与原 prompt-compose.ts:361「子任务四按角色重接」旧任务编号字样在拆分产物中零残留。
  4. 未触及文件的剩余注释候选与过期 spec 条目（repo/terminology 的 executor 与 frontend executor 条目、repo/workflow 的 transport-failover 与 asset-version-bump 条目过期路径）登记进 `<task>`/notes-stale-comments.md，标注经 workloom-update-spec 流程更新（归子任务七），本任务不直接改 spec。
- Expected: 点名过期字样零命中，新注释与重构后实况一致，剩余候选登记归口。

### SR15 resources 机械字样切换

- Covers: AC2、AC3
- Target: `packages/core/resources/workflow/workflow.md#whole-file`
- Checks:
  1. workflow.md 派发指令句与参数字样机械切换：`kind: review`→`role: judger`（1.4 节句并补 purpose: plan-review、自动置 reviewing 与 workloom_task_planreview 标记说明）、`kind: frontend`→`role: frontend-developer`（2.1 与 2.3 两句）、`kind: check`→`role: checker`（2.2/2.3 与 breadcrumb、norms 段）；句中 executor 角色名词切 Researcher/Developer/Checker/Judger 词汇。
  2. front-matter version 不提升，protocol.js 的 WORKFLOW_PROTOCOL_VERSION 常量不动（asset-version-bump 条款：本任务全部是既有步骤内的指令文案切换，契约结构未变）；contract-asset.test 的四处版本断言原样保持绿，三处钉住句（原锚点 120-127/128-133/873）同步更新为新措辞。
  3. ui-design.md 门禁句切 `role: frontend-developer`（原 23 行）；workflow-light.md 两处否定式提及（原 11/31 行）切 Checker 词汇；六个 skill 文件机械切换齐备（workloom-alignment SKILL.md 47/49 与 plan-authoring.md 5、test-first.md 3/25，workloom-case-active SKILL.md 9/27-28/35/43，workloom-case-archived SKILL.md 42，workloom-migrate-plan SKILL.md 14——`kind: X` 参数字样与 executor 角色名词切 role 词汇）。
  4. workflow.md 的旧 stage 字样（stage `implement`、`check`，原 79/136/155-156 行）保持原样归子任务七（决定 11 的用户已确认裁定），C3 命中清单按「归子任务七」逐条标注归属，不计入派发值域残留。
- Expected: 派发指令面全部 role 词汇化，版本与契约结构零变动，旧 stage 字样归属可判定。

## Runtime Cases

### C1 构建基线

- Covers: AC1
- Preconditions:
  1. worktree 依赖已就位（packages.setup 的 pnpm install 已执行）；实施十八步全部完成。
- Steps:
  1. `pnpm -r build`
  2. `pnpm -r typecheck`
  3. `pnpm lint`
- Expected:
  1. 三条命令按序执行，退出码全为 0，lint 无 error 与 warning（时序纪律：dsh 经 file:../core 与 exports 解析 core 的 dist，typecheck 必须排在 build 之后）。
- Evidence:
  - `case-evidence/c1-build.log`
  - `case-evidence/c1-typecheck.log`
  - `case-evidence/c1-lint.log`
- Cleanup: none

### C2 两包单测全量与新增直测清单核对

- Covers: AC2
- Preconditions:
  1. C1 通过。
- Steps:
  1. `cd packages/core && pnpm test`
  2. `cd packages/dsh-workloom && pnpm test`
  3. 在两包测试输出中逐项定位六类新增直测并确认通过：①resolveTurnTask 三态（core test/session-assemble.test.ts）；②兼容读映射（core test/executor-roles.test.ts 的五旧值映射与未知值报错，加 toTaskView 归一用例）；③planReview 联动（dsh test/executor.test.ts 自动置位用例加 test/tasks.test.ts 的 workloom_task_planreview 用例）；④UI 门禁（core test/state-machine.test.ts 新值主用例与旧 frontend 夹具兼容用例）；⑤写守卫身份重建（dsh test/executor.test.ts 旧 kind 历史记录重建用例，夹具含 research 与 review 旧值；含 dispatch-scan 共享模块直测）；⑥单次重试一跳（dsh 侧重试用例：fallback_models 下一模型重派记录形状与无链结算 failed，宿主文件以实际为准）。
  4. 确认 dist 镜像守卫测试（两包 dist-mirror.test 与 core dist-dts.test）在同一输出中通过。
- Expected:
  1. 步骤 1 与 2 退出码 0、0 fail。
  2. 六类直测与 dist 守卫全部可在输出中定位且通过，逐项清单记入证据。
- Evidence:
  - `case-evidence/c2-core-tests.log`
  - `case-evidence/c2-dsh-tests.log`
  - `case-evidence/c2-direct-tests-checklist.log`
- Cleanup: none

### C3 旧值零残留检索与四类归属复核

- Covers: AC3
- Preconditions:
  1. C1 通过；实施步骤 7/17/18 的命中清单（legacy-check-src.md、legacy-check-resources.md、legacy-check-final.md）已存档 `<task>`。
- Steps:
  1. src 段检索（范围 packages/core/src 与 packages/dsh-workloom/src），按 plan 决定 11 的五条精化检索式逐值执行：`grep -rnP '\bresearch\b'`、`grep -rnP '\bimplement\b(?!\.jsonl)'`、`grep -rnP '\bcheck\b(?!\.jsonl)'`、`grep -rnP '\bfrontend\b(?!-developer)'`、`grep -rnP '\breview\b'`（②类新值复合词词段与③类工件文件名形态由负向前瞻排除；不做整行排除，避免同一行兼有真消费点与文件名提及时漏检）。
  2. resources 段检索：对 packages/core/resources 执行同一组五条精化检索式。
  3. 命中清单逐条标注四类归属：①假命中甄别——action 枚举 'review'（doc-review.ts 与 tasks.ts 的 align/case action）、GateValue 'check' 与 OVERRIDE_GATES.CHECK、LEGACY_STAGE_*、RESEARCH_DIR 与 research/ 任务工件目录名、DSH 事件与结果形状 kind、第三方 skills 普通英文词、ui-design.md 的普通英文词 frontend（如 frontend file implementation）、LEGACY_KIND_TO_ROLE 映射表本体、TARGET_BY_FILE 新旧双文件名兼容映射（决定 4）、连字符分段命中（purpose 值 plan-review、模块文件名 doc-review.ts、守卫键 check-ready 与 plan-review-clean、case-result 模板的 check-child-session-id 占位符）、历史夹具与兼容读测试；②新值复合词词段——经 `frontend\b(?!-developer)` 排除，清单中不应出现 frontend-developer 的 frontend 段；③工件文件名——implement.jsonl 与 check.jsonl 及文档对其提及经 `(?!\.jsonl)` 排除，清单中不应出现该形态（implement.md 与 check.md 片段文件名不在前瞻排除内，按①的 TARGET_BY_FILE 兼容映射归属）；④兼容读与过渡容忍的显式说明注释。
  4. 真消费点复核：盘点 §4 三张表（core 9 文件、dsh 8 文件、resources 10 文件）加 plan 补充的 case-gates.ts CHECK_KIND 旧常量位点（切换后为 CHECK_ROLE）、executor-injection.ts 86 行字面量、surface.ts 注册面三处、local-prompts 错误文案——上述位点在命中清单中零命中；workflow.md 旧 stage 字样的命中条目标注「归子任务七」（用户已确认裁定）。
  5. 与 `<task>` 已存档的 legacy-check-final.md 交叉核对归属结论一致；本轮标注后清单存为证据。
- Expected:
  1. 检索命中经②③类前瞻过滤后，剩余每条命中均可归入①或④的允许类别且标注可判定；派发值域真消费点零命中（grep 无命中时退出码 1 属预期，日志记录实际输出为空）。
  2. 命中清单人工复核完成：每条带归属类别标注，仅兼容读映射模块与历史夹具数据（及其显式说明注释）允许出现旧值。
- Evidence:
  - `case-evidence/c3-src-hits.log`
  - `case-evidence/c3-resources-hits.log`
  - `case-evidence/c3-attribution-review.md`
- Cleanup: none

### C4 兼容读映射探针

- Covers: AC2
- Preconditions:
  1. C1 通过；探针在 worktree 内经 node 直跑导入 src TS 模块（v24 type stripping），HOME 加 TMPDIR 隔离。
- Steps:
  1. 探针在临时 `.workloom` 构造夹具任务记录，dispatches 含五旧值（research、implement、check、review、frontend——frontend 旧值全仓零条真实历史记录，盘点 §10 第 6 条事实，只能夹具构造），经 readTaskView 读取，断言逐条归一为 researcher、developer、checker、judger、frontend-developer。
  2. 映射单点断言：normalizeExecutorRole 五新值原样返回、五旧值按表映射、未知值（如 'bogus'）抛含未知值字面的可判定错误；tryNormalizeExecutorRole 对未知值返回 null 不抛错。
  3. 历史文件零改写断言：夹具 task.json 读取前后 sha256 字节比对一致；另选主检出一份携带旧值的真实归档 task.json（如 `.workloom/tasks/archive/2026-09/s1-core-worktree-lifecycle/task.json`，全程只读）做只读回放，视图 dispatches 显示新值且文件字节比对一致。
- Expected:
  1. 五旧值全部归一为新角色，未知值显式报错不静默。
  2. 夹具与真实归档文件读取前后字节一致（历史文件不改写），主检出归档零写入。
- Evidence:
  - `case-evidence/c4-compat-probe.log`
- Cleanup: 探针在脚本内删除临时目录。

### C5 工具面 role 参数探针

- Covers: AC4
- Preconditions:
  1. C1 通过（dsh 侧经 `@workloom-ai/core` 解析 core 的 dist）。
- Steps:
  1. 探针读取 buildExecutorSchema(PARAM_DESCRIPTIONS) 输出：parameters.properties 含 role 且 enum 恰为五新值，required 恰为 ['role','prompt','title']，properties 无 kind 键；purpose 的 enum 恰为 ['case-design','execution','plan-review']。
  2. 定向运行承载工具面报错分支的 dsh 用例：`cd packages/dsh-workloom && node --test test/executor.test.ts test/case-executor.test.ts`，在输出中定位——传旧参数名 kind（缺 role）经 required 校验显式报错、传旧值 role（如 'implement'）经 schema enum 或 assertRole 层拒绝且文案含新值域清单的两类用例。
  3. 探针调用会话上下文组装（传最小参数），输出中 workloom_execute 的工具说明含 role 参数描述（TOOL_SNIPPETS 与 PARAM_DESCRIPTIONS 的 role 词汇可见），无 kind 参数描述残留。
- Expected:
  1. schema 面 role 就位、kind 不存在；旧参数名与旧值调用均显式报错；会话上下文可见 role 参数说明。
- Evidence:
  - `case-evidence/c5-schema-probe.log`
  - `case-evidence/c5-tool-tests.log`
  - `case-evidence/c5-context-probe.log`
- Cleanup: 探针在脚本内删除临时目录。

### C6 配置退役与画像节探针

- Covers: AC5
- Preconditions:
  1. C1 通过；探针经 node 直跑导入 core src 模块，HOME 加 TMPDIR 隔离。
- Steps:
  1. 探针构造带根层级 subagents 字段的项目配置（临时 `.workloom/config.json`），调 loadConfig：抛 WorkloomConfigError，报错文案含 'subagents' 与 'subagent_profiles' 迁移指引；另构造同时写根层级 subagents 与 subagent_profiles 的配置，仍先抛根层级退役错误不进入解析链。
  2. 探针构造 subagent_profiles 命中条目但 roles 段缺 checker 角色键的配置（条目内层字段为 roles——决定 15），调 resolveSubagentDefaults(config,'checker',{},mainModel)：model 与 effort 均为 undefined（继承父会话默认）；有配置角色（如 developer）返回其 model/effort 与来源标注；roles 条目内含旧五值键（如 implement）时 loadConfig 输出一次性 WARNING 且文案指向新 role 键名、不抛错。
  3. 探针构造内层仍用旧字段名 subagents 的 profile 条目：loadConfig 抛 WorkloomConfigError 且文案含 roles 改名迁移指引（与根层级退役同 fail loud 口径，不做兼容读）；roles 字段正常条目解析通过。
  4. 探针驱动 assembleSessionContextText（传 config 与 mainModel）：画像节出现在 Last dispatch 行后（与 Git 节的完整线序以 session-context.test 的线序用例输出定位）；mainModel 在位时节头逐字 `Executor profiles (main model <model>):`；无配置角色行逐字 `<role>: not configured (inherits parent session model)`；mainModel 缺失时运行定向用例 `cd packages/core && node --test test/session-context.test.ts`，在输出中定位节头逐字 `Executor profiles (main model unknown; whenMain entries skipped):` 与 whenMain 命中行、fallback 命中行用例。
- Expected:
  1. 根层级 subagents 出现即抛错且文案含迁移指引；profile 条目内旧字段名 subagents 抛错且文案含 roles 迁移指引、roles 正常条目解析通过；缺角色键继承宿主默认并输出 info 行；旧角色键 WARNING 不破坏存量；config 加载失败时画像节降级不渲染加 WARNING、会话上下文不中断。
- Evidence:
  - `case-evidence/c6-config-probe.log`
  - `case-evidence/c6-profiles-probe.log`
  - `case-evidence/c6-session-context-tests.log`
- Cleanup: 探针在脚本内删除临时目录。

### C7 planReview 联动探针

- Covers: AC6
- Preconditions:
  1. C1 通过；探针经 node 直跑导入 core src 模块，HOME 加 TMPDIR 隔离。
- Steps:
  1. 探针驱动 executePlanReviewMark（夹具任务，planReview.phase 初始 none）：直接标 revising 报非法边可判定错误；先经 recordPlanReview 置 reviewing 后标 revising，断言 phase=revising 且轮数加一、记录写入 task.json；再标 clean，断言 phase=clean 且记录写入。
  2. purpose 校验探针：recordExecutorDispatch 传 {kind:'judger', purpose:'plan-review'} 通过且记录带 purpose；{kind:'judger'} 无 purpose 通过且记录不带 purpose 字段；{kind:'developer', purpose:'plan-review'} 被拒（role 分支校验）；{kind:'checker', purpose:'case-design'} 行为不变。
  3. dsh 侧自动置位与工具限制经定向测试定位：`cd packages/dsh-workloom && node --test test/executor.test.ts test/tasks.test.ts`，输出中定位——judger 加 plan-review 派发成功后 task.json 的 planReview.phase 为 reviewing、reviewing 态再派幂等、clean 态派发不动轨道仅 WARNING、judger 无 purpose 派发不动轨道（非 plan 评审目的不触碰轨道）、workloom_task_planreview 的 delegationDepth>0 主会话硬拒绝文案用例。
- Expected:
  1. 轨道写入口与非法边报错可判定；purpose 按 role 分支校验生效；自动置位四观察点与主会话限制用例全绿。
- Evidence:
  - `case-evidence/c7-planreview-probe.log`
  - `case-evidence/c7-dsh-tests.log`
- Cleanup: 探针在脚本内删除临时目录。

### C8 UI 门禁探针

- Covers: AC7
- Preconditions:
  1. C1 通过；探针经 node 直跑驱动状态机迁移入口，HOME 加 TMPDIR 隔离。
- Steps:
  1. 夹具 standard 任务，PRD 的 UI Design 章节含实质内容，推进到 implementing 且 dispatches 无 frontend-developer 记录：请求 implementing→checking，断言被拒且理由文案逐字 'no frontend-developer dispatch recorded for a task with UI requirements'。
  2. 经 recordExecutorDispatch 以新值补一条 frontend-developer 派发记录后重试：断言迁移通过。
  3. 兼容面：另构造携带旧 frontend 历史记录（kind:'frontend' 夹具——全仓零条真实 frontend 历史，只能夹具构造）的任务，断言经兼容读同样满足门禁、迁移通过。
  4. light 任务豁免：light 任务 implementing→archived 直达不受本门禁影响；force 越权：standard 任务带 force 与 reason 强行通过且 overrides 审计留痕（对应 OVERRIDE_GATES 键记录写入）。
  5. 边界口径：UI Design 章节为不适用声明（中英词表）或空正文时门禁不拦（子任务三口径保持）。
- Expected:
  1. 五组观察点全部可判定：拒绝文案逐字、补派发后放行、旧 frontend 夹具经兼容读放行、light 豁免与 force 留痕不变、不适用与空正文口径不变。
- Evidence:
  - `case-evidence/c8-ui-gate-probe.log`
- Cleanup: 探针在脚本内删除临时目录。

### C9 写守卫身份与重建探针

- Covers: AC8
- Preconditions:
  1. C1 通过；探针经 node 直跑导入 dsh src 模块（其 core 依赖经 dist 解析）。
- Steps:
  1. 探针驱动守卫判定：registerWriteGuardChildId 登记 researcher 与 judger 子会话身份后，write 与 edit 工具路径参数指向 <cwd>/.workloom/ 外路径被拒、指向 .workloom/ 内路径放行、非受守卫角色（如 developer）放行。
  2. 重建流程：临时项目构造历史派发记录夹具（dispatches 含旧 kind 值 research 与 review，另加一条脏值记录与一个归档任务），以受守卫身份集为空的初始状态（模拟 dsh 重启）触发懒重建：断言旧 research 与 review 记录经 tryNormalizeExecutorRole 识别为受守卫身份进入 childId 集、脏值跳过加 WARNING 不中断、归档任务记录不计入、空集占位防毒化语义保持。
  3. 共享扫描验证：scanDispatchRecords 直测（多任务聚合、坏 JSON 防御、归档排除）；`grep -rn "scanDispatchRecords" packages/dsh-workloom/src` 命中 executor-guard.ts 与 executor-toolface.ts 两处改接点（单一实现两处共用）。
- Expected:
  1. 域内放行与越界拒绝可判定；旧 kind 值历史身份重建成功；扫描单实现两处共用且防御语义不变。
- Evidence:
  - `case-evidence/c9-write-guard-probe.log`
  - `case-evidence/c9-scan-grep.log`
- Cleanup: 探针在脚本内删除临时目录。

### C10 单次重试一跳探针

- Covers: AC2
- Preconditions:
  1. C1 通过；探针经 node 直跑导入 dsh src 模块。
- Steps:
  1. 探针驱动 model-failover 纯函数面：extractFailureCode 从结算载荷提取错误码；isModelInaccessibleCode 对 12 个白名单 code 判定与原 failover.js 迁移面一致；buildFailoverNote 与 buildFailoverNotice 文案为 role 词汇、无 kind 词汇。
  2. 结算钩子观察点经定向测试定位：运行 dsh 承载重试接线用例的测试文件（model-failover.test 与 executor.test 或 executor-settle 用例宿主，以实际文件为准），输出中定位五观察点——有链一跳重派（新记录 fallbackOf=原 childId、fallbackAttempt=2——跳序号语义，原派发隐含首跳不落字段、MIN_FALLBACK_ATTEMPT=2 校验放行；模型为 fallback_models 链下一模型）、重派 prompt 含原始 prompt 全文与尾部 buildFailoverNote 段、二次失败不再跳、无链直接结算 failed 附 buildFailoverNotice 文案、fallbackOf 非空不再重试。
  3. 归属复核：`grep -rn "failover" packages/core/src` 零命中；`ls packages/core/src/dispatch/failover.js` 不存在；`ls packages/dsh-workloom/src/dispatch/` 含 model-failover.ts 与 executor-spawn.ts；executor.ts 与 executor-settle.ts 的导入面对 executor-spawn.ts 单向引入（无互相导入环）。
- Expected:
  1. 分类与文案纯函数行为迁移一致；一跳语义五观察点在测试输出中全部可定位且通过；core 侧 failover 零残留。
- Evidence:
  - `case-evidence/c10-failover-probe.log`
  - `case-evidence/c10-retry-tests.log`
  - `case-evidence/c10-attribution-grep.log`
- Cleanup: 探针在脚本内删除临时目录。

### C11 模块归属与拆分形态观察

- Covers: AC9
- Preconditions:
  1. C1 通过。
- Steps:
  1. `ls packages/core/src/dispatch/`：无 failover.js、dispatch-binding.js、executor-kinds.ts；`ls packages/core/src/task/`：根层级无 state-machine.ts 与 task-storage.ts；`ls packages/core/src/task/state/ packages/core/src/task/storage/`：各含 index.ts（state 恰十文件、storage 恰五文件）。
  2. `grep -rn "NATIVE_TOOLS_DSH" packages/core`：零命中；`grep -rnE "EXECUTOR_KINDS|isExecutorRoleOrLegacy" packages/core/src packages/dsh-workloom/src`：零命中（grep 无命中退出码 1 属预期）。
  3. `wc -l packages/core/src/task/state/*.ts packages/core/src/task/storage/*.ts packages/core/src/injection/prompt-compose.ts packages/core/src/injection/prompt-sections.ts packages/core/src/injection/prompt-io.ts`：全部低于 600；其余被改文件仅统计登记，既有超 600 行文件（如 task-ops.ts）如实登记不强制拆分（plan 步骤 18 评审 #10 口径）。
  4. 入口纪律：`grep -rnE "from '[^']*/(state|storage)/(values|view|transitions|audit|guards|migrate|tracks|confirm|pointers|records|read-write|create|list-archive)\.ts'" packages/core/src packages/dsh-workloom/src`，命中仅允许位于 task/state/ 与 task/storage/ 两子目录内部（子目录内互引）；task/ 外代码与 task/ 内同级文件零命中（只经 index.ts 入口）。
  5. dsh 新模块归属：`ls packages/dsh-workloom/src/dispatch/` 含 model-failover.ts、dispatch-binding.ts、executor-spawn.ts、dispatch-scan.ts；`grep -rn "PARENT_MODEL_LABEL" packages/core/src` 仅 surface.ts 命中。
- Expected:
  1. 文件树与行数满足 AC9 全部观察点；grep 面零命中或仅允许位点命中；入口纪律可判定。
- Evidence:
  - `case-evidence/c11-tree.log`
  - `case-evidence/c11-grep.log`
  - `case-evidence/c11-wc.log`
- Cleanup: none

### C12 注释清理复核

- Covers: AC10
- Preconditions:
  1. C1 通过。
- Steps:
  1. `grep -n "点 7-12" packages/dsh-workloom/cordis.patch.yml`：零命中；读取第 1-5 行确认第 2 行为插件行职责自述。
  2. `grep -rn "startContinuable" packages/dsh-workloom/src`：零命中；`grep -n "tasks.ts" packages/dsh-workloom/src/constants.ts`：头注释消费方清单含 tooling/tasks.ts 字样。
  3. `grep -rn "兼容直连调用方" packages/core/src`：零命中（R12 关联注释，与 SR13 互验）；读取 config.d.ts 的 resolveSubagentDefaults 与 detectExecutorConflicts 声明段，确认无已退役 runtime 参数签名与「map 形式按 runtime 取值」注释、与实现签名一致。
  4. `grep -rn "机制细化归子任务五\|子任务四按角色重接" packages/core/src`：零命中（原 state-machine.ts:667 与 prompt-compose.ts:361 的旧任务编号字样）。
  5. 人工复核：constants.ts 头注释、cordis.patch.yml 新注释、main-model.ts 头注释（画像 whenMain 匹配语义复原）、executor-dispatch.ts 35 行注释、dsh dispatch-binding.ts 头注释（Pi 字样已删）逐处与重构后实况一致；`<task>`/notes-stale-comments.md 存在且登记剩余注释候选与过期 spec 条目（repo/terminology 两条、repo/workflow 的 transport-failover 与 asset-version-bump 条目），标注归子任务七经 workloom-update-spec 流程更新。
- Expected:
  1. 原过期字样检索零命中；新注释与实况一致（人工复核结论逐条记入证据）；剩余候选登记完整。
- Evidence:
  - `case-evidence/c12-comment-grep.log`
  - `case-evidence/c12-notes-check.log`
- Cleanup: none

### C13 仓库标准验证与 dist 新鲜度

- Covers: AC1、AC2
- Preconditions:
  1. C1 至 C12 全部完成；步骤 18 的单一 work commit 已落任务分支（如主会话调整提交时序，以实际 HEAD 状态为准并在 case-result 中注明）。
- Steps:
  1. `pnpm lint`
  2. `pnpm -r build`
  3. `pnpm -r typecheck`
  4. `cd packages/core && pnpm test`
  5. `cd packages/dsh-workloom && pnpm test`
  6. `git status --porcelain packages/core/dist packages/dsh-workloom/dist`
  7. `git show --stat HEAD`（work commit 已落时）：核对单 commit 文件面含 src、test、resources 与两包 dist。
- Expected:
  1. 步骤 1 至 5 退出码全为 0，两包测试 0 fail（含 dist-mirror 与 dist-dts 守卫、六类新增直测——与 C2 同口径，本步为收尾复跑，防探针期间引入漂移）。
  2. 步骤 6 无输出（dist 新鲜且与 src 同 commit 一致）；步骤 7 的提交文件面覆盖两包 dist（repo/deployment 同 commit 纪律）。
- Evidence:
  - `case-evidence/c13-lint.log`
  - `case-evidence/c13-build.log`
  - `case-evidence/c13-typecheck.log`
  - `case-evidence/c13-core-tests.log`
  - `case-evidence/c13-dsh-tests.log`
  - `case-evidence/c13-dist-status.log`
  - `case-evidence/c13-commit-stat.log`
- Cleanup: none

## Coverage

- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Instrumentation: 两包先经 C1 的 `pnpm -r build`；测试套件以 coverage 模式各跑一遍，`--test-coverage-include` 同时覆盖 `src/**` 与 `dist/**`（两包测试直接 import src 的 TS 模块，dsh 测试另经 `@workloom-ai/core` 加载 core 的 dist，一并纳入防漏），lcov 原始报告写入 `<task>`/coverage/。聚合时把 `SF:dist/...` 映射回 `SF:src/...`，同名源文件取 src 记录，避免同一模块双计；未覆盖行取 lcov 中 hits=0 的 DA 行号区间。
- Aggregate command:
  ```bash
  MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-06-sop-roles"
  mkdir -p "$TASK/coverage"
  cd packages/core
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/core.lcov.info" \
    'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'
  cd ../dsh-workloom
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/dsh-workloom.lcov.info" \
    'test/*.test.ts'
  ```
- Scope: SR 目标中实际变更的现存可执行模块，即 `packages/core/src/dispatch/executor-roles.ts`、`packages/core/src/dispatch/executor-tools.ts`、`packages/core/src/task/state/index.ts`、`packages/core/src/task/state/view.ts`、`packages/core/src/task/state/guards.ts`、`packages/core/src/task/doc-review.ts`、`packages/core/src/workspace/config-load.ts`、`packages/core/src/injection/session-context.ts`、`packages/core/src/injection/session-assemble.ts`、`packages/dsh-workloom/src/dispatch/executor-schema.ts`、`packages/dsh-workloom/src/dispatch/dispatch-scan.ts`、`packages/dsh-workloom/src/dispatch/executor.ts`、`packages/dsh-workloom/src/dispatch/executor-settle.ts`、`packages/dsh-workloom/src/constants.ts`；SR15 目标 workflow.md 为静态资源随 resources 目录入 Exclusions；拆分搬移段、涟漪改线文件、测试与构建产物入 Exclusions。已删除文件（executor-kinds.ts、failover.js、core 侧 dispatch-binding.js、state-machine.ts、task-storage.ts 及其迁出测试）非现存文件，不入 Changed Files 也不入 Exclusions，删除事实由 C10 与 C11 验证。
- Exclusions:
  - packages/core/resources/: 静态资源（workflow 与 skill 机械字样切换、模板），无可执行行；contract-asset 钉住用例与 packages-scan 脚本测试由 C2 与 C13 验证
  - packages/core/test/: 测试探针自身（含新增 executor-roles、session-assemble 与状态机兼容双值用例），C2 与 C13 验全绿
  - packages/dsh-workloom/test/: 测试探针自身（含迁入的 model-failover、dispatch-binding 用例与重试接线、planreview 工具用例），C2 与 C13 验全绿
  - packages/core/dist/: 构建产物，C13 验 build 后新鲜度与 src 同 commit
  - packages/dsh-workloom/dist/: 构建产物，C13 验 build 后新鲜度与 src 同 commit
  - **/*.d.ts: 类型声明面（config.d.ts 修正含 SubagentProfile.roles 改名、executor-capacity.d.ts role 化、worktree.d.ts 类型导入改线），无运行时行，声明与实现一致由 SR14 与 C1 的 typecheck 验证
  - **/*.js.map: 构建映射产物，无运行时行
  - packages/dsh-workloom/cordis.patch.yml: patch 描述 YAML，无可执行行；字样核对归 SR14 与 C12
  - packages/core/src/index.ts: 导出面改线（删旧模块导出段、增 executor-roles 具名重导出），导出面由 C11 的 grep 与两包 build 验证
  - packages/core/src/task/dispatch-records.ts: purpose 按 role 分支校验与写侧收严（SR6 检查面），行为由 C7 探针与全量用例验证
  - packages/core/src/task/case-gates.ts: CASE 执行链回溯判定改引 EXECUTOR_ROLES.checker 并归一，语义不变；C2 全量用例验证
  - packages/core/src/task/task-ops.ts: 导入改线（executePlanReviewMark 落 doc-review.ts，本文件不新增编排），无行为变更
  - packages/core/src/task/case-scope.ts: 类型导入改线，无行为变更
  - packages/core/src/task/state/values.ts: 拆分搬移段（值域枚举与兼容判定集合），C11 验形态、C2 验全量
  - packages/core/src/task/state/transitions.ts: 拆分搬移段（迁移表与守卫键），子任务三定形语义不变
  - packages/core/src/task/state/audit.ts: 拆分搬移段与 UI 门禁文案切换（FRONTEND_DISPATCH_MISSING），文案由 C8 逐字验证
  - packages/core/src/task/state/migrate.ts: 拆分搬移段（迁移执行入口），语义零变化
  - packages/core/src/task/state/tracks.ts: 拆分搬移段（CASE 与 planReview 轨道写入口），recordPlanReview 行为由 C7 验证
  - packages/core/src/task/state/confirm.ts: 拆分搬移段（确认迁移），语义零变化
  - packages/core/src/task/state/pointers.ts: 拆分搬移段（会话指针），语义零变化
  - packages/core/src/task/storage/index.ts: 零实现重导出壳（storage 唯一对外入口），重导出面与形态由 C11 验证
  - packages/core/src/task/storage/records.ts: 拆分搬移段（记录类型定义）与 state 入口 type-only 改线，无运行时行为
  - packages/core/src/task/storage/read-write.ts: 拆分搬移段（读写序列化，规范化层不改写历史值），C2 全量与 C4 零改写验证
  - packages/core/src/task/storage/create.ts: 拆分搬移段（slug 与创建校验），语义零变化
  - packages/core/src/task/storage/list-archive.ts: 拆分搬移段（hooks、列举与归档），语义零变化
  - packages/core/src/injection/prompt-compose.ts: 拆分入口（role 判定切换与 assertRole 收严），行为由 C5 探针与 prompt-compose 用例验证
  - packages/core/src/injection/prompt-sections.ts: 拆分搬移段（注入段函数），语义零变化
  - packages/core/src/injection/prompt-io.ts: 拆分搬移段（预算与文件工具），语义零变化
  - packages/core/src/injection/local-prompts.ts: target 值域切换与新旧双文件名兼容映射（决定 4），C3 按兼容类归属复核、local-prompts 用例验证
  - packages/core/src/injection/surface.ts: 注册面文案、第十二工具键与 PARENT_MODEL_LABEL 收编（SR6 与 SR12 检查面），C5 与 C2 的 surface 用例验证
  - packages/core/src/injection/workflow-service.ts: 回退直读通道删除（SR13 检查面），C13 全量套件回归
  - packages/core/src/dispatch/executor-capacity.js: 入参改名与契约整体 role 化（模块内部形状 record.role/roleLimit/roleCount/layer 'role'，SR9 检查面），C2 的 capacity 用例验证
  - packages/core/src/workspace/config-subagent.ts: resolveSubagentDefaults 链收敛、内层字段 subagents→roles 改名与旧角色键 WARNING（SR4 检查面），C6 探针直接验证
  - packages/core/src/workspace/config-defaults.ts: DEFAULT_CONFIG 与类型面同步删除，C6 与 C2 的 config 用例验证
  - packages/core/src/workspace/doctor-check-rules.ts: 两处判定点切换与 hint 文案，C2 的 doctor 用例与 C3 归属复核
  - packages/core/src/workspace/doctor-types.ts: type-only 类型导入改线（task-storage/state-machine 拆分的涟漪点，盘点报告第 2 节消费方清单在案），无行为变更，由 C1 typecheck 与 C2 全量套件验证
  - packages/core/src/workspace/worktree-integrate.ts: type-only 类型导入改线（task-storage/state-machine 拆分的涟漪点，盘点报告第 2 节消费方清单在案），无行为变更，由 C1 typecheck 与 C2 全量套件验证
  - packages/core/src/workspace/worktree-lifecycle.ts: type-only 类型导入改线（task-storage/state-machine 拆分的涟漪点，盘点报告第 2 节消费方清单在案），无行为变更，由 C1 typecheck 与 C2 全量套件验证
  - packages/dsh-workloom/src/dispatch/model-failover.ts: 错误码分类与文案纯函数迁移模块（SR10 检查面），C10 探针与迁入用例验证
  - packages/dsh-workloom/src/dispatch/executor-spawn.ts: 派发组装共享抽取（原新派发路径行为不变），C10 的重派用例验证
  - packages/dsh-workloom/src/dispatch/dispatch-binding.ts: 迁移模块（resolveDispatchModelSource 降级私有并删 legacy 分支），C2 的迁入 dispatch-binding 用例验证
  - packages/dsh-workloom/src/dispatch/executor-guard.ts: WRITE_GUARDED_ROLES 切换与重建归一（SR8 检查面），C9 探针直接验证
  - packages/dsh-workloom/src/dispatch/executor-toolface.ts: 重建改接共享扫描，行为零变化，C9 与既有 toolface 用例验证
  - packages/dsh-workloom/src/dispatch/executor-capacity.ts: LABEL_TO_ROLE 与标签反解析切换（SR9 检查面），C2 的容量与 label 用例验证
  - packages/dsh-workloom/src/dispatch/executor-continuation.ts: 同角色校验双侧归一与拒绝文案接线，C2 的跨角色续用拒绝用例验证
  - packages/dsh-workloom/src/dispatch/executor-injection.ts: 标签源切换 ROLE_LABELS 与 checker 字面量改线，C2 的五角色 label 用例验证
  - packages/dsh-workloom/src/dispatch/discipline-text.ts: EXECUTOR_CONTRACT_BY_ROLE 五键文案切换，C2 的 discipline-text 用例验证
  - packages/dsh-workloom/src/dispatch/executor-dispatch.ts: NATIVE_TOOLS 十五名单常量落位与 35 行注释修正（SR12 检查面），C11 的 grep 与 C2 验证
  - packages/dsh-workloom/src/dispatch/main-model.ts: 头注释语义复原核对，无行为变更
  - packages/dsh-workloom/src/tooling/tasks.ts: workloom_task_planreview 注册与主会话限制（SR6 检查面），C7 探针与 tasks 用例验证
  - packages/dsh-workloom/src/plugin.ts: config 与 mainModel 注入接线恢复及 resolveTurnTask 的 contextKey 调用点同步（SR5 与 SR13 检查面），C6 的画像节直出验证
- Raw outputs:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

## Standard Verification

时序纪律：dsh 经 `file:../core` 与 core 包 exports（`./dist/index.js`）解析 core，tsconfig 无 paths 映射，故 `pnpm -r typecheck` 与 dsh 的 `pnpm test` 必须排在 `pnpm -r build` 之后；core 侧测试直跑 src TS，不依赖该时序。下表按 AC1 与 AC2 的命令顺序排列。

| Command | Expected |
| --- | --- |
| `pnpm -r build` | 退出码 0 |
| `pnpm -r typecheck` | 退出码 0 |
| `pnpm lint` | 退出码 0，无 error 与 warning |
| `cd packages/core && pnpm test` | 退出码 0，0 fail（含 dist-mirror 与 dist-dts 守卫用例） |
| `cd packages/dsh-workloom && pnpm test` | 退出码 0，0 fail（含 dist-mirror 守卫用例） |

新增直测清单（AC2 增量要求，C2 步骤 3 在测试输出中逐项定位）：

1. resolveTurnTask 三态直测：core `test/session-assemble.test.ts`（指针错误抛错、无指针 null、命中返回 TaskView、记录不可读抛错）。
2. 兼容读映射：core `test/executor-roles.test.ts`（五新值合法判定、五旧值映射、未知值报错、tryNormalize null 分支）与 toTaskView 归一用例。
3. planReview 联动：dsh `test/executor.test.ts` 自动置位四观察点用例与 `test/tasks.test.ts` 的 workloom_task_planreview schema 加主会话限制用例。
4. UI 门禁：core `test/state-machine.test.ts` 新值 frontend-developer 主用例与旧值 frontend 夹具兼容用例。
5. 写守卫身份重建：dsh `test/executor.test.ts` 旧 kind 历史记录重建用例（夹具含 research 与 review 旧值）与 dispatch-scan 共享模块直测。
6. 单次重试一跳：dsh 侧重试接线用例——fallback_models 下一模型重派（记录形状与重派 prompt 含原 prompt 全文加尾部 note 段）与无链结算 failed 附文案。

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR11 | C1、C13 |
| AC2 | SR1、SR3、SR5、SR6、SR7、SR8、SR9、SR10、SR13、SR15 | C2、C4、C10、C13 |
| AC3 | SR1、SR2、SR15 | C3 |
| AC4 | SR2 | C5 |
| AC5 | SR4、SR5 | C6 |
| AC6 | SR6 | C7 |
| AC7 | SR7 | C8 |
| AC8 | SR8 | C9 |
| AC9 | SR10、SR11、SR12 | C11 |
| AC10 | SR14 | C12 |
