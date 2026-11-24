> 注入标记：tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init:mwug6vb1a0iflm49 。冲突声明（仅此一次）：会话注入的 always-on Executor 规范要求 test-first 实现并验证，与 Judger 执行器契约「只评审 plan、不改代码」冲突，以契约为准，本轮只审计 plan.md；全局「阅读所有 AGENTS.md」与契约「不重新发现仓库」冲突，仅读已注入的根 AGENTS.md 与按需指针 spec。

# plan-review.md — S2 派发注入纯指针化与 CASE 模板 init 写入

## Round 1（2026-11-24，Judger，plan.md 200 行版）

评审对象：[plan.md](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md)。对照 [prd.md](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/prd.md) 与真实代码逐项核查。方法：read 核对锚点行号与现状片段，grep 枚举符号使用方与测试 pin，git 核对分支与命令可行性。未改任何 plan/prd/代码文件。

### 一、已核实通过项

1. 锚点真实性（文件 + 符号 + 行号存在且唯一，现状与 Input 描述一致）：
   - Step 1：[spec-templates.ts:52-88](packages/core/src/workspace/spec-templates.ts#L52-L88) ensureSpecTemplates 形态（[err, {root, created}] 元组、findWorkloomRoot 定位、L80 已存在不覆盖）与 Input 一致；[resources-manifest.ts:30-96](packages/core/src/resources-manifest.ts#L30-L96) TEMPLATE_CASE_ENTRY/TEMPLATE_CASE_RESULT_ENTRY/loadCaseTemplateText/loadCaseResultTemplateText 均在，core index.ts L250-262 已导出；新文件 case-templates.ts 无命名冲突（测试文件名冲突见 P2-2）。
   - Step 2：[commands.ts:116-131](packages/dsh-workloom/src/tooling/commands.ts#L116-L131) ensureTemplates 行号精确，warn-only 口径属实；handleInit L105 成功后调用，调用链描述一致。
   - Step 3：[prompt-sections.ts](packages/core/src/injection/prompt-sections.ts) inlineCurrentCase L73、inlineCaseTemplates L103、inlinePrdArtifact L148、extractPrdContent L172、splitH2Sections L199、PRD_FULL_SECTIONS L54，全部精确唯一。
   - Step 4：[prompt-compose.ts:214-306](packages/core/src/injection/prompt-compose.ts#L214-L306) buildInternal 范围精确；inlinePrdArtifact 分支 L239-245、inlineCurrentCase/inlineCaseTemplates 调用 L248-249、developer/frontend 软指针 L270-276 均与 Input 一致；BuildExecutorPromptParams.caseTemplates 现型 {path,content}[]（L166-167）。
   - Step 5：[executor-injection.ts:42-48](packages/dsh-workloom/src/dispatch/executor-injection.ts#L42-L48) caseTemplates() 与 L62-87 buildFullInjection 行号精确；injectionStats L98-107 投影 filesInlined/filesPointed 属实。
   - Step 6：[doctor-types.ts:18-23](packages/core/src/workspace/doctor-types.ts#L18-L23) DoctorIssueCode 五值精确；CHECK_META L103-113（L112 config 条目）属实；doctor-checks.ts L67 是 checkConfig 调用点（定义位置见 P2-1）。
   - Step 7：[discipline-text.ts:120-175](packages/dsh-workloom/src/dispatch/discipline-text.ts#L120-L175) EXECUTOR_CONTRACT_BY_ROLE 范围精确；INJECTION_PROTOCOL_DISCIPLINE L80-83 只强制读 plan，Input 描述属实。
   - Step 8：[workflow.md:160](packages/core/resources/workflow/workflow.md#L160) Dispatch norm 全文携带句与 Input 引文逐字一致；front-matter version 25、states 四值属实。2.2/2.3 行号与现状描述有误，见 P1-3。
   - Step 11：task-diff-coverage.mjs 已存在（S1 产物），用法 `<worktree> <baseRef> <report...> [--exclude...]`、baseRef '-' 工作区口径与 plan 描述一致；当前分支 main 且 main 存在，Step 8 的 `git diff main` 命令可行。
2. Edit 五字段齐全且顺序正确（11 个 Step 全部 Input/Output/Preconditions/Procedure/Failure）；Procedure 均为行为边界伪代码，无完整 after-code，无未锚定指令（例外见 P1-2/P1-3）。
3. AC 覆盖：AC1（Steps 3/4/5/7/10）、AC2（Steps 1/2/4/6/10）、AC3（Steps 8/10）、AC4（Steps 10/11）均被 Covers 覆盖；R1–R5 全部落到步骤。prd 的 R/AC 编号与验证方法齐全，无格式缺口。Step 9 的 Covers 标错，见 P2-8。
4. 设计决策核实：
   - 纯指针 + 必读由纪律承载，与 prd Alignment 一致；Q1=A 只读守卫、不自动补落，与 task.json alignment.summary 记录一致。
   - ensureCaseTemplates 内容比对刷新刻意不同于 spec-templates「已存在不覆盖」，与 prd Assumptions 一致（spec-templates.ts L80 existsSync 跳过属实）。
   - 模板副本路径 .workloom/templates/ 避开 spec 索引收集器成立：[spec-index.js:22-51](packages/core/src/injection/spec-index.js#L22-L51) 收集根固定 .workloom/spec，templates/ 在收集根之外。
   - extractPrdContent/splitH2Sections/PRD_FULL_SECTIONS 使用方 grep：仅 prompt-sections.ts 内部与 dist .d.ts 镜像；core index.ts 未导出（只导出 prompt-compose 面），src/test 无其他使用方，删除安全。inlinePrdArtifact/inlineCurrentCase/inlineCaseTemplates 使用方仅 prompt-compose.ts。
   - asset-version-bump 合规：Step 8 仅改 guidance，states/step/version 不升，符合 [workflow spec L8](.workloom/spec/repo/workflow/index.md#L8)。
   - executor-voice 合规：纪律文本在 dsh、文本与测试同改（[architecture spec L8](.workloom/spec/repo/architecture/index.md#L8)，Steps 7/10）；语言分工合规（纪律/workflow/spec 条目英文）。
   - dist 同 commit 与部署纪律合规（[deployment spec L6-8](.workloom/spec/repo/deployment/index.md#L6-L8)，Step 11）。
   - failover/reinject 路径核实：buildFullInjection 仅 executor.ts L414（新派发）/L459（reinject）两处调用，failover 走同一组装，无额外调用点改动；buildExecutorIncrementalPrompt（prompt-compose.ts L315-325）只追加 userPrompt，天然满足「续接只追加新指令」。
   - workflow-light.md 无 CASE/模板全文携带句（grep 确认），无需同步；light 门禁豁免语义不受影响。
   - contract-asset 现有 pin 为子串级：L888 pin「CASE readiness gates execution」前缀、L861-892 pin 2.2/2.3 特定句，均未逐字 pin L160 全文携带句；新句 pin 属新增，保留前缀与既 pin 子串即可通过（约束已并入 P1-3 修正建议）。
   - receipt 渲染面：executor.test.ts L587 等已 pin「0 inlined」（developer 夹具），L3413 inlined:1 为合成渲染夹具，无需改；filesInlined 字段保留恒 0，receipt 格式不变。
   - 注入层读 core resources-manifest 有先例（workspace/init.ts L24），守卫在 core 内读插件模板符合分层。

### 二、P0（阻塞，按文执行必失败或违反验收）

- 无。

### 三、P1（重要，可行性风险或明显更优方案未采用）

#### P1-1 Step 2 Verify 锚定错包：core init.test.ts 观察不到 dsh ensureTemplates 的写入行为

- plan 锚点：[plan.md:46](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L46)（Verify: init.test.ts）、[plan.md:170](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L170)（Step 10 Target 含 init.test.ts）。
- 事实链：ensureTemplates 是 dsh commands.ts 私有函数（L116-131），仅 handleInit L105 调用；core/test/init.test.ts 十个用例全部测 executeInitCommand 骨架行为（L48-201），core/workspace/init.ts 不调用任何模板写入函数（grep 无 template）；dsh commands.test.ts 现只测 relay 文案与幂等回执（L106-156），无磁盘写入校验。
- 后果：按文跑 core init.test.ts 无法观察 .workloom/templates/ 两副本，AC2「init 写入副本且重跑刷新」的验证落空。
- 修正建议：Step 2 Verify 改 dsh commands.test.ts（调 init handler 两次，校验副本存在、重跑内容比对刷新）；Step 10 Target 写明 packages/dsh-workloom/test/commands.test.ts。

#### P1-2 Step 5 caseTemplates 入参语义未定，core/dsh 接口未钉死

- plan 锚点：[plan.md:93](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L93)（Output「改为传模板副本路径（或 core 内部读插件模板比对）」）、[plan.md:96-97](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L96-L97)（「返回副本路径信息」「类型调整」）。
- 事实链：副本路径固定 .workloom/templates/case.md+case-result.md，指针行与守卫都可由 root 推导，core 不需要 dsh 传任何模板入参；比对用插件模板 loader 在 core resources-manifest（L90-96），core 可自读。
- 问题：「或」留两条路线未决；新类型未给出，属未锚定指令；若保留入参，dsh caseTemplates()/CASE_TEMPLATE_FILES/RESOURCES_REPO_PREFIX（executor-injection.ts L30-48）沦为冗余转手；守卫读插件模板返回 null（资产缺失）的失败路径只写在 Step 5 Failure，未进 Step 3 Failure（守卫本体在 Step 3）。
- 修正建议：推荐直接删除 caseTemplates 入参——BuildExecutorPromptParams 删字段、dsh 删 caseTemplates()/CASE_TEMPLATE_FILES/RESOURCES_REPO_PREFIX、buildFullInjection L81 删传参，core 由 root 推导副本路径并自读插件模板；Step 3 Failure 补「插件模板资产缺失 → fail loud（部署残缺）」。若保留入参，钉死新类型与字段用途，二选一写明。

#### P1-3 Step 8 现状锚点失配：2.3 无「内联措辞」，L88/L96 是空行

- plan 锚点：[plan.md:139](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L139)（Target「2.2（L88）/2.3（L96）」）、[plan.md:142](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L142)（Input「2.2/2.3 内联措辞」）、[plan.md:147](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L147)（Procedure「2.2/2.3 内联措辞同步指针」）。
- 事实链：workflow.md 2.2 标题 L87、正文 L89（「The Checker reads prd.md, plan.md, the check.jsonl materials, and the two CASE template assets」）；2.3 标题 L95、正文 L97-114 无任何 CASE/模板内联或全文携带措辞（grep template/in full 全文件仅 L89/L160 两处）；L88/L96 为空行。全文携带句只在 Dispatch norm L160。
- 后果：「2.3 内联措辞同步指针」在真实文本无锚点，按规定式计划纪律执行器须停下报阻塞；AC3 要求 2.3 文本更新，plan 未给出 2.3 的实际改动点。
- 修正建议：锚点改 2.2 L87-89、2.3 L95-97；写明 2.3 改动为 L97 执行轮描述补指针必读/守卫拒绝句（或明确 2.3 仅补必读句）；2.2 把「the two CASE template assets」改项目内两份副本并指明必读。保留 contract-asset L866-878 已 pin 子串（readyForExecution、the user is never asked to confirm the CASE、continues the same `case.designSession` for execution directly、continue `case.designSession` with `role: checker` and `purpose: execution`）与 L160 norm 前缀「CASE readiness gates execution」。

#### P1-4 全部 checker 注入夹具须先播种模板副本，plan 未声明该前置

- plan 锚点：[plan.md:79](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L79)（checker 先 assertCaseTemplatesReady）、[plan.md:84](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L84)（五角***夹具）、[plan.md:177](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L177)。
- 事实链：新守卫缺失副本即拒。现有 checker 夹具均无 .workloom/templates/：prompt-compose.test.ts stats 夹具（L173-188）、CASE 顺序夹具（L884-915）、worktree 零 diff 夹具（L846-882，baseline/empty/broken 三 root × 含 checker 的四角色，校验 err null 与逐字零 diff）；dsh case-executor.test.ts makeRoot（L28-43）与两处 buildFullInjection（L51/L71）；executor.test.ts checker 派发（L316/L706/L1326/L3101）。
- 后果：不播种则全部 checker 正向夹具被守卫拒绝，AC1 五角***夹具无法绿；零 diff 用例还要求三 root 副本一致。
- 修正建议：Step 10 Procedure 增「所有 checker 夹具组装前先经 ensureCaseTemplates（或等效写入）播种当前副本」，枚举上述文件与用例；零 diff 夹具三 root 同样播种。

#### P1-5 case.md 超预算失败路径随内联退役，plan 未声明，两处 pin 未入红绿清单

- plan 锚点：[plan.md:59](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L59)（inlineCurrentCase 改指针行）、[plan.md:63](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L63)（Failure 仅副本缺失/过期）、[plan.md:173-181](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L173-L181)。
- 事实链：现 inlineCurrentCase 超预算抛错（[prompt-sections.ts:88-90](packages/core/src/injection/prompt-sections.ts#L88-L90)，注释 L65-66「超预算直接抛错」）；pin 两处：prompt-compose.test.ts L927-933（/exceeding maxArtifactBytes=8/）、dsh case-executor.test.ts L67-73（同 regex + 失败记录 purpose 审计）。指针化后不再读 case.md 正文，预算语义必然消失（指针行无截断语义，prompt-compose.ts L20-21）。
- 后果：这是失败路径移除的行为边界变更，plan 的 Failure 与红绿清单未覆盖；case-executor 超预算用例需换失败触发方式才能保留 purpose 审计意图。
- 修正建议：Step 3 Output/Failure 写明「case.md 不再受 maxArtifactBytes 约束，超预算抛错退役」；Step 10 枚举两处 pin 并给改写方向（超预算用例改副本缺失拒绝，保留失败记录 purpose 校验）。

#### P1-6 doctor 第六检查打破五码数组 pin 与零 issue 探针，plan 未声明

- plan 锚点：[plan.md:110-117](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L110-L117)（Step 6）、[plan.md:178](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L178)（Step 10 doctor 新用例）。
- 事实链：[doctor.test.ts:99-102](packages/core/test/doctor.test.ts#L99-L102) deepEqual pin 五码数组；L108-109「正常骨架项目五类检查零 issue」与 L115-148 light 生命周期零 issue 探针均用 core initWorkloom 建骨架（不写 CASE 副本）；L163 无 .workloom 时枚举其余四码为空。新检查按 prd 须把缺失副本报 issue。
- 后果：加第六检查后数组 pin 必红；两个零 issue 探针若不播种副本必出 case_templates issue；plan 只说「新用例」，未提既有 pin 更新与探针播种。
- 修正建议：Step 6/10 增：doctor.test.ts L99-102 改六码数组（新项尾插）；零 issue 探针经 ensureCaseTemplates 播种副本；L163 空检查清单补 case_templates；doctor.test.ts 头注释与 doctor-types/doctor-checks 源码「五类」措辞同步六类。

### 四、P2（轻微，措辞不精确或引用不完整）

#### P2-1 Step 6 checkConfig 锚点与新检查放置位置

- plan 锚点：[plan.md:106](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L106)、[plan.md:114-115](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L114-L115)。
- 事实：checkConfig 定义在 [doctor-check-rules.ts:494](packages/core/src/workspace/doctor-check-rules.ts#L494)，doctor-checks.ts L67 只是调用点；doctor-checks.ts 头注释 L8 明确「单类检查规则实现见 doctor-check-rules.ts（本文件只做收集与汇总）」。无 .workloom 时 config 报 error issue（doctor-checks.ts L36-50），其余检查为空，「跳过（同 config）」不准确。
- 修正建议：checkCaseTemplates 放 doctor-check-rules.ts（checkConfig 兄弟），doctor-checks.ts collectChecks 加 pushIssues 行；Failure 改「无 .workloom → 本检查为空（config 单独报 no .workloom issue）」。

#### P2-2 case-templates.test.ts 标「新」但已存在

- plan 锚点：[plan.md:30](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L30)、[plan.md:170](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L170)。
- 事实：[case-templates.test.ts](packages/core/test/case-templates.test.ts) 已存在（42 行），pin CASE 模板资产结构（front-matter 键集/节标题/尾换行）。
- 修正建议：改「扩展现有 case-templates.test.ts，新增 ensureCaseTemplates 用例」，保留既有资产 pin。

#### P2-3 Verify 测试文件未具名/不相关

- plan 锚点：[plan.md:65](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L65)、[plan.md:101](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L101)、[plan.md:170](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L170)。
- 事实：local-prompts.test.ts 测本机片段（filterAndOrderLocal/readLocalFragments/composeLocalDirectivesText，L57-208），与 prd/CASE/模板注入无关；dsh inject.test.ts 是 session-context 快照注入，不是 executor 注入；真实 dsh 使用方是 case-executor.test.ts（buildFullInjection）、executor.test.ts（receipt injection 行）、discipline-text.test.ts。
- 修正建议：Step 3/10 移除 local-prompts.test.ts（或注明仅回归跑）；Step 5/10 具名上述三个 dsh 文件。

#### P2-4 filesInlined「恒 0 或仅余必要块」含糊

- plan 锚点：[plan.md:8](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L8)、[plan.md:81](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L81)。
- 事实：纯指针化后无任何内联块，filesInlined 恒 0；ExecutorPromptStats.filesInlined 注释（prompt-compose.ts L176）与文件头 L4-25 物化描述需同步改写。
- 修正建议：写「恒 0」；Step 4 补注释同步。

#### P2-5 R1 researcher 口径宜显式声明

- plan 锚点：[plan.md:78](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L78)。
- 事实：researcher 设计上无 Pointer list（prompt-compose.ts L252；JSONL_FILES L65-72 无 researcher），R1「与 developer 一致」易被误读为给 researcher 补 plan/jsonl 指针；prd Context/Scope 表明意图仅去除物化。
- 修正建议：Step 4 显式写「researcher 保持无 Pointer list（无 plan.md/jsonl 指针），仅新增 prd 软指针行」。

#### P2-6 Step 1 原子覆盖宜具名复用 writeFileAtomic

- plan 锚点：[plan.md:25](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L25)。
- 事实：workspace 已有 [writeFileAtomic（file-atomic.js:27）](packages/core/src/workspace/file-atomic.js#L27)；spec-templates 用 writeFileSync（非原子，L82）。
- 修正建议：Procedure 写明「不一致覆盖复用 writeFileAtomic」。

#### P2-7 Step 7 必读句宜定位为分层协议的角色例外

- plan 锚点：[plan.md:129-131](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L129-L131)。
- 事实：INJECTION_PROTOCOL_DISCIPLINE（discipline-text.ts L80-83）要求其余指针按需读；checker/judger/researcher 必读句是角色特例，与分层句同段共存。
- 修正建议：必读句加定位措辞（如「As the role-specific baseline, read ... before acting」），避免执行器按分层协议把必读当可选；既有分层句保持不变的决策正确。

#### P2-8 Step 9 Covers 标错 AC

- plan 锚点：[plan.md:155](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L155)。
- 事实：spec 新条目属 R5，验收归 AC4（「spec 新条目存在」）；AC3 只覆盖 workflow 文本与 contract-asset。
- 修正建议：Step 9 Covers 改 AC4。

### 五、结论

0 P0 / 6 P1 / 8 P2。plan 的锚点主体真实、五字段齐全、纯指针与只读守卫设计符合 prd 对齐决策；问题集中在验证锚点错包（P1-1）、接口未钉死（P1-2）、workflow 现状锚点失配（P1-3）与测试 ripple 缺项（P1-4/5/6）。按各条修正建议修订 plan 后重审。无开放问题，无需用户决断项。

## Round 2（2026-11-24，Judger，plan.md 206 行修订版）

> 注入标记回显：tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init:mwug6vb1a0iflm49 。

复审对象：[plan.md](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md) Round 2 修订版。方法：逐条对照 Round 1 发现核对闭合，read/grep 复核修订后锚点与新增 ripple 断言，补查 checker 注入夹具全集与 init 重跑路径。

### 一、Round 1 发现闭合核对

1. P1-1（验证错包）：闭合。Step 2 Verify 改 `cd packages/dsh-workloom && node --test test/commands.test.ts`（[plan.md:48](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L48)）；Step 10 Target 不再含 init.test.ts。
2. P1-2（接口未钉死）：闭合。Design decisions L9 与 Step 4 L82 删除 BuildExecutorPromptParams.caseTemplates（锚点 L167 精确）；Step 5 删除 caseTemplates()/CASE_TEMPLATE_FILES（L33-36/L42-48 精确）；守卫改 core 内读 loadCaseTemplateText/loadCaseResultTemplateText（Step 3 L63）；插件资产缺失 fail loud 已入 Step 3 Failure（L65）。残留删除清单缺项见 R2-P2-1。
3. P1-3（workflow 锚点失配）：锚点部分闭合——Target 改 Dispatch norm L160、2.2 正文 L89、2.3 正文 L97，均为真实内容行；「2.3 内联措辞」虚指已消除。残留：2.3「无则不动」与 AC3 字面冲突，见 R2-P1-1。
4. P1-4（夹具播种）：原则闭合。Step 10 Output L178「正向夹具先经 ensureCaseTemplates 播种副本」+ Procedure L181 枚举 prompt-compose 三 root/case-executor makeRoot/executor 四处 checker 派发。枚举缺三组夹具，见 R2-P2-2。
5. P1-5（超预算退役）：闭合。Design L10、Step 3 Target/Input/Output/Procedure（L53/56/57/61）声明 L88-90 抛错退役；Step 10 L183 枚举 prompt-compose L927-933 退役、case-executor L67-73 换失败触发保留 purpose 审计。
6. P1-6（doctor ripple）：闭合。Step 6 新检查放 doctor-check-rules.ts（checkConfig L494 兄弟）、collectChecks L33 收编、六码 + 元信息、源码「五类」注释改六类；Verify L120 与 Step 10 L184 含 doctor.test L99-102 六码数组与零 issue 探针播种。doctor.test.ts 自身措辞缺项见 R2-P2-3。
7. P2-1～P2-8：全部闭合。checkConfig 定义位置纠正（doctor-check-rules L494）；case-templates.test.ts 改「现有，扩展」（L19/L29）；dsh 测试具名 case-executor/executor/discipline-text（L103/L137/L174），local-prompts.test.ts 已移除；filesInlined 恒 0（L11/L76/L83）；researcher 无 Pointer list 显式（L7/L81）；writeFileAtomic 具名（L8/L23）；必读句定位分层协议角色例外（L7/L129/L132）；Step 9 Covers 改 AC4（L159）。

### 二、Round 2 发现

#### R2-P1-1（残留自 Round 1 P1-3）Step 8「2.3 无则不动」与 AC3 字面「2.2/2.3 文本更新」冲突

- plan 锚点：[plan.md:146](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L146)（Output「2.3 L97 如有内联残留同步（无则不动）」）、[plan.md:151](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L151)（Procedure「核对无内联措辞则不动」）。
- 事实：AC3 原文「workflow.md Dispatch norm 与 2.2/2.3 文本更新，contract-asset 逐字核对通过」（[prd.md:46](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/prd.md#L46)）。2.3 确无内联句（Round 1 已核实），但按 plan 执行后 2.3 文本零改动，AC3 的「2.2/2.3 文本更新」只满足 2.2；check 阶段按 AC 字面核对会判 2.3 未更新。R3 实质要求（不再携带全文）已由 Dispatch norm L160 改动满足，残留的是 AC 字面覆盖风险。
- 修正建议（二选一）：A. 推荐——2.3 L97 执行轮描述补一句指针必读（如执行轮 checker 经任务目录指针读 case.md，与角色纪律同源），使 2.3 有实质文本更新，contract-asset 新句 pin 同时覆盖 2.3；B. 主会话按 1.4「P1 记录理由」口径记录 AC3「2.2/2.3」为集合指代并留痕。prd 已用户确认，不建议改 prd。

#### R2-P2-1 Step 5 删除清单缺 RESOURCES_REPO_PREFIX 与五个失效 import

- plan 锚点：[plan.md:98](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L98)（仅删 caseTemplates()/CASE_TEMPLATE_FILES）。
- 事实：grep 确认 RESOURCES_REPO_PREFIX（[executor-injection.ts:30](packages/dsh-workloom/src/dispatch/executor-injection.ts#L30)）仅用于 CASE_TEMPLATE_FILES L34-35；EXECUTOR_ROLES 在本文件仅用于 L81 caseTemplates 三元；loadCaseTemplateText/loadCaseResultTemplateText/TEMPLATE_CASE_ENTRY/TEMPLATE_CASE_RESULT_ENTRY（L20-25 import）仅用于 CASE_TEMPLATE_FILES。删除后全部成为未使用成员，eslint 报 error，AC4 lint 门禁红。
- 修正建议：Step 5 Procedure 补「同删 RESOURCES_REPO_PREFIX 常量与 EXECUTOR_ROLES/loadCaseTemplateText/loadCaseResultTemplateText/TEMPLATE_CASE_ENTRY/TEMPLATE_CASE_RESULT_ENTRY 失效 import」。

#### R2-P2-2 Step 10 播种枚举缺三组 prompt-compose checker 夹具

- plan 锚点：[plan.md:174](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L174)、[plan.md:181](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L181)（枚举 stats/CASE 顺序/零 diff 三 root）。
- 事实：buildExecutorPrompt checker 使用方全集 grep 另有三组未枚举：[prompt-compose.test.ts:252](packages/core/test/prompt-compose.test.ts#L252)（S2 artifacts 提取，L214 起）、L688-689（S5 marker 唯一性五角色循环，L681 起）、L721（五角色段落白名单顺序，L711 起）。三组夹具均无 .workloom/templates/，不播种则守卫拒绝。Output L178 的「正向夹具先播种」通用规则可兜住，但按 red-green-expectations 应逐使用方枚举。executor.test.ts「四处」计数核实准确（L316/L706/L1326/L3101；L2436 light 门禁在注入前拒绝，无需播种）。
- 修正建议：Step 10 Target/Procedure 补枚举上述三组夹具。

#### R2-P2-3 doctor.test.ts「五类」措辞与 L163 空检查清单未入同步

- plan 锚点：[plan.md:117](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L117)（仅 doctor-checks/doctor-types 注释改六类）、[plan.md:184](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L184)。
- 事实：[doctor.test.ts:2](packages/core/test/doctor.test.ts#L2) 头注释、L91/L115 测试标题、L98/L108 注释仍为「五类」；L163 无 .workloom 空检查枚举列四码，未含 case_templates（不构成红，属校验完整性）。
- 修正建议：Step 6/10 补 doctor.test.ts 头注释/标题/注释五类→六类；L163 清单补 case_templates。

#### R2-P2-4 注入源码注释同步未枚举（Round 1 P2-4 建议残留）

- plan 锚点：[plan.md:83](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md#L83)（仅 stats 值语义）。
- 事实：[prompt-compose.ts:4-25](packages/core/src/injection/prompt-compose.ts#L4-L25) 文件头物化描述、L57 PRD_ARTIFACT「唯一物化 artifact」注释、L176 ExecutorPromptStats.filesInlined 注释，以及 [prompt-sections.ts:1-11](packages/core/src/injection/prompt-sections.ts#L1-L11) 文件头 CASE 全文/prd 节块描述，纯指针化后全部过时。
- 修正建议：Step 3/4 Procedure 补「同步上述注释为纯指针口径」。

### 三、复核通过项（Round 2 新增核实）

1. 11 步锚点全部真实唯一（含修订新锚点：BuildExecutorPromptParams.caseTemplates L167、CASE_TEMPLATE_FILES L33-36、doctor-check-rules checkConfig L494、collectChecks L33、workflow L160/L89/L97）；五字段齐全有序；Procedure 为行为边界伪代码，无 after-code。
2. AC 覆盖：AC1（3/4/5/7/10）、AC2（1/2/4/6/10）、AC3（8/10）、AC4（9/10/11）；R1–R5 全落地。
3. init 重跑刷新路径成立：executeInitCommand 内部 initWorkloom(cwd, {force:true})（[command-ops.ts:37](packages/core/src/workspace/command-ops.ts#L37)），二次 init 返回成功文本（L45-46），handleInit 仍调 ensureTemplates → ensureCaseTemplates 内容比对刷新可达，AC2 重跑语义无断点。
4. 增量续接路径 buildExecutorIncrementalPrompt 无模板守卫（prompt-compose.ts L315-325），prompt-compose.test.ts L939-996 增量夹具不受播种影响；case-executor.test.ts L55-61 增量断言不变。
5. 守卫只读、Q1=A 不自动补落、ensureCaseTemplates 与 spec-templates 语义差异、.workloom/templates/ 避开 spec 收集器、extractPrdContent/splitH2Sections 删除安全性、asset-version-bump/executor-voice/deployment 合规：Round 1 核实结论维持。

### 四、结论（Round 2）

0 P0 / 1 P1 / 4 P2。Round 1 的 6 P1 与 8 P2 主体闭合；残留 R2-P1-1（2.3 零改动与 AC3 字面冲突，推荐 2.3 补一句指针必读）与四项 P2（删除清单/播种枚举/措辞同步）。按建议修订后进入 Round 3 复审。无开放问题，无需用户决断项。

## Round 3（2026-11-24，Judger，plan.md 207 行修订版，终审）

> 注入标记回显：tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init:mwug6vb1a0iflm49 。

复审对象：[plan.md](.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init/plan.md) Round 3 修订版。方法：逐条对照 Round 2 发现核对闭合，复核新增锚点行号（均已于 Round 1/2 对真实代码核实），重审 11 步五字段/AC 覆盖/ripple。

### 一、Round 2 发现闭合核对

1. R2-P1-1（2.3 与 AC3）：闭合。Step 8 Output L147 与 Procedure L152 改为「2.3 L97 执行轮描述补一句指针必读（checker 经任务目录指针读 case.md，模板副本经 .workloom/templates/ 指针）」，2.3 有实质文本更新，AC3 字面满足；contract-asset 新句 pin 覆盖 2.3（L152）。2.3 首句 contract-asset 已 pin 子串（continue `case.designSession` ... purpose: execution）不受补句影响。
2. R2-P2-1（删除清单）：闭合。Step 5 Procedure L99 补 RESOURCES_REPO_PREFIX（L30）与五个失效 import（EXECUTOR_ROLES/loadCaseTemplateText/loadCaseResultTemplateText/TEMPLATE_CASE_ENTRY/TEMPLATE_CASE_RESULT_ENTRY），与 grep 核实的仅被删代码使用事实一致；ERR_PREFIX/ROLE_LABELS/readTaskView 等保留 import 仍有使用点，无误删。
3. R2-P2-2（播种枚举）：闭合。Step 10 Procedure L182 补 L252 artifacts 提取、L688-689 marker 五角色循环、L721 五角色白名单顺序三组夹具；与 Target L175 的 stats/CASE 顺序/零 diff 三 root 合并后，覆盖 buildExecutorPrompt checker 使用方全集（L191/L252/L689/L721/L863-866/L890/L931）。
4. R2-P2-3（doctor.test 措辞）：闭合。Step 10 L185 补头注释/标题 L2/L91/L98/L108/L115 与 L163 空检查清单五类→六类同步，行号均真实。
5. R2-P2-4（源码注释同步）：闭合。Step 4 Procedure L84 补 prompt-compose L4-25/L57/L176 与 prompt-sections L1-11 物化描述改纯指针口径，行号均真实。

### 二、终审重审结论

1. 锚点：11 步 Target 与 Edit 内全部文件/符号/行号锚点真实唯一（含本轮新增 L30/L84 注释锚点/L99 import 清单/L152 2.3 补句/L182 三组夹具/L185 doctor.test 行号），无虚指、无 after-code。
2. 五字段：11 步 Input/Output/Preconditions/Procedure/Failure 齐全有序；Procedure 为行为边界伪代码；失败路径完整（守卫缺失/过期、插件资产缺失、写盘失败、warn-only 口径、pin 红处置）。
3. AC/R 覆盖：AC1（Steps 3/4/5/7/10）、AC2（1/2/4/6/10）、AC3（8/10）、AC4（9/10/11）；R1–R5 全落地；prd 编号与验证方法齐全。
4. ripple 齐全：注入测试 pin（prompt-compose 全 checker 夹具 + 超预算退役、case-executor makeRoot + purpose 审计保留、executor 四处派发、discipline-text、contract-asset 含 2.3 新句）、doctor 第六检查全链（rules/types/collectChecks/test 数组/探针/措辞）、workflow L160 + 2.2 L89 + 2.3 L97、init 写入与重跑刷新（force:true 路径已核实）、统计恒 0 与注释同步、删除使用方核查（extractPrdContent/splitH2Sections/caseTemplates 入参/RESOURCES_REPO_PREFIX/五 import）、spec 条目、dist 同 commit。
5. 设计合规：纯指针 + 角色例外必读、Q1=A 只读守卫、内容比对刷新刻意差异、.workloom/templates/ 避开 spec 收集器、writeFileAtomic 复用、asset-version-bump/executor-voice/language/deployment 合规——Round 1/2 核实结论维持。
6. 验证命令可行：各 Verify 目标测试文件存在、cd 路径正确、git diff main 可行（当前分支 main）。

### 三、结论（Round 3，终审）

**零发现：0 P0 / 0 P1 / 0 P2。** Round 1 的 6 P1/8 P2 与 Round 2 的 1 P1/4 P2 全部闭合，plan 达到规定式编写标准，AC1–AC4 全覆盖，可进入 PLAN 确认与实现。评审收敛，主会话可经 workloom_task_planreview 标记 clean。无开放问题，无需用户决断项。

备注（非发现）：plan.md 标题与修订依据行仍写「Round 2 修订 / Round 1 处置」，未更新轮次标签；属文档簿记，不构成缺陷，主会话可自行顺手更新。
