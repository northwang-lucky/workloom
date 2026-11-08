---
version: 1
task: tasks/11-06-sop-roles
codeBaseline: worktree .workloom/worktree/11-06-sop-roles @ branch workloom/11-06-sop-roles（HEAD d701270，work commit 未落——工作流时序 2.3 检查先行，staged 变更面已收拢且含两包 dist 与 CASE 轮 P2 修复；codeFingerprint=1a47b6f3e0da672cb5560fc8de66dbb5ee03922c2abd729f14dd7d303e4126bc）
checkSession: 335fd2ec-6cf0-4b6d-98fb-1d9418098102
status: passed
startedAt: 2026-11-08T13:58:00+08:00
completedAt: 2026-11-08T14:48:00+08:00
---

# CASE Result: 角色体系与子会话派发

## Summary

- Static review: `15/15`
- Runtime cases: `13/13; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

执行说明：本轮按 case.md（558 行修订版）全文执行。执行中发现 4 处实现侧 P2 陈旧注释并自行修复（records.ts 两处、prompt-compose.ts 一处、executor.ts 一处，均为措辞级、零行为变更），随后按纪律全量复跑 C1/C2/C3 与标准验证（本文件全部证据为修复后终态代码的产物）；dist 已随修复同批重建并收拢进 staged 面（未 commit）。两处 case.md 措辞缺陷（C7 步骤 1、C8 步骤 5）按冻结边表与钉住语义执行并登记 Resolved Findings，未擅自改动 case.md。指纹脚本 task-fingerprint.mjs 因 staged diff 超 spawnSync maxBuffer 报 ENOBUFS，按其算法以 python 流式等价复算（case-evidence/fingerprint.log）。

## Static Review Results

### SR1 值域模块：五角色、显示名与兼容映射单点

- Status: `passed`
- Evidence: executor-roles.ts 全文核读——EXECUTOR_ROLES 冻结五键（RESEARCHER/DEVELOPER/FRONTEND_DEVELOPER/CHECKER/JUDGER，as const 加 Object.freeze，无 TS enum）；ROLE_LABELS 五显示名逐字（Researcher/Developer/Frontend Developer/Checker/Judger）；LEGACY_KIND_TO_ROLE 恰五条映射；normalizeExecutorRole 未知值抛含 ERR_PREFIX 与字面值的可判定错误；tryNormalizeExecutorRole 未知值返 null；纯常量零依赖，头注释写明单源与永久保留意图。executor-kinds.ts 不存在；EXECUTOR_KINDS/isExecutorKind/isExecutorRoleOrLegacy/KIND_LABELS/assertKind 在两包 src 与 test 零命中；core index.ts:37-44 具名重导出、全文件无 export *。（sr-batch-a.log、c11-grep.log）
- Findings: none

### SR2 工具面：workloom_execute 的 role 参数与 fail loud

- Status: `passed`
- Evidence: executor-schema.ts——role 属性 enum 取 Object.values(EXECUTOR_ROLES) 单源、required 恰 ['role','prompt','title']、additionalProperties: false（注释明示旧 kind 参数名在工具边界即拒）、purpose enum 为 CASE_PURPOSES 加 PLAN_REVIEW_PURPOSE 三值拼装；surface.ts:155 PARAM_DESCRIPTIONS.role 列五角色、157/159 model/effort 描述指 subagent_profiles[i].roles.<role>、222 buildCrossRoleReuseRejectText（旧名零命中）、TOOL_DESCRIPTIONS/SNIPPETS.executor 切 role 词汇；prompt-compose.ts:133-141 assertRole 只收新五值、错误文案列值域清单；executor.test:883「role schema 五新值 enum、无 kind 参数、required、additionalProperties 拒 kind（AC4）」通过；prompt-compose.test:340「旧 kind 值拒绝（写侧已收严）」通过。（sr-batch-c.log、c5-schema-probe.log、c5-tool-tests.log、c2-direct-tests-checklist.log）
- Findings: none

### SR3 兼容读：视图层归一与记录级直读点

- Status: `passed`
- Evidence: state/view.ts:123-131 toTaskView 对 dispatches 逐条 normalizeExecutorRole；storage/read-write.ts:165-170 normalizeDispatchRecord 只补 status 不改 kind；盘点 §10 八处直读点全部两侧归一——dispatch-records.ts:141/238/368/452-454、case-gates.ts:37（CHECK_ROLE=EXECUTOR_ROLES.CHECKER）/118（tryNormalize 后比较）、doctor-check-rules.ts:336/359、session-context.ts:365（显示前 tryNormalize）、dsh executor-capacity.ts:89/162、executor-continuation.ts:140/148/157（双侧）、executor-guard.ts:67；脏值分面语义在案（容量收集面保留计全局闸、过滤重建面不入集，注释与实现一致）；journal 无生产读取面（盘点 §10），C4 探针验证历史文件零改写。（sr-batch-b.log、c4-compat-probe.log）
- Findings: none

### SR4 配置：根层级 subagents 退役与两层解析链

- Status: `passed`
- Evidence: config-load.ts:272-277 legacySubagentsError（field 'subagents'、文案 'is no longer supported; migrate to subagent_profiles'），全局层 294-296 与项目层 316 同口径抛错；config-defaults.ts 无 subagents 字段（subagentProfiles 在位）；config.d.ts:65-71 SubagentProfile.roles 改名并注明旧字段名抛错口径；config-subagent.ts:202 条目内旧字段名抛 'rename the field to roles (subagent_profiles[i].roles.<role>)'、209-210 读 entry.roles、312 matched?.roles[role] 查表、34-56 旧角色键一次性 WARNING（进程级去重）、无 parseSubagents/legacyLayer；config.d.ts:116-119 来源联合仅 param/config 与 whenMain/fallback（无 legacy）；records.ts:148 DispatchModelSource 'legacy' 成员保留惰性；buildConflictNotice 文案 subagent_profiles.<role>（480-482）；doctor hint 无 subagents 字样；config.test:397-439 反转与并存用例、697 条目内旧字段名用例通过。（sr-batch-c/d.log、c6-config-probe.log）
- Findings: none

### SR5 session-context：执行器画像节重建与 Last dispatch 归一

- Status: `passed`
- Evidence: session-context.ts:378-413 内嵌 executorProfilesLines（无独立模块，executor-profiles 零命中）；节头两形态逐字（`Executor profiles (main model <m>):` / `Executor profiles (main model unknown; whenMain entries skipped):`）；info 行逐字 `not configured (inherits parent session model)`；节位置在 185-186 接线（Last dispatch 行后、Git 节前，session-context.test:622 线序用例通过）；config null 整节降级（401）；plugin.ts:263/272-280 loadConfig 加 readMainModel 接线（失败仅 WARNING 传 null）；main-model.ts 头注释「画像 whenMain 匹配」语义复原；Last dispatch 行 365 归一显示；inject.test:86-94 过期注释已改为画像节集成断言；session-context.test 39/39 通过（含 560/588 旧值夹具归一显示与 597 新值主用例）。（sr-batch-d.log、c6-profiles-probe.log、c6-session-context-tests.log）
- Findings: none

### SR6 planReview：派发联动与 workloom_task_planreview 工具

- Status: `passed`
- Evidence: doc-review.ts:140-199 executePlanReviewMark（phase 校验、resolveTaskRelPath 支持 taskPath 缺省、recordPlanReview 写口、返回视图投影含 planReviewRevisions）；dispatch-records.ts:365-382 purpose 按 role 分支校验（checker 收 case-design/execution、judger 只收 plan-review、其余角色拒绝）、452-456 写入分支扩 judger；executor.ts:517-536 自动置位（judger+plan-review 且 phase∈{none,revising} 置 reviewing、reviewing 幂等、clean 不动轨道仅 WARNING、失败仅 WARNING 不回滚）；tasks.ts:157-170 注册（phase enum、additionalProperties false、renderTask 投影）加 393-399 delegationDepthOf 主会话硬拒绝文案；surface.ts:26「十二个工具名」、36 第十二键、82 snippet；core index.ts:289 导出；executor.test 自动置位四观察点、tasks.test schema 与主会话限制、task-ops.test executePlanReviewMark（revising 轮数加一、reviewing→clean 落定、非法边与非法相位报错）全部通过。（sr-batch-d.log、c7-planreview-probe.log、c7-dsh-tests.log、c2-direct-tests-checklist.log）
- Findings: none

### SR7 ui-dispatch-ready 守卫：判定值切换且语义不变

- Status: `passed`
- Evidence: guards.ts:157-164——light 豁免（158）、UI_DESIGN_SECTION 解析与不适用声明词表（160-161，audit.ts 常量在位）、判定用 EXECUTOR_ROLES.FRONTEND_DEVELOPER 基于归一后 view.dispatches（162，注释明示历史旧 frontend 记录经兼容读计入）、拒绝走 FRONTEND_DISPATCH_MISSING；audit.ts 文案逐字 'no frontend-developer dispatch recorded for a task with UI requirements'；state-machine.test:890-935 新值主用例加 913-919 旧 frontend 夹具兼容用例通过；FORCEABLE_GUARD_GATES 含 ui-dispatch-ready→OVERRIDE_GATES.CHECK（262-269，force 留痕语义不变）。（sr-batch-b.log、c8-ui-gate-probe.log）
- Findings: none

### SR8 写守卫：受守卫角色集合与派发记录扫描共享实现

- Status: `passed`
- Evidence: dispatch-scan.ts:43 scanDispatchRecords（archive 排除内置 24-25、三层 try/catch 防御 49/57/63、单条脏记录不中断）；executor-guard.ts:38-41 WRITE_GUARDED_ROLES 恰 [researcher, judger]、66-67 重建改接 scan 加 tryNormalizeExecutorRole（59-60 注释明示脏值跳过加 WARNING）、106-146 confinedWriteGuard 域判定（file_path 按子会话 cwd resolve 必须落 <cwd>/.workloom/ 内，越界英文拒绝文案，bash 边界不涉及）；executor-toolface.ts:22/50 同接 scanDispatchRecords（两份重复扫描去重为一份）；executor.ts:538-540 派发登记按新集合；dispatch-scan.test 四用例与 executor.test 重建/防毒化/接线用例通过。（sr-batch-b.log、c9-write-guard-probe.log、c9-scan-grep.log）
- Findings: none

### SR9 dsh 派发链路：角色绑定全面切换

- Status: `passed`
- Evidence: executor.ts:151 ExecutorArgs.role、244-249/323/351-458 传参链全切 role、486-494 recordExecutorDispatch 写 kind 字段承载新角色值（注释明示字段名保留——决定 1）、startContinuable 零命中；local-prompts.ts:36-44 七新 target、62-74 TARGET_BY_FILE 新旧双文件名映射同一 target（决定 4）、128/149 错误文案列新清单；executor-capacity.js:28-71 契约整体 role 化（record.role/roleLimit/roleCount/layer 'role'、'<role> role at capacity' 文案、两侧 tryNormalizeExecutorRole 归一）；dsh executor-capacity.ts:111-122 LABEL_TO_ROLE/roleFromLabel 按 ROLE_LABELS 反解析；executor-injection.ts:81 EXECUTOR_ROLES.CHECKER 字面量、121 ROLE_LABELS、111 回退 workloom-<role>；discipline-text.ts:120 EXECUTOR_CONTRACT_BY_ROLE 五新键、191 ROLE_LABELS 标题，discipline-text.test ALL_ROLES 新五值；executor-continuation.ts:140-157 双侧归一。（sr-batch-e.log）
- Findings: none

### SR10 failover 迁移与单次重试一跳接线

- Status: `passed`
- Evidence: model-failover.ts 五导出齐备，MODEL_INACCESSIBLE_CODES 12 码与 HEAD 原 core failover.js 逐值一致（探针对比），文案 role 词汇无 kind；core dispatch/failover.js 不存在、core src grep failover 零命中；executor-spawn.ts 承载共享组装（SpawnExecutorChildParams/spawnExecutorChild），executor.ts:132 与 executor-settle.ts:54 单向引入、spawn 无反向导入（无环）；executor-settle.ts:155-163 trackDispatchSettle 扩展 respawn 重派上下文（parent 引用、原 prompt 全文、role、title、toolsAllow、模型绑定）、423 retryPrompt=原文加尾部 buildFailoverNote、441-442 独立 AbortController、459-471 记录写 fallbackOf=原 childId 与 fallbackAttempt=FAILOVER_FIRST_HOP=2（跳序号语义）、489-516 不重试收口附 buildFailoverNotice、钩子异步 try/catch WARNING 不回滚；core dispatch-records.ts:70-71 MIN_FALLBACK_ATTEMPT=2 校验（427-435 首跳不落字段注释）；executor.test 五观察点用例（一跳重派记录形状 fallbackAttempt=2、prompt 保留原文加尾部 note、二次失败硬挡、无链结算附文案、fallbackOf 非空不再重试）通过。（sr-batch-e.log、c10-failover-probe.log、c10-retry-tests.log、c10-attribution-grep.log）
- Findings: none

### SR11 拆分布局：task/state、task/storage 与 prompt-compose 三件套

- Status: `passed`
- Evidence: task/state/ 恰十文件、task/storage/ 恰五文件、task/ 根无 state-machine.ts 与 task-storage.ts；两 index.ts 零实现（无 function/const/let/class 定义，纯重导出）；重导出面对 HEAD 原模块权威比对：state 原 54 全在 index（54/54）、storage 原 40 全在 index 且多 1 个 PLAN_REVIEW_PURPOSE（本任务 R7 合理新增）；共享私有件 state/ 侧在 values.ts、storage/ 侧在 records.ts；入口纪律 grep（子目录内分文件被外部直引）零命中；prompt-compose 三件套 346/268/104 行；拆分产物全部低于 600（最大 storage/create.ts 451）；dist-mirror 双向差集守卫两包同场通过。（sr-batch-f/g/h.log、c11-tree.log、c11-grep.log、c11-wc.log）
- Findings: none

### SR12 core 派发模块归属与死导出清理

- Status: `passed`
- Evidence: NATIVE_TOOLS_DSH 在 packages/core 零命中；executor-tools.ts:27-51 BuildAllowListParams.nativeTools 必填（基集 = nativeTools 交 visibleNames）；dsh executor-dispatch.ts:26-42 NATIVE_TOOLS 十五名单在位、70 传参、头注释 runtime 语义已修正；core dispatch/ 仅余 executor-capacity(.d.ts).js、executor-roles.ts、executor-tools.ts（无 failover.js 与 dispatch-binding.js）；dsh dispatch-binding.ts 头注释改写为 dsh 职责自述（Pi 共用字样删除）、resolveDispatchModelSource 降模块内私有且无 legacy 代码分支（仅注释述及退役事实）、唯一导出 buildNewDispatchBinding；PARENT_MODEL_LABEL 仅 surface.ts 命中；core index.ts 旧导出段（failover/dispatch-binding/executor-kinds）零命中。（sr-batch-a/e.log、c11-grep.log、c10-attribution-grep.log）
- Findings: none

### SR13 resolveTurnTask：三态直测与回退直读通道删除

- Status: `passed`
- Evidence: session-assemble.ts 全文 39 行（三态逻辑本体未改，导入改线 state/index.ts）；session-assemble.test.ts 五用例通过（无指针 null、命中 TaskView、指针损坏抛错、记录不可读抛错、悬挂指针清理）；session-context.ts 与 workflow-service.ts 的 contextKey 与「兼容直连调用方」双零命中（回退直读通道删除，workflow-service 仅余 resolveActiveTaskStateFromRecord 消费注入记录）；测试直调点显式传 turnTask（session-context.test:117/368 turnTaskOf 正规通道构造、inject.test:252 经 resolveTurnTask）；turnTask 声明类型维持 TaskRecordWithPath | null；plugin.ts:135-143 getTurnTask 回合缓存调 resolveTurnTask（正规通道，contextKey 消费点仅存于此与 pointers 解析链）；resolveActiveTask 导入面收敛（pointers 定义、index 重导出、task-ops 真消费、session-assemble）。（sr-batch-f/g.log、c2-direct-tests-checklist.log）
- Findings: none

### SR14 注释清理：R13 点名两处与随改面

- Status: `passed`
- Evidence: constants.ts 头注释消费方清单含 tooling/tasks.ts；cordis.patch.yml「点 7-12」零命中、第 2 行改插件行职责自述；startContinuable 在 dsh src 零命中；「兼容直连调用方」零命中；config.d.ts 无退役 runtime 参数签名（91 行仅存「不支持 runtime map」的正确描述）；旧任务编号字样（机制细化归子任务五/子任务四按角色重接）零命中；executor-dispatch.ts 头注释改实际语义；main-model.ts 注释语义复原；inject.test 90 行残留修正为画像节集成断言；notes-stale-comments.md 存在（worktree 侧任务目录）且登记完整——已修正项 17 条落点表、剩余候选与过期 spec 条目（repo/terminology 两条、repo/workflow transport-failover 与 asset-version-bump）标注归子任务七。（c12-comment-grep.log、c12-notes-check.log）
- Findings: none

### SR15 resources 机械字样切换

- Status: `passed`
- Evidence: workflow.md:68 `role: judger` 加 purpose: plan-review、自动置 reviewing 与 workloom_task_planreview 标记说明（1.4 节）；81 `role: frontend-developer`（2.1）；88 `role: checker` 加 purpose: case-design（2.2）；96 continue case.designSession with `role: checker` and `purpose: execution`（2.3）；136 breadcrumb role 词汇；front-matter version: 25 未提升、protocol.js WORKFLOW_PROTOCOL_VERSION=25 不动；旧 stage 字样（79/155-156）按裁定保留归子任务七；ui-design.md:23 `role: frontend-developer`；workflow-light.md:31 Checker 词汇（11 行为泛指 executor 无旧值）；六 skill 文件抽查全切换（alignment SKILL.md:47 Researcher、plan-authoring.md:5 Developer、test-first.md:3/25 Developer、case-active SKILL.md:9/27-28/35/43 role: checker 与 Checker、case-archived:42、migrate-plan:14 researcher）；contract-asset.test 四处版本断言（51/64/75/739）原样绿、三处钉住句（125/130/873）已更新为新措辞。（sr-batch-f/g.log）
- Findings: none

## Runtime Results

### C1 构建基线

- Status: `passed`
- Executed at: `2026-11-08T14:38:00+08:00`（P2 注释修复后复跑终版；首轮 13:58 亦全绿）
- Actions:
  1. `pnpm -r build`
  2. `pnpm -r typecheck`
  3. `pnpm lint`
- Observed: 三条命令按序退出码全 0（c1-exits.txt: build:0 typecheck:0 lint:0），lint 无 error 与 warning。
- Evidence:
  - `case-evidence/c1-build.log`
  - `case-evidence/c1-typecheck.log`
  - `case-evidence/c1-lint.log`
  - `case-evidence/c1-exits.txt`
- Findings: none

### C2 两包单测全量与新增直测清单核对

- Status: `passed`
- Executed at: `2026-11-08T14:33:00+08:00`（P2 修复后复跑终版）
- Actions:
  1. `cd packages/core && pnpm test`
  2. `cd packages/dsh-workloom && pnpm test`
  3. 按六类直测清单在两包输出中逐项定位（测试名 → ✔ 通过行比对，脚本化核对）
  4. dist 镜像守卫通过行定位
- Observed: core 710/710 pass 0 fail（duration 2931ms 量级）；dsh 190/190 pass 0 fail。六类新增直测全部定位且通过（清单 0 条 FAIL）：①resolveTurnTask 三态（session-assemble.test 5 用例，含悬挂指针清理）；②兼容读映射（executor-roles.test 8 用例：五键钉住/五旧值映射/未知值报错/tryNormalize null/ROLE_LABELS 齐全）；③planReview 联动（executor.test 自动置位 5 用例 + tasks.test schema 与主会话限制 2 用例 + task-ops.test executePlanReviewMark）；④UI 门禁（state-machine.test 新值主用例与旧 frontend 夹具兼容用例）；⑤写守卫身份重建（executor.test 重建/防毒化/接线 6 用例 + dispatch-scan.test 4 用例）；⑥单次重试一跳（model-failover.test 4 用例 + executor.test「有链一跳重派——记录 fallbackOf/fallbackAttempt=2/modelSource=fallback，prompt 保留原文加尾部 note」「二次失败不再跳（fallbackOf 非空硬挡）」「无链结算 failed 附穷尽文案」）。dist-mirror 两包与 dist-dts（core）通过行在案。
- Evidence:
  - `case-evidence/c2-core-tests.log`
  - `case-evidence/c2-dsh-tests.log`
  - `case-evidence/c2-direct-tests-checklist.log`
- Findings: none

### C3 旧值零残留检索与四类归属复核

- Status: `passed`
- Executed at: `2026-11-08T14:42:00+08:00`（P2 修复后重跑终版）
- Actions:
  1. src 段（packages/core/src + packages/dsh-workloom/src）按决定 11 五条精化检索式执行（`\bresearch\b`、`\bimplement\b(?!\.jsonl)`、`\bcheck\b(?!\.jsonl)`、`\bfrontend\b(?!-developer)`、`\breview\b`）
  2. resources 段（packages/core/resources）同口径执行
  3. 命中清单逐条四类归属标注（①假命中甄别含连字符分段新词汇与 TARGET_BY_FILE 双文件名兼容；②③经负向前瞻排除确认不出现；④兼容说明注释）
  4. 真消费点复核：比较形态专项（等值比较/includes/`kind:'旧值'` 写入）+ 退役符号面专项（15 个退役符号）+ resources `kind:` 参数字样与角色名词短语专项
  5. 与实施侧 legacy-check-final.md（worktree 侧任务目录）逐文件行号级交叉核对；标注后清单存档
- Observed: src 段 39 文件 / 231 处（去重行）——与实施清单行号级一致，唯一位移 records.ts 168→169（本轮 P2 修复消除陈旧「仅 check 使用」字样，新命中为 plan-review 目的值连字符词形，类别①）；resources 段 21 文件 / 158 处——实施清单已载 14 文件/106 处行号级一致 + third-party 2 文件/4 处（其正文单列）+ 本轮独立发现 eval 夹具 5 文件/48 处（实施清单未载，归属历史夹具数据，AC3 明文允许；其中 workloom-case-active/evals/evals.json:15 含旧角色名词短语 "check executor"，登记归子任务七文档层）。比较形态专项仅 doc-review.ts:234/270 两处命中（align/case 的 action 枚举 'review'，类别①在案假命中）；includes/写入形态、退役符号面、resources kind: 参数字样全部零命中；workflow.md 旧 stage 字样命中按用户已确认裁定标注「归子任务七」。派发值域真消费点零命中。
- Evidence:
  - `case-evidence/c3-src-hits.log`
  - `case-evidence/c3-resources-hits.log`
  - `case-evidence/c3-verification.log`
  - `case-evidence/c3-attribution-review.md`
- Findings: none

### C4 兼容读映射探针

- Status: `passed`
- Executed at: `2026-11-08T14:35:00+08:00`
- Actions:
  1. node 直跑探针（隔离 HOME+TMPDIR）：临时 `.workloom` 夹具任务 dispatches 含五旧值（research/implement/check/review/frontend——frontend 无真实历史记录，夹具构造），经 readTaskView 读取
  2. normalizeExecutorRole/tryNormalizeExecutorRole 单元级断言（新值原样、五旧值映射、未知值 'bogus' 抛错含字面、try 变体返 null）
  3. 夹具 task.json 读取前后 sha256 字节比对；主检出真实归档 `.workloom/tasks/archive/2026-09/s1-core-worktree-lifecycle/task.json` 只读回放（拷贝入临时项目读取，原文件 sha256 前后比对）
- Observed: 全部 PASS——五旧值逐条归一为 researcher/developer/checker/judger/frontend-developer；未知值抛可判定错误；夹具与真实归档文件字节零变化（历史文件不改写）；真实归档 469 条派发记录（research/implement/check/review 混合）视图全部显示新值；主检出归档零写入。
- Evidence:
  - `case-evidence/c4-compat-probe.log`
  - `case-evidence/probes/c4-compat-probe.mjs`
- Cleanup: 探针脚本内已删除临时目录
- Findings: none

### C5 工具面 role 参数探针

- Status: `passed`
- Executed at: `2026-11-08T14:35:00+08:00`
- Actions:
  1. 探针读取 buildExecutorSchema(PARAM_DESCRIPTIONS) 输出形状
  2. 定向运行 `cd packages/dsh-workloom && node --test test/executor.test.ts test/case-executor.test.ts`，定位旧参数名与旧值拒绝用例
  3. 探针调用 assembleSessionContext（最小参数）核对工具说明可见性；core 侧 assertRole 拒旧值用例经 C2 日志定位（prompt-compose.test:340）
- Observed: schema 面——role 属性 enum 恰五新值、required 恰 ['role','prompt','title']、properties 无 kind、additionalProperties false、purpose enum 恰三值，全部 PASS；executor.test「参数面：role schema 五新值 enum、无 kind 参数、required=[role,prompt,title]、additionalProperties 拒 kind（AC4）」通过（113/113 全绿）；旧值运行期拒绝由 prompt-compose.test「role/effort 非法报错，undefined 放行，旧 kind 值拒绝（写侧已收严）」承载并通过；会话上下文快照观察：depth=0 快照未内嵌工具说明段（OBSERVE 记录），role 参数可见性由 DSH 注册面承载——TOOL_DESCRIPTIONS.executor 含五角色词汇与 same role only、TOOL_SNIPPETS.executor 以 workloom_execute(role, 开头、PARAM_DESCRIPTIONS.role 列五角色且 model/effort 指 subagent_profiles[i].roles.<role>，探针逐项断言通过。
- Evidence:
  - `case-evidence/c5-schema-probe.log`
  - `case-evidence/c5-context-probe.log`
  - `case-evidence/c5-tool-tests.log`
  - `case-evidence/probes/c5-toolface-probe.mjs`
- Cleanup: 探针脚本内已删除临时目录
- Findings: none

### C6 配置退役与画像节探针

- Status: `passed`
- Executed at: `2026-11-08T14:37:00+08:00`（探针修正 mainModel 传参形态后复跑；初跑崩溃系探针以 null 传入 `mainModel?: string` 类型缝外，非实现缺陷——正规通道 session-context 归一为 undefined 后调用）
- Actions:
  1. 探针构造带根层级 subagents 的项目配置调 loadConfig；另构造与 subagent_profiles 并存配置
  2. 探针构造 roles 段缺 checker 键配置调 resolveSubagentDefaults(config,'checker',{},mainModel)；roles 条目内旧五值键（implement）WARNING 捕获
  3. 探针构造条目内层旧字段名 subagents 配置调 loadConfig
  4. whenMain 命中与 mainModel 缺失（undefined）跳过回退兜底断言
  5. 探针驱动 assembleSessionContext（传 config 与 mainModel 三形态：在位/缺失/加载失败 null）核对节头与 info 行逐字文案；完整线序经 `cd packages/core && node --test test/session-context.test.ts` 定位
- Observed: 全部 PASS——根层级 subagents 抛 WorkloomConfigError（field='subagents'，文案含 no longer supported 与 migrate to subagent_profiles），并存时先报根层级退役错误；缺 checker 键 model/effort 均 undefined（继承宿主默认），有配置角色返回 model/effort 且来源 fallback；条目内旧字段名抛错且文案含 rename the field to roles；roles 内旧角色键输出一次性 WARNING（文案指向新键名）不抛错；whenMain 命中取 p/when 来源 whenMain、mainModel 缺失跳过回退 p/fb；节头两形态逐字、info 行逐字 `  checker: not configured (inherits parent session model)`、config null 整节降级不渲染；session-context.test 39/39 通过（含 622 行「节位置在 Last dispatch 后 Git 前」线序用例、660 whenMain 命中行、699 降级用例）。
- Evidence:
  - `case-evidence/c6-config-probe.log`
  - `case-evidence/c6-profiles-probe.log`
  - `case-evidence/c6-session-context-tests.log`
  - `case-evidence/probes/c6-config-probe.mjs`
- Cleanup: 探针脚本内已删除临时目录
- Findings: none

### C7 planReview 联动探针

- Status: `passed`
- Executed at: `2026-11-08T14:37:00+08:00`（探针按冻结边表修正标记序列后复跑；case.md 步骤 1「再标 clean」措辞缺 revising→reviewing 中间边，见 Resolved Findings #5）
- Actions:
  1. 探针驱动 executePlanReviewMark：初始 none 直接标 clean（非法边）、标非法相位 bogus、置 reviewing 后标 revising、revising 直接标 clean（非法边）、经 recordPlanReview 回 reviewing 后标 clean
  2. purpose 校验探针：judger+plan-review 通过且记录带 purpose、judger 无 purpose 通过且不带字段、developer+purpose 拒绝、checker+case-design 行为不变、judger+case-design 拒绝
  3. 定向运行 `cd packages/dsh-workloom && node --test test/executor.test.ts test/tasks.test.ts` 定位自动置位四观察点与主会话限制用例
- Observed: 全部 PASS——none→clean 与 revising→clean 均报 illegal plan review transition 可判定错误；bogus 相位报 invalid plan review phase；revising 轮数加一（revisions=1）；reviewing→clean 落定且轮数保留；task.json planReview 记录落盘；purpose role 分支五观察点全符（拒绝文案分别为 only valid for checker or judger 与 invalid judger purpose）；core 记录面不触碰轨道（派发记录后 phase 保持）；dsh 定向 124/124 通过——自动置位四观察点（judger+plan-review 置 reviewing、reviewing 幂等、clean 态仅 WARNING 不动轨道、无 purpose 不动轨道）与 workloom_task_planreview schema/主会话硬拒绝用例定位在案。
- Evidence:
  - `case-evidence/c7-planreview-probe.log`
  - `case-evidence/c7-dsh-tests.log`
  - `case-evidence/probes/c7-planreview-probe.mjs`
- Cleanup: 探针脚本内已删除临时目录
- Findings: none

### C8 UI 门禁探针

- Status: `passed`
- Executed at: `2026-11-08T14:35:00+08:00`
- Actions:
  1. 夹具 standard 任务（PRD 含实质 UI Design 内容、implementing、无前端派发）经 evaluateGuard('ui-dispatch-ready') 求值
  2. 经 recordExecutorDispatch 正规通道补 frontend-developer 派发后复求值
  3. 旧 frontend 历史记录夹具（直写 task.json，全仓零条真实 frontend 历史）经兼容读求值
  4. light 任务同夹具求值；不适用声明（中英词表）、空正文、prd 缺失口径求值
  5. force 越权：CASE 轨道推 approved 后 migrateTask 迁 checking——无 force 拒绝、force+reason 放行、overrides 留痕与视图 stage 核对
- Observed: 全部 PASS——拒绝理由逐字 'no frontend-developer dispatch recorded for a task with UI requirements'；补派发后放行；旧 frontend 夹具经兼容读放行（视图归一为 frontend-developer）；light 豁免放行；中英不适用声明放行、prd 缺失放行；空正文仍拦截（空正文不是声明——子任务三钉住口径不变，与 state-machine.test 969-975 一致；case.md 步骤 5「或空正文时门禁不拦」措辞与钉住语义不符，见 Resolved Findings #6）；无 force 迁移被拒且错误含前端派发缺失文案，force+reason 放行且 overrides 落 {gate:'check', tool:'workloom_task_check', reason:'ui not applicable (C8 probe)'}，迁移后视图 stage=checking。
- Evidence:
  - `case-evidence/c8-ui-gate-probe.log`
  - `case-evidence/probes/c8-ui-gate-probe.mjs`
- Cleanup: 探针脚本内已删除临时目录
- Findings: none

### C9 写守卫身份与重建探针

- Status: `passed`
- Executed at: `2026-11-08T14:37:00+08:00`（探针改用 state 参数变体 registerWriteGuardChild 后复跑；初跑 FAIL 系探针将模块单例注册函数与自构 state 混用，非实现缺陷——生产接线经 pluginGuardState 单例一致，executor.test 派发登记用例覆盖）
- Actions:
  1. 临时项目构造历史派发夹具（旧 kind research/review、脏值 bogus、非守卫 implement、新值 researcher 五条记录 + 坏 JSON 任务 + 归档任务）
  2. scanDispatchRecords 聚合/归档排除/防御断言；rebuildWriteGuardChildIds 重建集合断言（console.warn 捕获脏值 WARNING）
  3. confinedWriteGuard 判定：旧 research/review 身份写 <cwd>/.workloom/ 外拒绝、域内放行、非受守卫身份放行、bash 工具不判定；registerWriteGuardChild 登记面；空项目懒重建空集不误拒
  4. `grep -rn scanDispatchRecords packages/dsh-workloom/src` 核对单实现两处改接
- Observed: 全部 PASS——WRITE_GUARDED_ROLES 恰 [researcher, judger]；扫描聚合 t1 五条、归档 c-arch 不入、坏 JSON 任务防御跳过不中断；重建集合含旧 research(c-r)/review(c-j) 与新值 researcher(c-n)、脏值 c-x 跳过并输出 WARNING、implement(c-i) 不入；懒重建路径（模拟 dsh 重启，state 未登记首判触发）下旧身份越界 write 拒绝（文案含 denied 与 allowed <cwd>/.workloom/ 域）、域内路径放行、developer 语义身份放行、bash 不判定；登记面越界拒绝；空项目不误拒；guard 与 toolface 两处均接 scanDispatchRecords（grep 定位）。
- Evidence:
  - `case-evidence/c9-write-guard-probe.log`
  - `case-evidence/c9-scan-grep.log`
  - `case-evidence/probes/c9-write-guard-probe.mjs`
- Cleanup: 探针脚本内已删除临时目录
- Findings: none

### C10 单次重试一跳探针

- Status: `passed`
- Executed at: `2026-11-08T14:35:00+08:00`
- Actions:
  1. 探针驱动 model-failover 纯函数面：白名单 12 码集合断言并与 `git show HEAD:packages/core/src/dispatch/failover.js` 原白名单逐值比对；isModelInaccessibleCode/extractFailureCode 边界；buildFailoverNote/buildFailoverNotice 三分支文案（role 词汇、无 kind 字样）
  2. 定向运行 `cd packages/dsh-workloom && node --test test/model-failover.test.ts test/executor.test.ts` 定位重试接线五观察点
  3. 归属复核：core src failover 零命中、failover.js 不存在、dsh 新模块在位、executor-spawn 单向引入（import 面无 executor.ts/executor-settle.ts）
- Observed: 全部 PASS——白名单恰 12 码且与 HEAD 原 failover.js 逐值一致；判定与提取边界符合（非 string/空白名单外一律 false/null）；note 含死模型、错误码、半成品风险与续用轮增量丢失说明，notice 三分支（一跳 attempt 2 of 3、穷尽 exhausted、阻断 skipped+blockedReason）均含 role 词汇无 kind；定向 115/115 通过，五观察点用例定位在案（一跳重派记录 fallbackOf/fallbackAttempt=2/modelSource=fallback、重派 prompt 保留原文加尾部 note、二次失败 fallbackOf 非空硬挡、无链结算附穷尽文案、阻断分支）；core failover 零残留、单向引入无环。
- Evidence:
  - `case-evidence/c10-failover-probe.log`
  - `case-evidence/c10-retry-tests.log`
  - `case-evidence/c10-attribution-grep.log`
  - `case-evidence/probes/c10-failover-probe.mjs`
- Cleanup: none（纯函数探针无临时目录）
- Findings: none

### C11 模块归属与拆分形态观察

- Status: `passed`
- Executed at: `2026-11-08T14:12:00+08:00`
- Actions:
  1. `ls` core dispatch/、task/ 根、task/state/、task/storage/、dsh dispatch/
  2. `grep -rn NATIVE_TOOLS_DSH packages/core`；`grep -rnE "EXECUTOR_KINDS|isExecutorRoleOrLegacy" 两包 src`
  3. `wc -l` 拆分产物 18 文件与其余被改文件统计登记
  4. 入口纪律 grep（子目录内 13 个分文件被 `.../state|storage/<file>.ts` 形态直引）
  5. dsh 新模块存在性与 PARENT_MODEL_LABEL 归属核对
- Observed: 全部通过——core dispatch/ 仅 executor-capacity(.d.ts).js、executor-roles.ts、executor-tools.ts（无 failover.js/dispatch-binding.js/executor-kinds.ts）；task/ 根无 state-machine.ts 与 task-storage.ts；state/ 恰十文件、storage/ 恰五文件且各含 index.ts；两条 grep 零命中（exit=1）；拆分产物 18 文件全部低于 600 行（最大 create.ts 451；合计 3661 行），其余被改文件仅 task-ops.ts 934 行超 600（既有债务，如实登记不强制拆分——plan 评审 #10 口径），executor.ts 556、config-subagent.ts 519 均在限内；入口纪律 grep 全仓零命中（外部与同级文件只经 index.ts 入口，子目录内部经 './x.ts' 相对互引不构成违规形态）；dsh dispatch/ 含 model-failover.ts、dispatch-binding.ts、executor-spawn.ts、dispatch-scan.ts；PARENT_MODEL_LABEL 仅 surface.ts。
- Evidence:
  - `case-evidence/c11-tree.log`
  - `case-evidence/c11-grep.log`
  - `case-evidence/c11-wc.log`
- Cleanup: none
- Findings: none

### C12 注释清理复核

- Status: `passed`
- Executed at: `2026-11-08T14:14:00+08:00`
- Actions:
  1. `grep -n "点 7-12" packages/dsh-workloom/cordis.patch.yml` 并读取 1-5 行
  2. `grep -rn startContinuable packages/dsh-workloom/src`；`grep -n tasks.ts constants.ts 头注释`
  3. `grep -rn 兼容直连调用方 packages/core/src`；读取 config.d.ts resolveSubagentDefaults/detectExecutorConflicts 声明段
  4. `grep -rn "机制细化归子任务五\|子任务四按角色重接" packages/core/src`
  5. 人工复核 constants.ts/cordis.patch.yml/main-model.ts/executor-dispatch.ts/dispatch-binding.ts 新注释与实况一致性；notes-stale-comments.md 存在性与登记完整性核对
- Observed: 全部通过——「点 7-12」零命中且第 2 行为插件行职责自述；startContinuable 零命中；constants.ts 头注释含 tooling/tasks.ts（并含 executor-settle.ts 实际消费面）；「兼容直连调用方」零命中；config.d.ts 签名无 runtime 参数（91 行仅存正确描述「仅 string，不支持 runtime map」）；旧任务编号字样零命中；新注释人工复核与实况一致（main-model 画像 whenMain 语义、executor-dispatch NATIVE_TOOLS 语义、dispatch-binding dsh 职责自述且 Pi 共用字样删除）；notes-stale-comments.md 在 worktree 侧任务目录（.workloom/tasks/11-06-sop-roles/，已入 staged 面），已修正项 17 条落点表与剩余候选/过期 spec 条目（repo/terminology 两条、repo/workflow transport-failover 与 asset-version-bump）登记完整、标注归子任务七。
- Evidence:
  - `case-evidence/c12-comment-grep.log`
  - `case-evidence/c12-notes-check.log`
- Cleanup: none
- Findings: none

### C13 仓库标准验证与 dist 新鲜度

- Status: `passed`
- Executed at: `2026-11-08T14:44:00+08:00`（P2 修复与 dist 重建收拢后的收尾复跑）
- Actions:
  1. `pnpm lint`
  2. `pnpm -r build`
  3. `pnpm -r typecheck`
  4. `cd packages/core && pnpm test`
  5. `cd packages/dsh-workloom && pnpm test`
  6. `git status --porcelain packages/core/dist packages/dsh-workloom/dist`
  7. `git show --stat HEAD`
- Observed: 步骤 1-5 退出码全 0（lint:0 build:0 typecheck:0 core-test:0 dsh-test:0），core 710/710、dsh 190/190，含 dist-mirror/dist-dts 守卫与六类新增直测（与 C2 同口径，收尾复跑零漂移）。步骤 6：dist 面 176 个路径全部为 staged 状态（首列 A/M/D）、未暂存修改 0 条——work commit 未落属预期状态（Preconditions 容忍条款生效，主会话已声明 2.3 检查先行、2.4 提交在后），dist 与 src 同批新鲜（P2 修复后已重建并 add）。步骤 7：HEAD 为 d701270（规划工件 chore commit），work commit 待主会话按步骤 18 落（staged 面含 src、test、resources 与两包 dist）。
- Evidence:
  - `case-evidence/c13-lint.log`
  - `case-evidence/c13-build.log`
  - `case-evidence/c13-typecheck.log`
  - `case-evidence/c13-core-tests.log`
  - `case-evidence/c13-dsh-tests.log`
  - `case-evidence/c13-dist-status.log`
  - `case-evidence/c13-commit-stat.log`
  - `case-evidence/c13-summary.log`
- Cleanup: none
- Findings: none

## Coverage

- Status: `generated`
- Tool: `Node.js v24.18.1 内置测试覆盖率（node --test --experimental-test-coverage）与原生 lcov reporter`
- Command: `按 case.md Coverage 节 Aggregate command 逐字执行（两包各一轮 coverage 模式全量测试，--test-coverage-include 覆盖 src/** 与 dist/**，lcov 写入 <task>/coverage/；聚合时 SF:dist 映射回 src、同名源文件取 src 记录避免双计）；两轮执行本身即全量套件复跑：core 710/710、dsh 190/190，0 fail`
- Overall lines: `17256/18145 (95.10%)`
- Raw reports:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

### Changed Files

变更面与归属核对：staged 变更路径（.workloom 簿记除外）逐一对照 Scope 与 Exclusions，归属缺口 0；已删除文件（state-machine.ts、task-storage.ts、executor-kinds.ts、core 侧 failover.js 与 dispatch-binding.js、迁出的两份 core 测试）非现存文件不入表。下表为 Scope 中全部 14 个现存变更文件。

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/dispatch/executor-roles.ts` | `99/99` | `100.0%` | `-` | `coverage/core.lcov.info` |
| `packages/core/src/dispatch/executor-tools.ts` | `81/81` | `100.0%` | `-` | `coverage/core.lcov.info` |
| `packages/core/src/task/state/index.ts` | `65/65` | `100.0%` | `-` | `coverage/core.lcov.info` |
| `packages/core/src/task/state/view.ts` | `251/251` | `100.0%` | `-` | `coverage/core.lcov.info` |
| `packages/core/src/task/state/guards.ts` | `282/284` | `99.3%` | `281-282` | `coverage/core.lcov.info` |
| `packages/core/src/task/doc-review.ts` | `461/477` | `96.6%` | `244-245, 266-267, 324-325, 339-340, 362-363, 413-414, 452-453, 465-466` | `coverage/core.lcov.info` |
| `packages/core/src/workspace/config-load.ts` | `387/394` | `98.2%` | `134-135, 162-166` | `coverage/core.lcov.info` |
| `packages/core/src/injection/session-context.ts` | `469/478` | `98.1%` | `154-155, 224-225, 274-275, 475-477` | `coverage/core.lcov.info` |
| `packages/core/src/injection/session-assemble.ts` | `39/39` | `100.0%` | `-` | `coverage/core.lcov.info` |
| `packages/dsh-workloom/src/dispatch/executor-schema.ts` | `77/77` | `100.0%` | `-` | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/dispatch/dispatch-scan.ts` | `75/75` | `100.0%` | `-` | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/dispatch/executor.ts` | `535/556` | `96.2%` | `213-214, 217-220, 223-226, 264-265, 297-298, 473-477, 533-534` | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/dispatch/executor-settle.ts` | `529/562` | `94.1%` | `197-199, 207-208, 211-213, 313, 317, 321, 381, 445-458, 474-475, 484-485, 528-529, 561` | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/constants.ts` | `17/17` | `100.0%` | `-` | `coverage/dsh-workloom.lcov.info` |

未覆盖行说明：guards.ts 281-282 为未知守卫键防御分支；doc-review.ts 八处为编排入口的 catch/异常元组分支；config-load.ts 为 YAML 层发现的部分防御分支；session-context.ts 为 git 信息读取失败降级分支；executor.ts 213-226 为无 agent/无 cwd/无 .workloom 的 fail loud 早退分支、473-477 为派发启动失败撤销分支；executor-settle.ts 为结算钩子的异常降级与重派失败收口分支（WARNING 不回滚语义，主干五观察点由 C10 定向用例覆盖）。均为防御/降级路径，无行为语义缺口。

### Exclusions

与 case.md Coverage.Exclusions 逐条同路径同原因（51 条）：

| Path | Reason |
| --- | --- |
| `packages/core/resources/` | `静态资源（workflow 与 skill 机械字样切换、模板），无可执行行；contract-asset 钉住用例与 packages-scan 脚本测试由 C2 与 C13 验证` |
| `packages/core/test/` | `测试探针自身（含新增 executor-roles、session-assemble 与状态机兼容双值用例），C2 与 C13 验全绿` |
| `packages/dsh-workloom/test/` | `测试探针自身（含迁入的 model-failover、dispatch-binding 用例与重试接线、planreview 工具用例），C2 与 C13 验全绿` |
| `packages/core/dist/` | `构建产物，C13 验 build 后新鲜度与 src 同 commit` |
| `packages/dsh-workloom/dist/` | `构建产物，C13 验 build 后新鲜度与 src 同 commit` |
| `**/*.d.ts` | `类型声明面（config.d.ts 修正含 SubagentProfile.roles 改名、executor-capacity.d.ts role 化、worktree.d.ts 类型导入改线），无运行时行，声明与实现一致由 SR14 与 C1 的 typecheck 验证` |
| `**/*.js.map` | `构建映射产物，无运行时行` |
| `packages/dsh-workloom/cordis.patch.yml` | `patch 描述 YAML，无可执行行；字样核对归 SR14 与 C12` |
| `packages/core/src/index.ts` | `导出面改线（删旧模块导出段、增 executor-roles 具名重导出），导出面由 C11 的 grep 与两包 build 验证` |
| `packages/core/src/task/dispatch-records.ts` | `purpose 按 role 分支校验与写侧收严（SR6 检查面），行为由 C7 探针与全量用例验证` |
| `packages/core/src/task/case-gates.ts` | `CASE 执行链回溯判定改引 EXECUTOR_ROLES.checker 并归一，语义不变；C2 全量用例验证` |
| `packages/core/src/task/task-ops.ts` | `导入改线（executePlanReviewMark 落 doc-review.ts，本文件不新增编排），无行为变更` |
| `packages/core/src/task/case-scope.ts` | `类型导入改线，无行为变更` |
| `packages/core/src/task/state/values.ts` | `拆分搬移段（值域枚举与兼容判定集合），C11 验形态、C2 验全量` |
| `packages/core/src/task/state/transitions.ts` | `拆分搬移段（迁移表与守卫键），子任务三定形语义不变` |
| `packages/core/src/task/state/audit.ts` | `拆分搬移段与 UI 门禁文案切换（FRONTEND_DISPATCH_MISSING），文案由 C8 逐字验证` |
| `packages/core/src/task/state/migrate.ts` | `拆分搬移段（迁移执行入口），语义零变化` |
| `packages/core/src/task/state/tracks.ts` | `拆分搬移段（CASE 与 planReview 轨道写入口），recordPlanReview 行为由 C7 验证` |
| `packages/core/src/task/state/confirm.ts` | `拆分搬移段（确认迁移），语义零变化` |
| `packages/core/src/task/state/pointers.ts` | `拆分搬移段（会话指针），语义零变化` |
| `packages/core/src/task/storage/index.ts` | `零实现重导出壳（storage 唯一对外入口），重导出面与形态由 C11 验证` |
| `packages/core/src/task/storage/records.ts` | `拆分搬移段（记录类型定义）与 state 入口 type-only 改线，无运行时行为` |
| `packages/core/src/task/storage/read-write.ts` | `拆分搬移段（读写序列化，规范化层不改写历史值），C2 全量与 C4 零改写验证` |
| `packages/core/src/task/storage/create.ts` | `拆分搬移段（slug 与创建校验），语义零变化` |
| `packages/core/src/task/storage/list-archive.ts` | `拆分搬移段（hooks、列举与归档），语义零变化` |
| `packages/core/src/injection/prompt-compose.ts` | `拆分入口（role 判定切换与 assertRole 收严），行为由 C5 探针与 prompt-compose 用例验证` |
| `packages/core/src/injection/prompt-sections.ts` | `拆分搬移段（注入段函数），语义零变化` |
| `packages/core/src/injection/prompt-io.ts` | `拆分搬移段（预算与文件工具），语义零变化` |
| `packages/core/src/injection/local-prompts.ts` | `target 值域切换与新旧双文件名兼容映射（决定 4），C3 按兼容类归属复核、local-prompts 用例验证` |
| `packages/core/src/injection/surface.ts` | `注册面文案、第十二工具键与 PARENT_MODEL_LABEL 收编（SR6 与 SR12 检查面），C5 与 C2 的 surface 用例验证` |
| `packages/core/src/injection/workflow-service.ts` | `回退直读通道删除（SR13 检查面），C13 全量套件回归` |
| `packages/core/src/dispatch/executor-capacity.js` | `入参改名与契约整体 role 化（模块内部形状 record.role/roleLimit/roleCount/layer 'role'，SR9 检查面），C2 的 capacity 用例验证` |
| `packages/core/src/workspace/config-subagent.ts` | `resolveSubagentDefaults 链收敛、内层字段 subagents→roles 改名与旧角色键 WARNING（SR4 检查面），C6 探针直接验证` |
| `packages/core/src/workspace/config-defaults.ts` | `DEFAULT_CONFIG 与类型面同步删除，C6 与 C2 的 config 用例验证` |
| `packages/core/src/workspace/doctor-check-rules.ts` | `两处判定点切换与 hint 文案，C2 的 doctor 用例与 C3 归属复核` |
| `packages/core/src/workspace/doctor-types.ts` | `type-only 类型导入改线（task-storage/state-machine 拆分的涟漪点，盘点报告第 2 节消费方清单在案），无行为变更，由 C1 typecheck 与 C2 全量套件验证` |
| `packages/core/src/workspace/worktree-integrate.ts` | `type-only 类型导入改线（task-storage/state-machine 拆分的涟漪点，盘点报告第 2 节消费方清单在案），无行为变更，由 C1 typecheck 与 C2 全量套件验证` |
| `packages/core/src/workspace/worktree-lifecycle.ts` | `type-only 类型导入改线（task-storage/state-machine 拆分的涟漪点，盘点报告第 2 节消费方清单在案），无行为变更，由 C1 typecheck 与 C2 全量套件验证` |
| `packages/dsh-workloom/src/dispatch/model-failover.ts` | `错误码分类与文案纯函数迁移模块（SR10 检查面），C10 探针与迁入用例验证` |
| `packages/dsh-workloom/src/dispatch/executor-spawn.ts` | `派发组装共享抽取（原新派发路径行为不变），C10 的重派用例验证` |
| `packages/dsh-workloom/src/dispatch/dispatch-binding.ts` | `迁移模块（resolveDispatchModelSource 降级私有并删 legacy 分支），C2 的迁入 dispatch-binding 用例验证` |
| `packages/dsh-workloom/src/dispatch/executor-guard.ts` | `WRITE_GUARDED_ROLES 切换与重建归一（SR8 检查面），C9 探针直接验证` |
| `packages/dsh-workloom/src/dispatch/executor-toolface.ts` | `重建改接共享扫描，行为零变化，C9 与既有 toolface 用例验证` |
| `packages/dsh-workloom/src/dispatch/executor-capacity.ts` | `LABEL_TO_ROLE 与标签反解析切换（SR9 检查面），C2 的容量与 label 用例验证` |
| `packages/dsh-workloom/src/dispatch/executor-continuation.ts` | `同角色校验双侧归一与拒绝文案接线，C2 的跨角色续用拒绝用例验证` |
| `packages/dsh-workloom/src/dispatch/executor-injection.ts` | `标签源切换 ROLE_LABELS 与 checker 字面量改线，C2 的五角色 label 用例验证` |
| `packages/dsh-workloom/src/dispatch/discipline-text.ts` | `EXECUTOR_CONTRACT_BY_ROLE 五键文案切换，C2 的 discipline-text 用例验证` |
| `packages/dsh-workloom/src/dispatch/executor-dispatch.ts` | `NATIVE_TOOLS 十五名单常量落位与 35 行注释修正（SR12 检查面），C11 的 grep 与 C2 验证` |
| `packages/dsh-workloom/src/dispatch/main-model.ts` | `头注释语义复原核对，无行为变更` |
| `packages/dsh-workloom/src/tooling/tasks.ts` | `workloom_task_planreview 注册与主会话限制（SR6 检查面），C7 探针与 tasks 用例验证` |
| `packages/dsh-workloom/src/plugin.ts` | `config 与 mainModel 注入接线恢复及 resolveTurnTask 的 contextKey 调用点同步（SR5 与 SR13 检查面），C6 的画像节直出验证` |

### Collection Failure

none

## Standard Verification

时序纪律满足：typecheck 与 dsh 测试均排在 build 之后；下表为 C13 收尾复跑实录（P2 修复与 dist 重建后终态）。

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | `0` | `case-evidence/c13-build.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/c13-typecheck.log` |
| `pnpm lint` | `0` | `case-evidence/c13-lint.log` |
| `cd packages/core && pnpm test` | `0` | `case-evidence/c13-core-tests.log`（710/710 pass、0 fail，含 dist-mirror 与 dist-dts 守卫用例） |
| `cd packages/dsh-workloom && pnpm test` | `0` | `case-evidence/c13-dsh-tests.log`（190/190 pass、0 fail，含 dist-mirror 守卫用例） |

新增直测清单六类全部定位且通过（C2 步骤 3 核对，`case-evidence/c2-direct-tests-checklist.log` 0 条 FAIL）：resolveTurnTask 三态、兼容读映射、planReview 联动、UI 门禁、写守卫身份重建、单次重试一跳（fallbackAttempt=2 记录形状在测试名中显式钉住）。

## Resolved Findings

- `packages/core/src/task/storage/records.ts:168` [P2] DispatchRecord.purpose 字段注释陈旧（「仅 check 使用」；实际 checker 与 judger 双角色落 purpose，judger 收 plan-review，紧邻的 DispatchPurpose 类型注释已更新而字段注释漏改） — fixed: 改为按 role 分支描述（checker 收 case-design/execution 缺省 execution、judger 收 plan-review、其余角色不写），行数保持不变，dist 同批重建并收拢 staged
- `packages/core/src/task/storage/records.ts:172` [P2] childId 字段注释「同 kind 校验」陈旧词汇（现为同角色校验） — fixed: 改「同角色校验」
- `packages/core/src/injection/prompt-compose.ts:193` [P2] buildExecutorPrompt JSDoc「段落按 kind 白名单排序」陈旧词汇 — fixed: 改「段落按角色白名单排序」
- `packages/dsh-workloom/src/dispatch/executor.ts:357` [P2] 续用分支注释「无同 kind 记录 / 跨 kind」陈旧词汇 — fixed: 改「无同角色记录 / 跨角色」
- `.workloom/tasks/11-06-sop-roles/case.md:322` [P2] C7 步骤 1「再标 clean」流程缺 revising→reviewing 中间边——子任务三冻结边表中 clean 仅可从 reviewing 到达，实现拒绝 revising→clean 为正确行为（task-ops.test 正规序列佐证） — fixed: 探针按合法边序列执行并增补 revising→clean 非法边拒绝观察点（观察面强于原设计）；case.md 本文未擅自改动，措辞修订提请主会话复核
- `.workloom/tasks/11-06-sop-roles/case.md:342` [P2] C8 步骤 5「或空正文时门禁不拦」与子任务三钉住语义不符——空正文不是不适用声明、仍拦截（state-machine.test:969-975 既有钉住，本任务语义不变；SR7 检查 3「空正文口径保持子任务三形态」表述无误） — fixed: 探针按钉住语义断言（空正文仍拦截）并如实记录；case.md 措辞修订提请主会话复核
- 探针侧三处自纠（非实现缺陷，已在对应 C 条目 Executed at 注明）：c6 以 null 传 mainModel 类型缝外崩溃改传 undefined；c7 标记序列改合法边序；c9 混用模块单例注册函数与自构 state 改用 registerWriteGuardChild(state,…) 变体

## Open issues

- none
