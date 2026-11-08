# 角色体系与子会话派发

行号锚点以 main HEAD `7da3846` 为准；前序步骤移动代码后，后续步骤以符号名定位。事实依据为 research/roles-dispatch-facts.md（下称「盘点报告」），各节已注明。

## Design decisions

1. 数据兼容与兼容读单点：DispatchRecord.kind 字段名保留（repo/domain-module 规范禁止重命名 task.json 字段），新写入记录存新角色值。兼容读映射单点 normalizeExecutorRole 落新值域模块：新值原样返回，旧五值映射（research→researcher、implement→developer、check→checker、review→judger、frontend→frontend-developer），未知值抛可判定错误。视图层 toTaskView 对 dispatches 做映射归一（沿子任务三 mode/stage 的视图层兼容先例）；记录级直读点（盘点报告第 10 节 8 处）显式调用映射。storage 规范化层不改值，任何写回都不改写历史值。
2. 渐进切换路径（每步独立全绿）：新建值域模块（新旧并存零消费，步骤 4）→ core 消费点切换，入口过渡期新旧双值容忍（步骤 5）→ dsh 消费点与工具面切换，role 参数加 schema enum（步骤 6）→ 收紧：写侧只收新值、删旧模块（步骤 7）→ resources 字样切换（步骤 17）。过渡容忍覆盖写侧、参数校验与运行期读侧入口：dsh 仍以旧值传参的面（prompt 组装、容量闸判定等）在比较点两侧归一处理；local-prompts 的 target 值域与 executor-capacity 的参数改名、文案切换安排在步骤 6 与 dsh 调用面同批，避免跨包过渡断链。读侧兼容映射（normalizeExecutorRole）按 R4 永久保留；写侧过渡容忍步骤 7 收回。
3. 值域模块形态：executor-kinds.ts 退役，新建 dispatch/executor-roles.ts——EXECUTOR_ROLES 冻结对象（RESEARCHER/DEVELOPER/FRONTEND_DEVELOPER/CHECKER/JUDGER 五键）、ExecutorRole 类型、isExecutorRole 守卫、ROLE_LABELS 显示名单源（Researcher/Developer/Frontend Developer/Checker/Judger，dsh 的 KIND_LABELS 退役改消费此源）、LEGACY_KIND_TO_ROLE 冻结映射、normalizeExecutorRole。
4. local-prompts target 兼容：target 值域切为 main/researcher/developer/frontend-developer/checker/judger/all；TARGET_BY_FILE 新旧双文件名（researcher.md 与 research.md 均映射 researcher target，其余同理），与记录兼容读同一哲学；错误文案列新 target 清单。
5. 单次重试一跳语义（Q8=A 用户裁定）：结算钩子在 executor-settle——终态 failed 且 extractFailureCode 命中 MODEL_INACCESSIBLE_CODES 白名单、该角色 fallback_models 链存在下一模型、且原记录 fallbackOf 为空（一跳上限）时，以链中下一模型重派一次（新子会话，记录写 fallbackOf=原 childId、fallbackAttempt=1，字段形状已存在且被测试钉住）；重试再失败、无链或已重试过则结算 failed 并附 failover 文案。通知走既有结算 followup 投影，不建独立通知模块。重派上下文来源：结算钩子侧原本只有 childId 与任务定位，DispatchRecord 不存原始 prompt，因此派发成功点扩展 trackDispatchSettle 登记重派上下文（parent Agent 引用、本次 send 的原始 prompt 全文、role、title、toolsAllow、生效模型绑定），满足 repo/workflow transport-failover 的 keeping the original prompt 要求，并按其 appending a failover note 语义在重派 prompt 尾部附加 buildFailoverNote 段（R2-3 裁定：保留 note 语义，buildFailoverNote 有消费点不成死导出，测试断言重派 prompt 含原 prompt 全文与尾部 note 段）；重派组装的复用函数落 dsh dispatch/executor-spawn.ts 共享模块，executor.ts 与 executor-settle.ts 单向引入避免循环（R2-4），结算侧以插件生命周期 ctx 的 subagents 服务与独立 AbortController 重派（原回合 signal 已结束不可复用）；钩子内异步重派不阻塞结算，全链 try/catch WARNING 降级。分类与文案从 core failover.js 迁 dsh 新模块 model-failover.ts（role 词汇）；'rotate' 模型来源值保持惰性历史值不动，fallback_models 解析链保留并恢复消费。
6. 画像节重建（Q9=A 用户裁定）：session-context.ts 内嵌渲染函数（不立独立模块，兼顾子任务二"不值得单列模块"裁定），节位置按 62332be^ 历史形态实际线序：Last dispatch 行后、Git 节前；数据源 config 加 mainModel（plugin.ts 恢复注入接线，main-model.ts 注释语义复原）；每角色一行——有配置显示 model 与 effort 及来源（whenMain=… 或 fallback），无配置输出 not configured (inherits parent session model)；节头文案逐字沿旧：mainModel 在位时 `Executor profiles (main model <mainModel>):`，缺失时 `Executor profiles (main model unknown; whenMain entries skipped):`。
7. planReview purpose 机制：purpose 值域扩展为 case-design/execution（checker 专用）加 plan-review（judger 专用）；dispatch-records 的 purpose 合法性校验按 role 分支，其余 role 传 purpose 拒绝（沿现"仅 check 有效"精神）；DispatchPurpose 类型扩联合。自动置 reviewing：executor.ts 派发成功后，role=judger 且 purpose=plan-review 且当前 phase 属 {none, revising} 时调 recordPlanReview 置 reviewing；已 reviewing 幂等跳过；phase=clean 时不动轨道并输出一行 WARNING（clean→reviewing 非合法边）；写失败仅 WARNING 不回滚派发（同 recordExecutorOverride 既有模式）。新工具 workloom_task_planreview：参数 {phase: 'revising'|'clean', taskPath?}，主会话限制照抄 align 的 delegationDepthOf 硬拒绝样板，编排入口 executePlanReviewMark 落 doc-review.ts（与 executeAlignTask/executeTaskCase 同族同类；task-ops.ts 已 934 行，不再加深超行债务），写口复用 recordPlanReview（非法边给可判定错误）；TOOL_NAMES/TOOL_DESCRIPTIONS/TOOL_SNIPPETS 加第十二键并更新计数文案。
8. 拆分布局（Q6=B）：task/storage/ 五文件——index.ts（唯一对外入口，重导出全部导出符号，实测 40 个，以 grep '^export' 全量清单为准）、records.ts（类型定义段加 TaskStatus/TaskPriority/DIR_NAMES/FILE_NAMES）、read-write.ts（读写序列化段）、create.ts（slug 与创建校验段）、list-archive.ts（hooks/列举/归档段）。task/state/ 十文件——index.ts（唯一对外入口，重导出全部导出符号，实测 54 个，以 grep '^export' 全量清单为准）、values.ts（五枚举加兼容判定集合加 LEGACY_* 常量）、view.ts（TaskView 加兼容读函数族）、transitions.ts（GUARD_KEYS/TaskTransition/TRANSITIONS）、audit.ts（OVERRIDE_GATES 等审计常量）、guards.ts（守卫注册表）、migrate.ts（迁移执行入口）、tracks.ts（CASE 与 planReview 轨道写入口）、confirm.ts（确认迁移）、pointers.ts（会话指针，含 SessionPointer 与 SessionPointerWithContext 两类型）。共享私有件（ERR_PREFIX、toError 等）一律放 values.ts，index.ts 只做重导出承载零实现，避免入口与分文件形成循环导入面。双向依赖以 type-only 断环且经入口：步骤 1 期间 records.ts 保持对现存 ../state-machine.ts 的 type-only 导入，步骤 2 建 state/ 后改线 state/index.ts 入口（type-only 无运行时环，决定 9 的入口纪律不留跨子目录直引例外——R2-5）。prompt-compose 平铺拆三：injection/prompt-compose.ts 保留入口（常量、校验、类型、主组装）、prompt-sections.ts（注入段函数）、prompt-io.ts（预算与文件工具）——injection/ 历来平铺兄弟布局且入口文件名不变使 core index 与 dsh 导入面零变动，663 行拆三无需子目录。
9. 子目录入口对外面：task/ 外代码（injection、workspace、core index.ts）与 task/ 内同级文件（task-ops、doc-review、dispatch-records、case-gates、case-scope）一律经 task/state/index.ts 与 task/storage/index.ts 导入，不直接引用子目录内分文件（原则 14 口径：同级文件相对子目录也算外部）；子目录内部文件可互相直引。
10. resources 切换边界（盘点报告第 4、11 节）：workflow.md 的派发指令句、`kind: X` 参数字样与句中 executor 角色名词机械切换（research executor→Researcher、implement executor→Developer、check executor→Checker、review executor→Judger、frontend→frontend-developer），1.4 节句补 purpose: plan-review 与自动置 reviewing 及 workloom_task_planreview 标记句；front-matter version 不提升——按 repo/workflow 的 asset-version-bump 条款，仅契约结构变化（states 列表或 #### 步骤集与顺序）才升版，本任务全部是既有步骤内的指令文案切换，protocol.js 的 WORKFLOW_PROTOCOL_VERSION 常量与 contract-asset.test 四处版本断言均不动。ui-design.md:23 切 role: frontend-developer。skill 文件（workloom-alignment SKILL.md 47/49、plan-authoring.md 5、test-first.md 3/25、workloom-case-active SKILL.md 9/27-28/35/43、workloom-case-archived SKILL.md 42、workloom-migrate-plan SKILL.md 14）同款机械切换；workflow-light.md 11/31 否定式提及核对切换。旧 stage 字样（workflow.md 79/136/155-156 的 stage implement/check）与叙述结构改写归子任务七不动。contract-asset.test.ts 三处钉住句（120-127/128-133/873）同步更新。
11. AC3 检索口径：对 src 与 resources 词边界检索旧五值；真消费点（盘点报告第 4 节清单加本 plan 补充的 case-gates.ts:36、executor-injection.ts:86、surface.ts 注册面三处、local-prompts 错误文案）零命中。必然命中但非消费点的四类归属：①盘点报告甄别清单的假命中（action 枚举 'review'、GateValue 'check'、LEGACY_STAGE_*、OVERRIDE_GATES.CHECK、RESEARCH_DIR、DSH 事件与结果形状 kind、第三方 skills、workflow.md 旧 stage 字样、LEGACY_KIND_TO_ROLE 映射表本体、历史夹具与兼容读测试）；②新值复合词的旧值词段——'-' 非单词字符，`grep -w frontend` 会命中 frontend-developer 的 frontend 段，检索式用 `grep -P 'frontend\b(?!-developer)'` 排除；③工件文件名 implement.jsonl/check.jsonl 及文档对其提及，按命中词位置负向前瞻排除（`implement\b(?!\.jsonl)`、`check\b(?!\.jsonl)`，与 ② 同款；不做整行排除，避免同一行兼有真消费点与文件名提及时漏检——R2-6）；④兼容读与过渡容忍的显式说明注释。显式冲突声明：prd AC3 的字面白名单括注（兼容读映射与历史夹具）不含 workflow.md 旧 stage 字样，本 plan 裁定其归子任务七（stage 值域属子任务三切换，非派发值域消费点），命中清单按上述类别逐条标注，供 check 阶段按归属复核；该裁定随 PLAN 确认一并提请用户确认。命中清单存档任务目录（legacy-check-*.md）。
12. 注释修正随被改文件走：executor.ts 的 startContinuable 五处（步骤 6/11）、executor-dispatch.ts:35 runtime='dsh'（步骤 13）、config.d.ts runtime 签名（步骤 8）、dispatch-binding Pi 注释（步骤 12）、inject.test.ts:90 profiles 残留（步骤 9）、executor-injection.ts:52 与 discipline-text.ts:206 的 assertKind 提及（步骤 6）、state-machine.ts:667 与 prompt-compose.ts:361 旧任务编号字样（步骤 2/3 拆分时）。R13 点名的 constants.ts 与 cordis.patch.yml 独立成步骤 16。未触及文件的剩余注释候选与过期 spec 条目（repo/terminology 的 executor 与 frontend executor 条目、repo/workflow 的 transport-failover 条目及 asset-version-bump 条目的过期路径）归步骤 16 清单登记，经 workloom-update-spec 流程更新（子任务七）。
13. 执行环境与提交纪律：全部步骤在任务 worktree 根执行（start 创建分支 workloom/11-06-sop-roles 加 worktree，packages.setup 跑 pnpm install）；凡验 dsh 的 typecheck 或测试前先 pnpm -r build（file:../core 经 exports 解析 dist）；移动或删除 src 文件的步骤同步删除 dist 对应旧产物（dist-mirror 双向差集守卫为兜底校验）。全部实施步骤只验证不提交；步骤 18 由主会话在任务分支单一 work commit 落代码加两包 dist（executor 禁止 commit，暂存交还）；簿记另走 chore commit。新增测试沿 HOME 加 TMPDIR 隔离惯例（盘点报告第 9 节代表写法）。
14. 过渡期参数名纪律：步骤 5 期间 core 的 BuildExecutorPromptParams.kind 字段名与 dsh 传参暂保持旧名（值经 normalizeExecutorRole 容忍新旧），步骤 6 dsh 切换时同批改名 role，避免中间态断链。

## Steps

#### 步骤 1：task-storage.ts 拆分 task/storage/（纯移动）

- Covers: AC1, AC2, AC9
- Target: packages/core/src/task/task-storage.ts（1146 行）退役；新建 packages/core/src/task/storage/{index,records,read-write,create,list-archive}.ts；涟漪点为盘点报告「task-storage 消费方清单」全部 10 个 src 文件与 core index.ts:165-174/393-414，及测试直连导入路径（task-store.test.ts、task-ops.test.ts、case.test.ts:19、doctor.test.ts 等）。
- Edit:

  ```text
  Input: 盘点报告第 2 节六段分组与行区间——常量 39-82、类型 84-350、读写序列化 352-552、slug 创建校验 554-944、hooks 列举归档 946-1146；双向依赖事实（state-machine 导入七值五型，task-storage 反向 type-only 导入三值域类型）。
  Output: 五文件布局按 Design decisions 8：records.ts 承载类型定义段加 TaskStatus/TaskPriority/DIR_NAMES/FILE_NAMES；read-write.ts 承载 requireProjectRoot/readTaskRecord/requireTaskRecord/normalizeTaskRecord/normalizeDispatchRecord/writeTaskRecord/writeTaskRecordToDir/serializeTask/stripTaskPath/readTaskFileOrNull 及 JSON_INDENT/TASK_JSON_ENV 等本段常量；create.ts 承载 slugify/assertValidSlug/buildTaskRecord/createTask/createTaskInternal/validateParent/linkChildToParent 及 SLUG_*/PAD_WIDTH/LOG_SEEDS 等本段常量；list-archive.ts 承载 runTaskHooks/logWarnings/listTasks/archiveRelPathOf/moveTaskToArchive/findArchivedTaskPath 及 HOOK_KEYS；index.ts 重导出全部导出符号（实测 40 个，以 grep '^export' 全量清单为准；唯一对外入口）。私有符号随归属文件走，storage 内部跨文件相对导入。records.ts 对三值域类型保持对现存 ../state-machine.ts 的 type-only import（现路径不动；步骤 2 建 state/ 后改线 state/index.ts 入口，断环语义不变）。零逻辑改动，头注释按新职责改写。
  Preconditions: worktree 就绪（步骤 2 依赖本步，state 拆分需要 storage 入口已就位）
  Procedure: 1) 建 storage/ 五文件按行区间搬移；2) index.ts 重导出面按 grep '^export' 全量清单（40 个）核对一个不少；3) git rm task-storage.ts；4) 10 个 src 消费方与 core index.ts 导入路径改 ./storage/index.ts 或 ../task/storage/index.ts；5) 测试直连导入路径同步；6) 删 dist 中 task-storage 旧产物，pnpm -r build 重建。
  Failure: 漏改导入 typecheck 报未解析符号阻断；dist 残留由 dist-mirror 双向差集测试报红阻断。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；`wc -l packages/core/src/task/storage/*.ts` 全部低于 600；`ls packages/core/src/task/task-storage.ts` 不存在。

#### 步骤 2：state-machine.ts 拆分 task/state/（纯移动）

- Covers: AC1, AC2, AC9
- Target: packages/core/src/task/state-machine.ts（1427 行）退役；新建 packages/core/src/task/state/{index,values,view,transitions,audit,guards,migrate,tracks,confirm,pointers}.ts；涟漪点为盘点报告「state-machine 消费方清单」全部 12 个 src 文件与 core index.ts:80-128/194-201/450，及测试直连导入（state-machine.test.ts、task-ops.test.ts、session-context.test.ts、workflow-service.test.ts、active-task.test.ts、case.test.ts、doctor.test.ts 等）。
- Edit:

  ```text
  Input: 盘点报告第 1 节九段分组与行区间——值域枚举 58-128、TaskView 与迁移表 130-216、兼容读单点 218-405、审计常量 407-470、守卫注册表 472-716、迁移执行 718-945、轨道写入口 947-1040、确认迁移与会话指针 1042-1427；对 storage 的七值五型导入面；state-machine.ts:667 旧任务编号注释。
  Output: 十文件布局按 Design decisions 8：values.ts（五枚举、四判定集合、LEGACY_MODE_FULL/LEGACY_STAGE_* 常量）；view.ts（TaskView、readTaskView/isTaskView/toTaskView/statusOfStage/mapMode/deriveStage/mapCasePhase/mapPlanReview/mapAutonomy/isArchivePath）；transitions.ts（GUARD_KEYS/GuardKey/TaskTransition/guards()/TRANSITIONS）；audit.ts（OVERRIDE_GATES/OverrideGateKey/GATE_TOOL_NAMES/LIGHT_DISPATCH_REJECT_TEXT/PLAN_CONFIRM_MISSING*/ALIGNMENT_MISSING/FRONTEND_DISPATCH_MISSING/UI_DESIGN_SECTION/UI_NOT_APPLICABLE_PREFIXES/LIGHT_START_SECTION）；guards.ts（GuardContext/GuardResult/GuardFn/GUARD_PASS/guardReject/全部守卫函数/GUARDS/FORCEABLE_GUARD_GATES/evaluateGuard）；migrate.ts（BlockedGuard/TransitionEvaluation/MigrateTaskParams/MigrateTaskResult/findTransitionPath/evaluateTransition/assertForceReason/migrateTask/buildOverrideEntry）；tracks.ts（CASE_PHASE_EDGES/PLAN_REVIEW_EDGES/isLegal*/recordCasePhase/recordPlanReview）；confirm.ts（ConfirmEntryInput/ConfirmSource/buildAutoConfirmSummary/confirmPrd/confirmPlan）；pointers.ts（指针常量、SessionPointer 与 SessionPointerWithContext 两类型、五指针函数、私有辅助）；index.ts 重导出全部导出符号（实测 54 个，以 grep '^export' 全量清单为准）。ERR_PREFIX 与 toError 等共享私有件一律放 values.ts，index.ts 只做重导出承载零实现（决定 8，避免入口与分文件形成循环导入面）。对 storage 的导入改 ../storage/index.ts；storage/records.ts 对三值域类型的 type-only 导入由 ../state-machine.ts 改线 state/index.ts 入口（双向依赖断环的落点，type-only 经入口不破坏决定 9 纪律，衔接步骤 1）。667 行旧任务编号注释顺带修正（Design decisions 12）。零逻辑改动。
  Preconditions: 步骤 1 完成
  Procedure: 1) 建 state/ 十文件按行区间搬移；2) index.ts 重导出面按 grep '^export' 全量清单（54 个）核对；3) storage/records.ts 的 type-only 导入改线 state/index.ts；4) git rm state-machine.ts 并删 dist 旧产物；5) 12 个 src 消费方与 core index.ts 导入路径改子目录入口；6) 测试直连导入同步；7) pnpm -r build 重建。
  Failure: 漏改导入 typecheck 阻断；dist 残留由 dist-mirror 报红；state 与 storage 间出现运行时环时（type-only 被误写成值导入）node --test 加载即报循环错误阻断。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；`wc -l packages/core/src/task/state/*.ts` 全部低于 600；`ls packages/core/src/task/state-machine.ts` 不存在。

#### 步骤 3：prompt-compose.ts 平铺拆三（纯移动）

- Covers: AC1, AC2, AC9
- Target: packages/core/src/injection/prompt-compose.ts（663 行）拆为入口加 prompt-sections.ts 加 prompt-io.ts；涟漪点仅模块内部（入口文件名不变，core index.ts:52-58/379-383 与 dsh executor-injection.ts:12、executor.ts:94、executor-schema.ts:9 的导入面零变动）。
- Edit:

  ```text
  Input: 盘点报告第 3 节七段结构——常量 38-158、校验 160-182、类型 193-233、主组装 235-355 与 366-376、注入段函数 389-582、预算与工具 591-663；prompt-compose.ts:361 旧任务编号注释。
  Output: prompt-compose.ts 入口保留头注释、常量、校验（assertEffort/assertKind）、入参与结果类型、buildExecutorPrompt/buildInternal/buildExecutorIncrementalPrompt/assertCheckDispatchGuards（约 400 行内）；prompt-sections.ts 承载 inlineCurrentCase/inlineCaseTemplates/buildWorktreeSection/inlinePrdArtifact/extractPrdContent/splitH2Sections/pointerLine/inlineResearchMaterials/listResearchMarkdownNames；prompt-io.ts 承载 limitByBytes/truncateUtf8/byteLength/readTaskFile/requireStringField/toError/isEnoent/isMissingLike。共享常量归属随消费方，跨文件共用者留入口由兄弟文件导入。361 行旧任务编号注释顺带修正。零逻辑改动。
  Preconditions: 无（与步骤 1/2 独立，顺序执行避免同文件冲突）
  Procedure: 1) 建两兄弟文件搬移；2) 入口瘦身并内部导入；3) 删 dist 旧产物对应新文件集，pnpm -r build 重建。
  Failure: 常量归属错放导致循环导入时 node --test 加载报红阻断。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；`cd packages/core && pnpm test` 全绿（prompt-compose.test.ts 直连入口路径不变）；`wc -l packages/core/src/injection/prompt-compose.ts packages/core/src/injection/prompt-sections.ts packages/core/src/injection/prompt-io.ts` 全部低于 600。

#### 步骤 4：新建 executor-roles.ts 值域模块（新旧并存）

- Covers: AC2（值域与映射直测）
- Target: 新建 packages/core/src/dispatch/executor-roles.ts 与 packages/core/test/executor-roles.test.ts；packages/core/src/index.ts 补具名重导出（executor-kinds.ts 本步不动）。
- Edit:

  ```text
  Input: prd R1 值域与显示名、R4 映射表、Q7=A 命名裁定；executor-kinds.ts 现形状（盘点报告第 4 节摘录）作对照。
  Output: EXECUTOR_ROLES 冻结对象五键（RESEARCHER:'researcher'、DEVELOPER:'developer'、FRONTEND_DEVELOPER:'frontend-developer'、CHECKER:'checker'、JUDGER:'judger'）；ExecutorRole 类型；isExecutorRole 守卫；ROLE_LABELS 冻结映射（值→显示名 Researcher/Developer/Frontend Developer/Checker/Judger）；LEGACY_KIND_TO_ROLE 冻结映射五条；normalizeExecutorRole(value)——新值原样、旧值映射、其余抛 `${ERR_PREFIX}: unknown executor role: <value>` 风格可判定错误；过渡期 isExecutorRoleOrLegacy(value)（新旧皆真，步骤 7 退役）；tryNormalizeExecutorRole(value)（非抛错变体：未知值返回 null，供运行期扫描与收集面使用——容量收集、守卫与 toolface 重建、续用校验，脏值由调用方跳过加 WARNING；抛错版 normalizeExecutorRole 保留给兼容读入口与展示判定点）。纯常量模块零依赖，头注释写明设计意图与过渡栖身地退役计划。单测覆盖：五值合法判定、五旧值映射、未知值报错、tryNormalize 的 null 分支、显示名齐全、OrLegacy 双域。
  Preconditions: 无
  Procedure: 1) 写模块；2) 写单测；3) index.ts 具名重导出（沿全具名导出风格，无 export *）。
  Failure: none（纯新增，无消费方）
  ```

- Verify: `cd packages/core && node --test test/executor-roles.test.ts` 全绿；`pnpm -r typecheck` 退出码 0。

#### 步骤 5：core 消费点切换（过渡期双值容忍）

- Covers: AC2, AC7
- Target: task/state/view.ts（toTaskView）、task/state/guards.ts（guardUiDispatchReady）、task/state/audit.ts（FRONTEND_DISPATCH_MISSING）、task/dispatch-records.ts、task/case-gates.ts（CHECK_KIND）、workspace/doctor-check-rules.ts、injection/prompt-compose.ts、injection/session-context.ts、dispatch/executor-capacity.js（仅判定归一）、index.ts；local-prompts.ts、capacity 参数改名与文案、surface.ts 整体留步骤 6（与 dsh 调用面同批，决定 2）。消费点锚点全表见盘点报告第 4 节 core 表格。
- Edit:

  ```text
  Input: 盘点报告第 4 节 core 真消费点清单（state-machine 行号以拆分后 state/ 符号定位）、第 10 节 8 个记录读取点、第 3 节 JSONL_FILES 与 assertKind 摘录；session-context.test 的 Last dispatch 逐字钉住在 566/593 两处（夹具 548/581 行；第 2 轮评审实读核验，盘点报告未载此摘录——R3-2）。local-prompts TARGET_BY_FILE 摘录随移批转步骤 6 的 Input（R2-8）。
  Output: ①视图层单点：toTaskView 对 dispatches 逐条 normalizeExecutorRole 归一（守卫与视图消费方天然见新值）；②guardUiDispatchReady 判定改 EXECUTOR_ROLES.frontendDeveloper，FRONTEND_DISPATCH_MISSING 文案切 'no frontend-developer dispatch recorded for a task with UI requirements'；③记录级直读点显式归一（统一口径：各判定点的记录值与比较目标均经 normalizeExecutorRole 归一后再比较，决定 1；写侧入参不做预归一，过渡期直经 isExecutorRoleOrLegacy 校验——预归一会使步骤 7 的收严恒真、旧值写入报错无法成立，R2-2）：dispatch-records 的 CASE 推进与结算三处判定改 checker、写侧校验 isExecutorKind→isExecutorRoleOrLegacy（过渡，报错文案列新值域）、purpose 校验判定值切 checker；case-gates 的 CHECK_KIND 改引 EXECUTOR_ROLES.checker 且比较前归一；doctor-check-rules 两处判定同改；④prompt-compose：JSONL_FILES 键切 developer/frontend-developer/judger→implement.jsonl 与 checker→check.jsonl（researcher 无 jsonl），assertKind 改名 assertRole（过渡收 OrLegacy），buildInternal 顶部 const role = normalizeExecutorRole(params.kind) 后全部分支用 role（物化 prd 三角色、Pointer 排除 researcher、软指针 developer 与 frontend-developer、CASE 相关 checker），buildExecutorIncrementalPrompt、inlineCurrentCase、inlineCaseTemplates 的 params.kind 判定点同口径（以归一后的 role 判定），BuildExecutorPromptParams.kind 字段名保留至步骤 6（决定 14）；⑤local-prompts 本步不动：dsh 仍传旧 target，先行切换值域会使 filterAndOrderLocal 抛 unknown target 且 executor.ts 直接上抛，dsh 全部派发用例报红（评审 #1）；target 值域、双文件名兼容与错误文案全部移步骤 6 与 dsh 调用面同批；⑥session-context Last dispatch 行显示前归一（畸形值防御分支保留）；⑦executor-capacity.js 仅做判定两侧归一：running 记录值与 kind 入参均经 tryNormalizeExecutorRole 归一后比较（toTaskView 归一后采集侧见新值、in-flight 登记与闸参数仍旧值，单侧归一会漏计——评审 #1），参数名、.d.ts、at capacity 文案均不动，步骤 6 切换；该文件是零导入的纯 JS 行为模块，本步引入其首个 .js→.ts 导入（executor-roles.ts）——构建期 tsconfig.base 的 rewriteRelativeImportExtensions 重写 dist 说明符、运行期 Node v24 原生 type stripping 支持 src 直跑（机制已在评审轮核验），禁止在 JS 内私拷映射规避导入（值域单源纪律，R2-9）；⑧测试同步：state-machine.test UI 门禁文案钉住更新且夹具新旧双值（新值主用例、旧 frontend 值兼容用例）、task-store.test 写侧过渡用例与报错文案、case.test 与 doctor.test 夹具、prompt-compose.test 的 assertRole 与头注释钉住与 JSONL 映射、session-context.test 的 Last dispatch 两处逐字钉住按归一后显示值更新（566/593 行，旧值夹具钉归一显示，另补新值主用例——R2-1）、executor-capacity.test 补两侧归一过渡用例（旧记录与旧参数混合正确计数）；local-prompts.test 的文案更新与双文件名用例移步骤 6。
  Preconditions: 步骤 1-4 完成
  Procedure: 1) 视图层归一；2) 守卫与审计文案；3) dispatch-records/case-gates/doctor 判定切换（统一归一比较）；4) prompt-compose 切换（含增量入口与 inline 段函数判定点）；5) session-context 显示归一；6) capacity 判定两侧归一（参数名与文案不动）；7) 测试同步与新增；8) index.ts 过渡注释更新（旧值域模块标注步骤 7 退役）。
  Failure: 漏切判定点由旧值夹具用例暴露；normalize 未知值抛错阻断坏数据（运行期扫描与收集面用 tryNormalize 非抛错变体，决定 2）；dsh 侧此时仍传旧值，经入口 OrLegacy 与两侧归一容忍保持全绿（local-prompts 与 capacity 的参数面文案未动，dsh 调用面零感知）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；`cd packages/core && node --test test/state-machine.test.ts test/prompt-compose.test.ts test/executor-capacity.test.ts test/session-context.test.ts` 全绿。

#### 步骤 6：dsh 消费点与工具面切换（role 参数）

- Covers: AC2, AC4, AC8
- Target: core injection/surface.ts、injection/prompt-compose.ts（参数字段名）、injection/local-prompts.ts（target 值域与文案，自步骤 5 移入）、dispatch/executor-capacity.js 与 .d.ts（参数改名与文案，自步骤 5 移入）；dsh dispatch/executor-schema.ts、executor.ts、executor-injection.ts、executor-capacity.ts、executor-continuation.ts、executor-guard.ts、discipline-text.ts、executor-toolface.ts、plugin.ts（核对）。锚点全表见盘点报告第 4 节 dsh 表格与第 6 节 executor.ts 十二段。
- Edit:

  ```text
  Input: 盘点报告第 4 节 dsh 真消费点、第 6 节 schema 注册形态（executor-schema.ts:22-25 无 enum、69 required）与 executor.ts 主流程锚点、KIND_LABELS 与 buildChildLabel 摘录、第 9 节 executor.test 钉住面；随移批补引：第 4 节 core local-prompts TARGET_BY_FILE 与错误文案摘录、local-prompts.test 115/203 钉住、executor-capacity.d.ts 55-59 receipt 文案契约（R2-8）。
  Output: ①executor-schema.ts：kind 参数改名 role，required 改 ['role','prompt','title']，加 enum 五新值（AC4 的 schema 层 fail loud），描述引 PARAM_DESCRIPTIONS.role；②surface.ts：TOOL_DESCRIPTIONS.executor 与 TOOL_SNIPPETS.executor 切 role 词汇、PARAM_DESCRIPTIONS 的 kind 键改名 role 且 model/effort 描述改指 subagent_profiles（根层级 subagents 字样清除）、buildContinueNoDispatchText/buildContinueNoChildIdText/buildCrossKindReuseRejectText 三文案切 role 词汇且跨域函数 LSP 改名 buildCrossRoleReuseRejectText（dsh 引用同批）；③prompt-compose：BuildExecutorPromptParams.kind 与增量入参改名 role，assertRole 收严准备（本步仍 OrLegacy，步骤 7 收紧）；④executor.ts：ExecutorArgs.role、resolveSubagentDefaults/detectExecutorConflicts/composeLocalDirectivesText/容量闸/buildChildLabel 传参链切 role、recordExecutorDispatch 的 kind 字段写 role 值（字段名保留，决定 1）、WRITE_GUARDED 判定切新集合、头注释与 startContinuable 五处注释改 startActivation（决定 12）；⑤executor-injection.ts：KIND_LABELS 退役改 import core ROLE_LABELS、86 行字面量改 EXECUTOR_ROLES.checker、buildChildLabel 回退 workloom-<role>、52 行注释的 assertKind 字样同步 assertRole；⑥core executor-capacity.js 与 .d.ts：入参 kind 改名 role、at capacity 文案切 '<role> role at capacity'（步骤 5 的两侧归一保留）；core local-prompts.ts：LOCAL_FRAGMENT_TARGETS 切七新 target、TARGET_BY_FILE 新旧双文件名映射同一 target（决定 4）、注释与错误文案切新清单，dsh composeLocalDirectivesText 调用点同批切 role；dsh executor-capacity.ts：LABEL_TO_ROLE 与 roleFromLabel（'Frontend Developer' 含空格标签的括号解析确认）、收集与 in-flight 登记值经 tryNormalizeExecutorRole 归一；归一失败的两种语义分面处理（R3-4）——容量收集面保留该记录并计入全局闸（与现状 kind 解析落空的在飞子会话仍占全局槽位一致，避免全局容量漏计），仅角色闸计数将其排除并加 WARNING；过滤重建面（guard/toolface，步骤 14）归一失败的值不入结果集；⑦executor-continuation.ts：同 role 校验双侧经 tryNormalizeExecutorRole（旧在飞记录可续，脏值跳过加 WARNING），拒绝文案接改名后函数；⑧executor-guard.ts：WRITE_GUARDED_KINDS 改名 WRITE_GUARDED_ROLES 值 [researcher, judger]、重建扫描处经 tryNormalizeExecutorRole（旧 research/review 记录识别、脏值跳过加 WARNING，R9 半侧）、注释同步；⑨discipline-text.ts：EXECUTOR_CONTRACT_BY_KIND 改名 EXECUTOR_CONTRACT_BY_ROLE 五新键（五段纪律文案角色名词对应切换）、标题函数用 ROLE_LABELS、206 行注释的 assertKind 字样同步；⑩executor-toolface.ts 注释核对；⑪测试同步：executor.test（五角色 label 断言、subagent_profiles 夹具键切 developer 等七处、写守卫夹具切角色值并保留旧值兼容用例、跨 role 续用拒绝、light 门禁、容量闸、2693/2734 两处 at-capacity 文案逐字钉住更新为 '<role> role at capacity'、legacy 夹具 1348/2304 保留旧值）、workloom_execute 参数面 schema 断言由 executor.test 参数用例段（872-886 附近）或 case-executor.test 承载（properties 含 role 无 kind、required=['role','prompt','title']、enum 五新值、additionalProperties:false 拒 kind——AC4 落点，评审 #13）、case-executor.test label、core prompt-compose.test 入参字段 kind→role 全量切换（含 baseParams 辅助与头注释钉住的字段名——core 测试不在 tsconfig include，typecheck 拦不住，漏改则运行期 normalizeExecutorRole(undefined) 必抛批量红，R2-10）、local-prompts.test 两处文案钉住更新加双文件名兼容用例（自步骤 5 移入）、executor-capacity.test 文案更新、discipline-text.test 的 ALL_KINDS 改 ALL_ROLES 五新值、surface.test 三续用文案字面量、inject.test 核对。
  Preconditions: 步骤 5 完成
  Procedure: 1) schema 与 surface；2) prompt-compose 参数名与 dsh 调用点同批；3) local-prompts target 切换与 composeLocalDirectivesText 调用点；4) executor.ts 传参链；5) labels 与 capacity（core 参数改名文案加 dsh 收集归一）与 continuation；6) guard 与 discipline-text；7) 测试同步；8) grep dsh src 复核。
  Failure: schema enum 在工具边界拒绝旧值（第一层），assertRole OrLegacy 兜过渡（第二层）；漏改调用点 typecheck 阻断；label 解析回归由 executor.test 五角色断言报红；capacity 与 local-prompts 的切换与 dsh 调用面同批完成，无跨包过渡断链（评审 #1 的落点）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；dsh src 词边界检索按决定 11 精化检索式输出命中清单，经四类归属复核后真消费点零命中（R2-7）；schema role enum 用例通过。

#### 步骤 7：收紧写侧与旧值域模块退役

- Covers: AC3（src 段）, AC4
- Target: 删 packages/core/src/dispatch/executor-kinds.ts；index.ts 旧重导出段删除；executor-roles.ts 删 isExecutorRoleOrLegacy；dispatch-records.ts 写侧校验切 isExecutorRole；prompt-compose assertRole 收严；测试反转（task-store.test 旧值写入报错、prompt-compose.test assertRole 拒旧值、executor-roles.test 删 OrLegacy 双域用例——R2-11）。
- Edit:

  ```text
  Input: 步骤 5/6 遗留的全部 OrLegacy 调用点（grep isExecutorRoleOrLegacy 与 EXECUTOR_KINDS 定位）。
  Output: 写侧与参数校验只收新五值；旧值写入报可判定错误（文案列新值域）；executor-kinds.ts 删除且 index.ts 无旧导出；读侧 normalizeExecutorRole 兼容映射永久保留（R4）。
  Preconditions: 步骤 6 完成
  Procedure: 1) grep 清点 OrLegacy 与 EXECUTOR_KINDS 全部残留调用（范围含两包 src 与 test）；2) 逐点切严格校验；3) 删模块删导出删 dist 旧产物；4) 测试反转；5) pnpm -r build 重建。
  Failure: 残留调用 typecheck 报未解析符号阻断；dist 残留由 dist-mirror 报红。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；`grep -rn "EXECUTOR_KINDS\|isExecutorRoleOrLegacy" packages/core/src packages/dsh-workloom/src` 零命中；AC3 src 段按决定 11 精化检索式（frontend 用 `grep -P 'frontend\b(?!-developer)'` 排除新值词段，implement/check 用 `(?!\.jsonl)` 负向前瞻排除工件文件名形态，不做整行排除——与决定 11 ③ 同口径，R3-1）输出命中清单，逐条对照假命中甄别表复核后存档任务目录（legacy-check-src.md）。

#### 步骤 8：配置根层级 subagents 退役（R5）

- Covers: AC5（上半）, AC2
- Target: workspace/config-load.ts（282-289 特判、301-304 WARNING、345-347 解析、220-266 provenance 链）、config-defaults.ts（DEFAULT_CONFIG.subagents）、config.d.ts（subagents/subagentsSource 字段、174-184 与 211-217 过期 runtime 签名修正）、config-subagent.ts（parseSubagents、legacyLayer 链 320-357、'legacy' 来源类型成员、buildConflictNotice 文案、configSourceSuffix legacy 分支）、workspace/doctor-check-rules.ts:511 hint 文案。
- Edit:

  ```text
  Input: 盘点报告第 5 节 config-load 三处位点摘录、config-subagent legacy 链摘录、第 11 节第 7/9 条。
  Output: 根层级 subagents 出现即抛 WorkloomConfigError('subagents', 'is no longer supported; migrate to subagent_profiles')（全局层与项目层同口径，替代原 WARNING 放行）；DEFAULT_CONFIG 与类型面删 subagents/subagentsSource；provenance 跟踪链退役；resolveSubagentDefaults 解析链收敛为 显式参数 > subagent_profiles 命中条目 > undefined（继承宿主默认），'legacy' 从 ResolveSubagentDefaultsResult 来源联合中删除（DispatchModelSource 的 'legacy' 成员保留惰性历史值，决定 5）；buildConflictNotice 文案切 subagent_profiles.<role>；configSourceSuffix 删 legacy 分支；config.d.ts 的 runtime 过期签名与 map 形式注释修正（决定 12）；doctor hint 文案删 subagents 字样；subagent_profiles 条目内部命中旧五值键时输出加载期一次性 WARNING（文案指向新 role 键名，不抛错不破坏存量环境——旧键配置静默失效与根层级迁移指引的口径需一致，评审 #19）。测试：config.test.ts 397-408 反转为抛错加文案含迁移指引断言、115-148 三层合并用例改两层、profile 内旧角色键 WARNING 新增用例、dispatch-binding.test 的 legacy 来源用例反转（文件本体步骤 12 迁移）。
  Preconditions: 步骤 6 完成（role 词汇已就位，冲突文案一步到位）
  Procedure: 1) config-load 三处改抛错删解析；2) defaults 与类型面；3) config-subagent 链收敛与文案；4) provenance 退役；5) doctor hint；6) 测试反转。
  Failure: 存量配置带根层级 subagents 时 loadConfig 即报错（fail loud 设计意图），报错文案给出迁移目标。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；新增用例观察：构造带根层级 subagents 的配置加载抛错且文案含 subagent_profiles。

#### 步骤 9：session-context 画像节重建（R6）

- Covers: AC5（下半）, AC2
- Target: injection/session-context.ts（内嵌渲染函数加节接线加参数面）、dsh plugin.ts（恢复 config 与 mainModel 注入接线）、dsh dispatch/main-model.ts（注释核对）；测试 session-context.test.ts、inject.test.ts（含 90 行过期注释修正）。
- Edit:

  ```text
  Input: 决定 6；盘点报告第 5 节现状（session-context.ts:146-194 行序无画像节；历史实现 executor-profiles.js 的 NOT_CONFIGURED_TEXT 文案见 git 62332be^）；resolveSubagentDefaults 两层链（步骤 8 后形态）。
  Output: session-context.ts 新增内部渲染函数：遍历 EXECUTOR_ROLES 五角色，逐角色经 resolveSubagentDefaults(config, role, {}, mainModel) 取生效 model/effort 与来源——有配置行输出 `<role>: <model>`（带 effort 与 whenMain=…/fallback 来源标注），无配置行输出 `<role>: not configured (inherits parent session model)`；节头文案逐字沿旧：mainModel 在位 `Executor profiles (main model <mainModel>):`，缺失 `Executor profiles (main model unknown; whenMain entries skipped):`；节位置在 Last dispatch 行后、Git 节前（按 62332be^ 历史形态实际线序，评审 #14）；assemble 参数面扩 config 与 mainModel 可选入参；plugin.ts 的 assembleSessionContextText 接线恢复 loadConfig 与 readMainModel 传参；main-model.ts 头注释「画像 whenMain 匹配」语义复原核对。测试：画像节用例（五角色全缺省 info 行、whenMain 命中行、fallback 命中行、unknown 节头逐字断言）、inject.test 集成断言与 90 行注释修正。
  Preconditions: 步骤 8 完成
  Procedure: 1) 渲染函数与节接线；2) 参数面与 plugin 注入；3) 测试；4) 注释核对。
  Failure: config 加载失败时画像节降级为不渲染加 WARNING（会话上下文不因配置错误中断，沿 session-context 既有防御风格）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；单测断言 info 行文案逐字 `not configured (inherits parent session model)`。

#### 步骤 10：planReview 派发联动与 workloom_task_planreview 工具（R7）

- Covers: AC6, AC2
- Target: dsh dispatch/executor-schema.ts（purpose enum）、core task/storage/records.ts（DispatchPurpose 联合）、task/dispatch-records.ts（purpose 校验与写入分支）、dsh dispatch/executor.ts（自动置位段）、core task/doc-review.ts（executePlanReviewMark，与 align/case 编排同族）、dsh tooling/tasks.ts（工具注册）、core injection/surface.ts（TOOL_NAMES 十二键与描述与计数文案）、index.ts 导出。
- Edit:

  ```text
  Input: 决定 7；盘点报告第 6 节 tasks.ts 九工具注册样板与主会话限制摘录（311-322）、第 8 节 recordPlanReview 现成写入口（tracks.ts，revising 轮数自增）与「生产代码零调用」事实、第 10 节 buildDispatchRecord purpose 分支摘录（434-436）。
  Output: ①purpose 值域扩为 case-design/execution（checker 专用）加 plan-review（judger 专用），schema enum 与参数描述同步；②DispatchPurpose 类型扩联合；dispatch-records 的 purpose 校验按 role 分支（checker 收 case-design/execution、judger 收 plan-review、其余 role 传 purpose 报错），buildDispatchRecord 的 purpose 写入分支扩到 judger；③executor.ts 派发成功结算登记段后加自动置位：role=judger 且 purpose=plan-review 且当前 planReview phase 属 {none, revising} 时调 recordPlanReview(root, taskRelPath, reviewing)，已 reviewing 幂等跳过，phase=clean 时不动轨道并输出一行 WARNING（clean→reviewing 非合法边，评审 #15），调用失败仅 console.warn 不回滚派发（同 recordExecutorOverride 模式）；④doc-review.ts 新增 executePlanReviewMark({phase: 'revising'|'clean', taskPath?})——与 executeAlignTask/executeTaskCase 同族落位，不再向已 934 行的 task-ops.ts 新增编排（评审 #16），cwd/root/task 解析同 align 模式，写口 recordPlanReview，返回视图投影；⑤tasks.ts 注册 workloom_task_planreview（schema {phase enum, taskPath?} 加 additionalProperties false，delegationDepthOf 主会话硬拒绝，renderTask 投影）；⑥surface.ts TOOL_NAMES 加第十二键、TOOL_DESCRIPTIONS/TOOL_SNIPPETS 加条目、计数文案十一改十二；⑦测试：tasks.test 第十工具 schema 与主会话限制文案、executor.test 自动置位（judger+plan-review 派发后 planReview.phase=reviewing、reviewing 再派幂等、clean 态派发不动轨道仅 WARNING、judger 无 purpose 不动轨道、checker purpose 行为不变）、task-ops.test 补 executePlanReviewMark 用例（revising 轮数加一、clean 落定、非法边报错；函数宿主在 doc-review.ts）、case-executor.test.ts:38-39 的 purpose enum 钉住更新为 case-design/execution/plan-review 三值（评审 #12）。
  Preconditions: 步骤 6 完成
  Procedure: 1) purpose 类型与校验分支；2) schema enum；3) 自动置位接线；4) 编排入口与工具注册；5) surface 三处加计数；6) 测试。
  Failure: 非法边（如 none→clean）由 recordPlanReview 抛可判定错误，工具层透传；自动置位失败降级 WARNING，plan-review-clean 守卫仍会在 PLAN 确认时硬拦（双保险）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；AC6 三观察点用例齐（自动置位、工具标记、非评审目的不动轨道）。

#### 步骤 11：failover 迁移与单次重试接线（R10）

- Covers: AC2, AC9（failover 半侧）
- Target: 新建 dsh dispatch/model-failover.ts 与 dispatch/executor-spawn.ts；删 core dispatch/failover.js 与 index.ts 重导出段；core test/failover.test.ts 迁 dsh；executor-settle.ts（重试钩子）；executor.ts（新派发分支组装段抽 executor-spawn.ts 共享模块，两处单向引入——R2-4）。
- Edit:

  ```text
  Input: 决定 5；盘点报告第 7 节 failover.js 五导出全死事实与 12 错误码白名单、第 6 节 executor.ts 新派发分支 444-496 与 executor-settle「只做终态回填不重派」头注释、task-store.test 钉住的 fallbackOf/fallbackAttempt 字段形状（2164/2203）。
  Output: ①model-failover.ts 承载迁移后的 MODEL_INACCESSIBLE_CODES/isModelInaccessibleCode/extractFailureCode/buildFailoverNote/buildFailoverNotice（文案 kind 词汇切 role，死导出问题随迁移消解——dsh 内部直接消费不再经 core index）；②core failover.js 删除、index.ts 重导出删除、dist 旧产物删除、单测迁 dsh 并更新文案断言；③executor.ts 把新派发分支的组装段抽为新建 dsh dispatch/executor-spawn.ts 共享模块（入参含 model/effort 覆盖与 fallbackOf/fallbackAttempt 记录字段），executor.ts 与 executor-settle.ts 单向引入（避免 executor↔settle 导入环——R2-4），原路径行为不变；派发成功点扩展 trackDispatchSettle 登记重派上下文——parent Agent 引用、本次 send 的原始 prompt 全文、role、title、toolsAllow、生效模型绑定（结算钩子侧原本只有 childId 与任务定位，DispatchRecord 不存 prompt，此登记即一跳重派的上下文来源，满足 transport-failover 的 keeping the original prompt 要求——评审 #3）；④executor-settle.ts 接线重试钩子（异步重派不阻塞结算，全链 try/catch WARNING 降级）：终态 failed 且 extractFailureCode 命中白名单、该角色 fallback_models 链有下一模型、原记录 fallbackOf 为空时，经 executor-spawn 复用函数与登记的重派上下文以链中下一模型一跳重派——重派用插件生命周期 ctx 的 subagents 服务与独立 AbortController（原回合 signal 已结束不可复用——R2-4），重派 prompt 尾部附加 buildFailoverNote 段（transport-failover 的 appending note 语义，note 因此保有消费点——R2-3；新子会话登记、记录写 fallbackOf=原 childId 与 fallbackAttempt=1、通知走结算 followup 投影）；重试再失败、无链、链耗尽或已重试过则结算 failed 附 buildFailoverNotice 文案；钩子异常不回滚已结算 failed 记录。测试：dsh model-failover.test（迁移加文案）、executor.test 或 executor-settle 新增重试接线用例（有链一跳重派记录形状、重派 prompt 含原 prompt 全文与尾部 note 段断言、二次失败不再跳、无链结算加文案、fallbackOf 非空不再重试）。
  Preconditions: 步骤 6、8 完成（role 词汇与 fallbackModels 两层链就位）
  Procedure: 1) 迁模块迁测试；2) 删 core 侧与 dist 产物；3) 抽 executor-spawn.ts 共享模块并两处单向接线；4) settle 钩子接线；5) 重试用例。
  Failure: 钩子任何异常不回滚已结算 failed 记录（WARNING 降级）；一跳上限由 fallbackOf 非空判定硬挡。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；`grep -rn "failover" packages/core/src` 零命中；`ls packages/core/src/dispatch/failover.js` 不存在。

#### 步骤 12：dispatch-binding.js 迁 dsh（R10）

- Covers: AC2, AC9
- Target: 新建 dsh dispatch/dispatch-binding.ts；删 core dispatch/dispatch-binding.js 与 index.ts:42-46 重导出段；PARENT_MODEL_LABEL 迁 core injection/surface.ts 模块内常量（唯一消费方 surface.ts:11/328）；core test/dispatch-binding.test.ts 迁 dsh。
- Edit:

  ```text
  Input: 盘点报告第 7 节 dispatch-binding.js 三导出生死判定（buildNewDispatchBinding 活、resolveDispatchModelSource 对外死、PARENT_MODEL_LABEL 活于 core）与 Pi 注释过期事实（5-7 行）。
  Output: buildNewDispatchBinding 与 resolveDispatchModelSource 迁 dsh dispatch/dispatch-binding.ts（后者降级模块内私有），resolveDispatchModelSource 删 'legacy' 来源分支（步骤 8 后不再产生；DispatchModelSource 的 'legacy' 类型成员保留惰性）；Pi 共用注释删除，头注释改写为 dsh 派发绑定构造职责；PARENT_MODEL_LABEL 收进 surface.ts 不再跨模块导出；core index.ts 重导出删除、dist 旧产物删除；单测迁 dsh 并反转 legacy 用例。executor.ts 内 buildNewDispatchBinding 的导入处改本地相对路径（按符号定位；原 86/512 行号锚点在步骤 11 抽取 executor-spawn.ts 后会偏移——R3-3）。
  Preconditions: 步骤 8、11 完成
  Procedure: 1) 建 dsh 模块迁两函数；2) PARENT_MODEL_LABEL 迁 surface；3) 删 core 侧文件与导出与 dist 产物；4) 测试迁移与反转；5) executor.ts 导入改线。
  Failure: 漏改导入 typecheck 阻断；dist 残留 dist-mirror 报红。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；`ls packages/core/src/dispatch/dispatch-binding.js` 不存在；`grep -rn "PARENT_MODEL_LABEL" packages/core/src` 仅 surface.ts 命中。

#### 步骤 13：NATIVE_TOOLS_DSH 迁移与 buildAllowList 参数化（R10）

- Covers: AC2, AC9
- Target: core dispatch/executor-tools.ts（删常量、buildAllowList 加 nativeTools 必填入参）、core index.ts:60-63 导出删除、dsh dispatch/executor-dispatch.ts（NATIVE_TOOLS 清单常量落位与传参，顺带修 35 行 runtime='dsh' 过期注释）、core test/executor-tools.test.ts 与 dsh test/executor.test.ts:12/1187。
- Edit:

  ```text
  Input: 盘点报告第 7 节 NATIVE_TOOLS_DSH 事实（core 定义 17-33、buildAllowList 基集消费 60-72、dsh src 零消费仅测试、buildAllowList 已具 visibleNames 参数化接缝）。
  Output: executor-tools.ts 删 NATIVE_TOOLS_DSH，BuildAllowListParams 增 nativeTools: readonly string[] 必填（基集 = nativeTools ∩ visibleNames，语义不变），core index.ts 删该导出；15 名单落 dsh executor-dispatch.ts 顶部常量 NATIVE_TOOLS（唯一消费方在此组装 allow 清单），35 行过期注释修正（决定 12）；executor-tools.test 15 名钉住用例迁 dsh（改引 dsh 常量），core 侧留基集/includes/excludes 语义用例（夹具自造清单）；executor.test:1187 期望清单改引 dsh 常量。
  Preconditions: 步骤 6 完成
  Procedure: 1) core 参数化删常量删导出；2) dsh 常量落位与传参；3) 注释修正；4) 测试迁移与改造；5) 删 dist 旧产物核对。
  Failure: 漏传 nativeTools 由 typecheck（必填参数）阻断。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；`grep -rn "NATIVE_TOOLS_DSH" packages/core` 零命中（AC9 观察点）。

#### 步骤 14：派发记录扫描共享抽取（R9）

- Covers: AC2, AC8
- Target: 新建 dsh dispatch/dispatch-scan.ts；executor-guard.ts:63-100 与 executor-toolface.ts:57-93 两份重复扫描改接；相关测试整合。
- Edit:

  ```text
  Input: 决定 5 与盘点报告第 11 节第 10 条（两份独立扫描：guard 按 kind 过滤重建守卫身份、toolface 按 toolsAllow 重建工具面，目录遍历/JSON 解析/防御逻辑重复）；executor-guard 重建排除 archive 与防空集占位毒化的既有语义（executor.test 1847-1882 钉住）。
  Output: dispatch-scan.ts 导出 scanDispatchRecords(root)——遍历 <root>/.workloom/tasks/ 非归档任务 task.json，返回带任务归属的派发记录列表（坏 JSON 与缺字段防御沿现有语义，archive 排除内置）；guard 重建改为 scan 加 tryNormalizeExecutorRole 过滤 WRITE_GUARDED_ROLES 收 childId（非抛错变体，脏值跳过加 WARNING——评审 #9；空集占位语义不变）；toolface 重建改为 scan 加 toolsAllow 过滤（同款防御）；两处行为零变化仅去重。测试：既有守卫重建与 toolface 用例保持全绿，新增 scan 共享模块直测（归档排除、坏 JSON 防御、多任务聚合）。
  Preconditions: 步骤 6 完成（guard 已切角色集合）
  Procedure: 1) 抽 scan 模块；2) guard 改接；3) toolface 改接；4) 测试整合与新增。
  Failure: 语义漂移由 executor.test 既有重建用例（含防毒化用例）报红阻断；单条脏记录不抛异常中断全项目重建（tryNormalize 跳过加 WARNING）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；`cd packages/dsh-workloom && pnpm test` 全绿；AC8 重建用例（旧 kind 历史记录识别）通过。

#### 步骤 15：resolveTurnTask 直测与回退直读通道删除（R12）

- Covers: AC2
- Target: 新建 core test/session-assemble.test.ts；injection/session-context.ts（159-162 分支、254-263 activeTaskContext、111-115 注释）、injection/workflow-service.ts（143-145 与 165-168 分支、261-270 resolveActiveTaskState、94-98 注释）；测试直调点 session-context.test（28 处）、workflow-service.test（16 处）、inject.test（6 处）。
- Edit:

  ```text
  Input: 盘点报告第 3 节 resolveTurnTask 全文摘录（session-assemble.ts:30-39 三态）与回退通道精确行号、四个测试文件直调清单（turnTask 零传递事实）。
  Output: session-assemble.test.ts 三态直测（指针错误抛错、无指针返回 null、命中返回 TaskView、任务记录不可读抛错）；session-context 与 workflow-service 删回退直读实现与「兼容直连调用方」注释，缺省视同无活跃任务不再自解析；turnTask 声明类型维持现状（TaskRecordWithPath | null），dsh plugin.ts 类型面零变动（评审 #6）；resolveActiveTask 导入面随之收敛（仅剩候选任务扫描等真消费）；三个测试文件直调点按用例意图显式传 turnTask: null 或构造记录（机械补参，断言不变）。
  Preconditions: 步骤 9 完成（session-context 画像节先行，避免同文件交叉冲突）
  Procedure: 1) 写三态直测；2) 删两处回退通道与注释；3) 测试直调点补参；4) 导入面收敛核对。
  Failure: 漏改直调点由测试红阻断（缺省渲染行为变化立即暴露）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿；`cd packages/core && node --test test/session-assemble.test.ts` 全绿；`grep -rn "兼容直连调用方" packages/core/src` 零命中。

#### 步骤 16：R13 点名注释清理与残留核查

- Covers: AC10
- Target: dsh src/constants.ts:1-3 头注释、dsh cordis.patch.yml:2；核查面：executor.ts startContinuable 残留、main-model.ts:7、state-machine 拆分后旧任务编号字样残留。
- Edit:

  ```text
  Input: 盘点报告第 8 节两处点名对象原文摘录与四常量消费方全表（PLUGIN_NAME/SOURCE_PLUGIN/CONTEXT_KEY_PREFIX/DISPATCH_WARN_PREFIX 含 tooling/tasks.ts:36）、7 处新发现候选清单。
  Output: constants.ts 头注释消费方清单补 tooling/tasks.ts；cordis.patch.yml 第 2 行删「点 7-12 逐步填充」句改为插件行职责自述；决定 12 所列随文件修正项逐一核查（步骤 6/9/11/12/13 已修的确认无残留，遗漏的在本步补）；未触及文件的剩余注释候选（若有）与过期 spec 条目一并整理进任务目录 notes-stale-comments.md——spec 侧含 repo/terminology 的 executor 与 frontend executor 条目、repo/workflow 的 transport-failover 条目（旧多跳编排与 subagents.<kind>.fallback_models 配置面已过期）与 asset-version-bump 条目的过期路径（packages/assets→packages/core/resources、domain/protocol.js→injection/protocol.js），标注经 workloom-update-spec 流程更新（归子任务七，评审 #17）；供归档时登记增补记录。
  Preconditions: 步骤 5-15 完成
  Procedure: 1) 两处点名修正；2) 候选清单逐项核查；3) 剩余清单登记。
  Failure: none
  ```

- Verify: `grep -n "点 7-12" packages/dsh-workloom/cordis.patch.yml` 零命中；`grep -rn "startContinuable" packages/dsh-workloom/src` 零命中；constants.ts 头注释含 tasks.ts 字样；两包 `pnpm test` 全绿。

#### 步骤 17：resources 机械字样切换（R2 resources 段）

- Covers: AC2, AC3（resources 段）
- Target: resources/workflow/workflow.md（派发指令句；front-matter version 不提升——决定 10）、workflow-light.md:11/31、skills/workloom-alignment/references/ui-design.md:23、SKILL.md:47/49、references/plan-authoring.md:5、references/test-first.md:3/25、skills/workloom-case-active/SKILL.md:9/27-28/35/43、skills/workloom-case-archived/SKILL.md:42、skills/workloom-migrate-plan/SKILL.md:14；core test/contract-asset.test.ts 三处钉住句。
- Edit:

  ```text
  Input: 决定 10 与盘点报告第 4 节 resources 真消费点表（含 workflow.md 54/68/79/81/88/96/98-110/136/155-158 逐行摘录）、contract-asset.test 钉住三句（120-127/128-133/873）。
  Output: 按决定 10 边界机械切换——workflow.md：`kind: review`→`role: judger`（1.4 节句并补 purpose: plan-review、自动置 reviewing 与 workloom_task_planreview 标记说明）、`kind: frontend`→`role: frontend-developer`（2.1 与 2.3 两句）、`kind: check`→`role: checker`（2.2/2.3 与 breadcrumb、norms 段）、research/implement/check/review/frontend executor 角色名词切 Researcher/Developer/Checker/Judger/frontend-developer 词汇；front-matter version 与 protocol.js 的 WORKFLOW_PROTOCOL_VERSION 常量均不动（asset-version-bump 条款：契约结构未变，contract-asset.test 51/64/75/739 四处版本断言应原样保持绿——评审 #4）；旧 stage 字样（stage `implement`/`check`）不动归子任务七；workflow-light.md 否定式提及切 Checker 词汇；ui-design.md:23 门禁句切 role: frontend-developer；六个 skill 文件 executor 词汇机械切换；contract-asset.test 三处钉住句同步新措辞。
  Preconditions: 步骤 10 完成（plan-review purpose 已有代码事实，文档句不超前）
  Procedure: 1) workflow.md 字样切换（version 不动）；2) ui-design.md 与 skill 六文件；3) workflow-light.md；4) contract-asset.test 钉住更新；5) AC3 resources 段检索复核。
  Failure: contract-asset 钉住不一致报红阻断；版本断言应原样保持绿，若红说明误动了 version 或契约结构。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；两包 `pnpm test` 全绿（含 contract-asset.test 版本断言原样绿）；AC3 resources 段按决定 11 精化检索式输出命中清单，逐条对照假命中归属复核（第三方 skills、stage 字样、case-result.md 的 checkSession 字段名），清单存档任务目录（legacy-check-resources.md）。

#### 步骤 18：终验、dist 重建与单一 work commit

- Covers: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10
- Target: 全仓终态；packages/core/dist 与 packages/dsh-workloom/dist。
- Edit:

  ```text
  Input: 步骤 1-17 全部产物；prd 十条 AC；repo/commits 与 repo/deployment 规范。
  Output: 完整验证记录与单一 work commit（主会话在任务分支执行，executor 契约禁止 commit 时暂存交还）。
  Preconditions: 步骤 1-17 全部完成且各自 Verify 通过
  Procedure: 1) pnpm -r build && pnpm -r typecheck && pnpm lint（AC1）；2) 两包 pnpm test 全量（AC2，含 dist-mirror/dist-dts 守卫）；3) AC3 全仓按决定 11 精化检索式检索，src 与 resources 两份清单合并复核归档（legacy-check-final.md）；4) AC4 schema 与报错分支用例复跑；5) AC9 文件树观察（core dispatch 无 failover.js/dispatch-binding.js、task/state 与 task/storage 各含 index.ts、task/ 根无两大文件）加 wc -l 统计——拆分产物（storage 五文件、state 十文件、prompt-compose 三件套）全部低于 600 行；其余被改文件仅统计，既有超 600 行文件（task-ops.ts 934 行与测试大文件）如实登记不强制拆分（评审 #10）；6) AC10 检索复核；7) lsp_diagnostics 抽查本任务改动的主要 TS 文件；8) 确认 dist 与 src 镜像一致（构建产物新鲜、无残留删除项）；9) 主会话单一 work commit：src+test+resources+两包 dist，message 按 repo/commits 规范（feat 主 scope 加 body 分点）。
  Failure: 任何验证红则回到对应步骤修复后重跑本步，禁止带红提交。
  ```

- Verify: 上述 1-8 全部零退出码；`git show --stat` 单 commit 含两包 dist；`git status` 工作区干净（簿记文件除外，另走 chore commit）。
