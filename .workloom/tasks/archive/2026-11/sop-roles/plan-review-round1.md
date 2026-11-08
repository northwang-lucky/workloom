tasks/11-06-sop-roles:mw6g7k1vswtvnq5y — 冲突声明：任务单要求报告写入 plan-review-round1.md 并用 blocker/suggestion/nit 分级；Executor contract（权威节）要求写入 plan-review.md 按轮追加并用 P0/P1/P2 分级。按 contract 执行：本文件为 plan-review.md，分级用 P0/P1/P2（对应关系 P0=blocker、P1=suggestion、P2=nit），本轮为第 1 轮。

# Plan Review — 角色体系与子会话派发（11-06-sop-roles）

## Round 1（2026-11-07，Judger）

评审对象：plan.md（18 步骤 + 14 条设计决定）；基线：prd.md（R1-R13/AC1-AC10）、research/roles-dispatch-facts.md、.workloom/spec/repo/* 八个索引、archive/2026-11/sop-state-machine/plan.md（格式基准）。
核验方法：仓库 HEAD 确认为 `7da3846`（与 plan 声明一致）；对全部 18 个步骤做锚点抽查（累计核对约 120 处文件/符号/行号/文案钉住，含 git 历史对象 `62332be^` 的画像节形态），并复算导出符号计数与行数统计。
维度：按 contract 四维（Conformance/Fidelity/Feasibility/Quality）标注，括注任务单六维编号。

### 正面确认（不构成意见）

- 覆盖与追溯（维度 1）：R1-R13 与 AC1-AC10 全部有步骤承载，Covers 声明与步骤内容实质相符；未发现超出 prd 的夹带（决定 12/16 的注释随改均落在被触碰文件内，符合 R10/R13 口径）。
- 锚点事实性（维度 2）抽查结论：绝大多数锚点准确——config-load 282-289/301-304/345-347、config-subagent 320-357、config.d.ts 174-184/211-217、session-context 111-115/159-162/254-263/360-362、workflow-service 94-98/143-145/165-168/261-270、session-assemble 30-39、state-machine 519/594/667、prompt-compose 51-58/173-182/271-307/349/361/366-376、case-gates 36/116、dispatch-records 140/151/233/349-360/434-436、executor-kinds.ts 全文、surface 27-40/59-60/85-86/148-152/193-214/328、doctor-check-rules 336/359/511、failover.js 五导出、dispatch-binding.js 三导出、executor-tools 17-33/47-72、dsh executor.ts 十二段、executor-guard 39-42/63-100/91、executor-toolface 57-93、executor-continuation 140/149、executor-injection 44-50/86/124-139、discipline-text、tasks.ts 311-322 样板、constants.ts/cordis.patch.yml/main-model.ts:7/inject.test.ts:90、resources 全部行号（workflow.md version 25 与 54/68/79/81/88/96/110/136/155-158、workflow-light 11/31、ui-design 23、六个 skill 文件）、测试钉住（contract-asset 120-133/873、config.test 397-408、task-store 2164/2203/2483、state-machine.test 890-916、executor.test 12/1187/1348/1847-1882、tasks.test 105-121、discipline-text.test 21、local-prompts.test 115/203）均与实况一致。
- 五字段完备性（维度 4）：18 步全部按 Input/Output/Preconditions/Procedure/Failure 顺序齐备；伪代码为结构化行为描述，未越界写成完整代码。
- 数据与兼容纪律（维度 5）：DispatchRecord.kind 字段名保留、视图层归一、storage 不改写历史值、'legacy'/'rotate' 保留为惰性历史值，符合 repo/domain-module 的 legacy-fields 与 normalize 条款。
- 工程纪律（维度 6）：dist 双向差集守卫、构建时序（验 dsh 前先 pnpm -r build）、单一 work commit、目录入口原则（决定 9 的"同级文件也算外部"口径）均闭合，符合 repo/deployment、repo/commits、编码原则 14。
- schema 层 fail loud 已有承载：executor-schema.ts 现有 `additionalProperties: false`（实读确认），步骤 6 改名 role 后"传 kind 参数显式报错"（R3/AC4）成立。

### 意见清单

**#1 | P0 | Feasibility（维度 3：过渡期双值容忍边界） | 位置：步骤 5（Output ⑤⑦）、决定 2**
问题：步骤 5 把 dsh 仍在以旧值调用的两个 core 入口切到新值域，而 dsh 侧到步骤 6 才切换，步骤 5 的 Verify（`pnpm -r typecheck` + 两包 `pnpm test`）按书面执行必红，且决定 2 明文"过渡容忍只存在于写侧与参数校验"，恰好排除了这两处所需的容忍：
- local-prompts：`LOCAL_FRAGMENT_TARGETS` 切七新 target 后，`filterAndOrderLocal` 对不在清单内的 target 抛 unknown target（local-prompts.ts:131-145），dsh executor.ts:333-334 对返回错误直接 throw；dsh executor.test 的 execArgs 缺省 `kind: 'implement'`（executor.test.ts:253-260），全部派发用例在步骤 5 失败。决定 4 的双文件名容忍只覆盖片段文件名，不覆盖 target 入参。
- executor-capacity：core 对象入参 `CapacityCheckParams.kind` 改名 role 并".d.ts 同步"后，dsh executor-capacity.ts:167-176 以 `{ running, kind, ... }` 调用（实读确认），dsh typecheck 必断；at capacity 文案切 `<role> role at capacity` 打破 dsh executor.test:2693/2734 的逐字钉住 `'implement kind at capacity (2/2)'/'(3/3)'`（步骤 5 ⑧ 只列了 core 侧 executor-capacity.test 文案）；且"判定归一"未写明两侧归一——步骤 5 ① toTaskView 归一后，dispatches 派生的 running 记录是新值，而 in-flight 登记与闸参数仍是旧值，单侧归一会使 kind 闸漏计。
建议：capacity 的参数改名、文案切换与 local-prompts 的 target 值域/错误文案切换整体移入步骤 6（与 dsh 调用面同批）；步骤 5 的 core 侧只做"比较两侧均经 normalizeExecutorRole"的值容忍（不改 .d.ts 参数名、不改文案），或在步骤 5 为 composeLocalDirectivesText/filterAndOrderLocal 与 evaluateExecutorCapacity 入口显式加旧值容忍（步骤 7 一并删除），并把决定 2 的容忍边界表述改为覆盖运行期读侧入口。

**#2 | P0 | Feasibility（维度 3：步骤次序断链） | 位置：步骤 1（Output）、步骤 2（Output/Procedure）、决定 8**
问题：步骤 1 Output 写"records.ts 对 state/values 的三值域类型保持 type-only import（断环）"，但 state/values.ts 到步骤 2 才创建；按字面实现，步骤 1 结束时 typecheck 必失败（模块不存在）。另一读法（保持现路径 ../state-machine.ts）可通过步骤 1，但步骤 2 的 Output/Procedure 也未显式列出"storage/records.ts 的三类型 type-only 导入改线到 state/values.ts"（只写了 state 侧"对 storage 的导入改 ../storage/index.ts"；"12 个 src 消费方"在步骤 1 后已不含 task-storage.ts 这一名字），双向依赖的改线点在两步之间悬空。
建议：步骤 1 Output 改为"records.ts 保持对 ../state-machine.ts 的 type-only 导入（现路径不动）"；步骤 2 Output/Procedure 显式增加一项"storage/records.ts 对三值域类型的 type-only 导入改 ./state/values.ts"，并在步骤 2 Failure 保留运行时环检测描述。

**#3 | P1 | Feasibility（维度 3/4） | 位置：步骤 11（Output ③④）、决定 5**
问题：单次重试一跳的重派上下文来源未指定。结算钩子侧只有 childId、{root, taskRelPath}（executor-settle.ts 的 PendingSettle 实读确认）与捕获的错误码；DispatchRecord 不存原始 prompt；而一跳重派需要 parent Agent 引用、原始 prompt 全文（repo/workflow spec transport-failover 条目明文要求重试"keeping the original prompt"）、toolsAllow、agentOptions 与 startActivation 调用权。步骤 11 ③ 的"复用函数"入参只列了 model/effort 覆盖与 fallbackOf/fallbackAttempt，未说明其余必填输入在结算时刻从何而来；executor-settle 头注释强调"监听器同步边界"，异步重派在 subagent/end 同步监听器内的编排形式（fire-and-forget 或 fiber）也未裁定。executor 需自行做登记载荷扩展设计，违反五字段"无需再做设计决定"标准。
建议：步骤 11 Output 增补——executor.ts 派发成功点扩展 trackDispatchSettle（或并行注册表）登记重派上下文 {parent Agent 引用、本次 sendText（或重建 prompt 的完整物料）、role、title、toolsAllow、effective 绑定}；指明钩子内异步重派的边界（不阻塞结算、全链 try/catch WARNING 降级）；测试补"重派 prompt 与原派发一致"断言。

**#4 | P1 | Fidelity/Feasibility（维度 1/6：与 spec 冲突 + 必红联动件缺失） | 位置：步骤 17（Target/Output/Procedure）、决定 10**
问题：两处。(a) workflow.md front-matter version 25→26 必须同步 `packages/core/src/injection/protocol.js:13` 的 `WORKFLOW_PROTOCOL_VERSION = 25`（实读确认），contract-asset.test.ts:51/64/75/739 钉住 `contract.version === WORKFLOW_PROTOCOL_VERSION`；protocol.js 不在步骤 17 的 Target/Output/Procedure 任何清单中，Output 的括注只指向"plugin.ts:297-307 protocol 版本一致性测试"（那是 src 校验入口，不是需要同步的常量），按清单执行步骤 17 Verify 必红。(b) repo/workflow spec 的 asset-version-bump 条款规定仅契约结构变化（states 列表或 #### 步骤集/顺序）才升版本，"guidance-text additions inside existing steps keep both unchanged"；本步是指令文案切换，按 spec 不应升版本，plan 未给升版理由，与 spec 冲突未裁定。
建议：先裁定是否升版——(甲) 不升版（守 spec 口径）：删去决定 10/步骤 17 的 version 提升项；(乙) 升版：把角色词汇切换认定为契约语义变化并在决定 10 记录理由，同时把 protocol.js:13 常量加入步骤 17 Target 与 Procedure。两案均需核对 contract-asset.test 版本断言随动。

**#5 | P1 | Feasibility/Conformance（维度 2：锚点事实性——硬门禁数字错误） | 位置：决定 8、步骤 1（Output/Procedure）、步骤 2（Output/Procedure）**
问题："index.ts 重导出全部 44 个导出符号（storage）/55 个（state）"与实况不符：实测 task-storage.ts 为 40 个、state-machine.ts 为 54 个（`grep '^export'` 逐行清点并与盘点报告正文表格逐项复核一致；盘点报告仅标题数字 44/55 有误，plan 照抄了错误标题数）。"核对 44/55 符号一个不少"是不可达成的门禁，可能诱导 executor 为凑数把私有符号（如 GUARD_PASS、normalizeTaskRecord）加入重导出面，违反决定 8 的封装意图。另步骤 2 的 pointers.ts 枚举只写"SessionPointer 类型"，遗漏同段导出的 SessionPointerWithContext（state-machine.ts:1242，index.ts:450 有重导出）。
建议：计数改为 40/54，或改为"以 `grep '^export'` 全量清单为准逐一核对"；pointers.ts 枚举补 SessionPointerWithContext。

**#6 | P1 | Feasibility（维度 3：涟漪点缺失） | 位置：步骤 15（Target/Output）**
问题：Output 写"turnTask 参数语义收敛为 TaskView | null | undefined"。现声明面三处均为 `TaskRecordWithPath | null`（session-context.ts:115、workflow-service.ts:98/138、dsh plugin.ts:216-225 的 SessionContextBuildOptions 与 :132 getTurnTask 注记，实读确认）。若按字面把 core 参数类型改为 TaskView，TaskRecordWithPath 不可赋值给 TaskView（原始 mode/stage/status 为 unknown 可选字段），dsh plugin.ts 的类型面必须同批改，但步骤 15 的 Target 不含 plugin.ts，`pnpm -r typecheck` 断。
建议：明确裁定声明类型是否改为 TaskView；若改，把 dsh plugin.ts（SessionContextBuildOptions.turnTask、getTurnTask 返回注记与 turnTaskCache 类型）列入 Target 与 Procedure；若不改，Output 措辞改为"回退解析删除、缺省视同无活跃任务，声明类型维持现状"。

**#7 | P1 | Fidelity/Feasibility（维度 1/3：AC3 检索口径不可执行） | 位置：决定 11、步骤 7/17/18 的 Verify**
问题：AC3 的词边界检索有两类 plan 未归类的必然命中，"逐条对照假命中甄别表复核"的门禁无法闭合：(a) 新值 frontend-developer 本身——`grep -w frontend` 因 '-' 是非单词字符会词边界命中 frontend-developer 的 frontend 段，切换后 src/resources 所有新值出现处全部入命中清单，决定 11 与盘点报告的甄别清单均无此类；(b) 工件文件名 implement.jsonl/check.jsonl——FILE_NAMES（task-storage 73-79）、JSONL_FILES 值、workflow.md/skill 文本中的文件名会被 `\bimplement\b`/`\bcheck\b` 命中，同样不在甄别清单。repo/code-style spec 的 absence-assertions 与 red-green-expectations 条款正是针对这类枚举缺口。
建议：决定 11 补两类归属（"新值复合词的旧值词段"与"工件文件名"均非派发值域消费点），并给出精化检索式（如 `frontend\b(?!-developer)`、命中行排除 `\.jsonl` 文件名形态）或明确的人工剔除规则，保证步骤 7/17/18 的清单复核可判定。

**#8 | P1 | Fidelity（维度 1：与 prd 验收口径冲突未显式化） | 位置：决定 10/11、步骤 17**
问题：prd AC3 括注"仅兼容读映射模块与历史夹具数据允许出现"，而 workflow.md:79/136/155-156 的旧 stage 字样（implement/check）既非兼容读映射模块也非历史夹具，plan 裁定"不动、归子任务七"并列入假命中——与 AC3 字面白名单冲突。盘点报告「不符事实」第 5 条明确要求 plan 裁定，plan 已裁定但未把与 prd 字面口径的冲突显式上报（评审/用户确认环节看不到该裁定风险，check 阶段按 AC3 字面执行会判不过）。
建议：决定 11 增一句显式冲突声明"AC3 字面白名单不含 workflow.md 旧 stage 字样，本 plan 裁定其归子任务七，命中清单按类别逐条标注供 check 阶段按归属复核"；并把该裁定随 plan 评审回报提请用户确认（或建议 prd 侧补记）。

**#9 | P1 | Feasibility/Quality（维度 3/5：失败路径未定义） | 位置：决定 1、步骤 5 ⑦、步骤 6 ⑥⑧、步骤 14**
问题：normalizeExecutorRole 对未知值抛可判定错误（R4 要求，用于兼容读入口正确），但 plan 把同一抛错映射铺到运行期扫描/收集点：dsh 容量收集（executor-capacity.ts:140，且 :150 的 label 回退会产生空串 kind——实读确认）、写守卫重建（executor-guard.ts:63-100 扫全部非归档历史 task.json）、toolface 重建、续用校验。现状对这些点的脏值/空值是静默容忍（includes/等值比较落空即跳过）；机械套用抛错归一后，任何一条脏记录会使容量闸、全项目写守卫重建、工具面重建整体抛异常，属可用性回退，且步骤 6 ⑧/步骤 14 的 Failure 字段未覆盖该路径。
建议：executor-roles.ts 增加非抛错变体（如 tryNormalizeExecutorRole，未知返回 null），容量收集、守卫/toolface 重建、续用校验四处用非抛错变体并对失败值跳过 + WARNING；抛错版 normalizeExecutorRole 保留给兼容读入口（toTaskView 与记录级直读的展示/判定点）。在步骤 4 Output 补该导出，步骤 5/6/14 对应位置点名使用。

**#10 | P1 | Conformance/Fidelity（维度 3/6：终验门禁口径与 AC9 不符且必失败） | 位置：步骤 18（Procedure 5）**
问题："全部被改文件 wc -l 低于 600 统计"与 AC9 口径（"拆分涉及的全部文件行数低于 600"）不一致，且必然失败：本任务被改文件含既有超 600 行的 task-ops.ts（934 行，实测；步骤 10 还要向其新增编排入口）与多个测试大文件（executor.test.ts 2908、task-store.test.ts 2592、config.test.ts 1621 等）。按书面执行，executor 要么误报验收失败，要么为过门禁超范围拆分与 PRD 无关的大文件（范围蔓延）。
建议：Procedure 5 改为"拆分产物（storage/ 五文件、state/ 十文件、prompt-compose 三件套）wc -l 全部低于 600；其余被改文件仅统计并如实登记既有超 600 行文件，不在本任务强制拆分"。

**#11 | P2 | Conformance（维度 4：五字段完备性——判定归一表述不一致） | 位置：步骤 5（Output ③④）**
问题：③ 中 case-gates 点写明"且比较前归一"，但 dispatch-records 的 CASE 推进/结算三处与 purpose 校验点只写"判定改 checker/判定值切 checker"，未写明比较前归一；这些点读的是原始记录或写侧入参（非视图），中间态 dsh 写入旧值 'check' 时，字面实现（裸比较新值）会漏判 CASE 推进、误抛 "dispatch purpose is only valid for check"。决定 1 的"记录级直读点显式调用映射"在意图上覆盖了它，但步骤内表述不一致会让 executor 按字面漏掉。④ 的 buildExecutorIncrementalPrompt/inlineCurrentCase/inlineCaseTemplates 内 params.kind 判定点归一位置同样只在 buildInternal 处写明。
建议：③ 各判定点统一补"经 normalizeExecutorRole 后比较（决定 1 口径，写侧入参同样先归一再校验/判定）"；④ 明确增量入口与两个 inline 段函数同样以归一后的 role 判定。

**#12 | P2 | Conformance（维度 1：测试同步清单缺项） | 位置：步骤 10（Output ⑦）**
问题：case-executor.test.ts:38-39 以 `assert.deepEqual(properties.purpose.enum, ['case-design','execution'])` 钉住 purpose enum；步骤 10 ① 扩 enum 加 plan-review 后该断言必红，Output ⑦ 的测试清单（tasks.test/executor.test/task-ops.test）未列 case-executor.test。
建议：⑦ 补"case-executor.test.ts purpose enum 钉住更新为三值"。

**#13 | P2 | Conformance（维度 2：锚点错位 + AC4 断言无落点） | 位置：步骤 6（Output ⑪）**
问题："tasks.test schema 断言"锚点错位——tasks.test.ts:50-129 钉的是九个任务工具 schema，与 workloom_execute 无关；workloom_execute 的参数面钉住在 executor.test.ts:872-886（title required/force/reason 描述引用）与 case-executor.test.ts:36-39（buildExecutorSchema 直测，实读确认）。AC4 要求的"schema 参数为 role 且无 kind、传 kind 或旧值显式报错"单测未被指派到任何文件。
建议：⑪ 改为"executor.test 参数面用例段（872-886 附近）或 case-executor.test 承载 role schema 断言：properties 含 role 无 kind、required=['role','prompt','title']、enum 五新值、additionalProperties:false 拒 kind"。

**#14 | P2 | Feasibility（维度 2：历史事实锚点错误 + 插入点二义） | 位置：决定 6、步骤 9（Output）**
问题："节位置沿旧生产线序（Git 节后、Workflow 节前）"与 git 实况不符：`62332be^` 的 session-context 行序注释为"Last dispatch / Executor profiles / Git / Worktree / 工作流 / guidelines"（实读确认），画像节在 Git 节之前；且现线序 Git 与 Workflow 之间还有 Worktree 节，"Git 节后 Workflow 节前"存在两个插入点。旧 unknown 头文案为 'Executor profiles (main model unknown; whenMain entries skipped):'，与步骤 9 的 `<mainModel 或 unknown>` 也不逐字一致。
建议：指定唯一插入点——若确沿旧线序应为"Last dispatch 行后、Git 节前"；若坚持 Git 节后，删去"沿旧生产线序"表述并写明相对 Worktree 节的位置；unknown 头文案二选一并逐字钉住。

**#15 | P2 | Conformance（维度 4：分支未定义） | 位置：步骤 10（Output ③）**
问题：自动置位条件覆盖 phase ∈ {none, revising}（置 reviewing）与 reviewing（幂等跳过），phase=clean 时收到 plan-review 目的 Judger 派发的行为未定义（clean→reviewing 不是 PLAN_REVIEW_EDGES 合法边，直调 recordPlanReview 会抛错）。executor 需自行裁定静默/WARNING/报错。
建议：补充分支规定（建议：clean 时不动轨道并输出一行 WARNING，保持派发不回滚），⑦ 测试补 clean 态派发用例。

**#16 | P2 | Quality（维度 6：600 行线债务加深） | 位置：步骤 10（Output ④）、决定 7**
问题：executePlanReviewMark 落点 task-ops.ts 已 934 行（超编码原则 8 的 600 行线，实测），本步再向其新增编排入口；同型的确认类编排 executeAlignTask/executeTaskCase 在 doc-review.ts（417 行，余量充足）。
建议：executePlanReviewMark 改落 doc-review.ts（与 align/case 同族同类）；若坚持 task-ops.ts，在决定 7 记录既有超行债务与豁免理由（归后续拆分任务）。

**#17 | P2 | Quality（维度 6：spec 陈旧登记缺口） | 位置：决定 12、步骤 16**
问题：任务完成后 .workloom/spec 将出现与新值域/新语义不符的条目，plan 的"剩余候选归档登记"只覆盖 src/resources 注释：repo/terminology 的 executor 条目（"runs research/implement/check/frontend"）与 frontend executor 条目（"the executor kind (frontend)"）；repo/workflow 的 transport-failover 条目（描述已删除的多跳编排与 `subagents.<kind>.fallback_models` 配置面，与本任务单次重试一跳、根层级 subagents 退役后的实况不符）。
建议：步骤 16 的 notes-stale-comments.md（或归档增补登记）明确纳入上述 spec 条目，标注经 workloom-update-spec 流程更新。

**#18 | P2 | Quality/Conformance（维度 4/6：小项两处） | 位置：决定 8、决定 12/步骤 6**
问题：(a) 决定 8 允许共享私有件"放 values.ts 或 index"——放 index 会与 index 重导出的分文件形成循环导入面（ESM 可解但脆弱，步骤 2 Failure 自己也把环列为风险），留了个可预见的坑；(b) 步骤 5 ④ assertKind 改名 assertRole 后，dsh executor-injection.ts:52 与 discipline-text.ts:206 的注释仍提 assertKind（实读确认），两文件在步骤 6 被触碰，但决定 12 与步骤 6 的注释清单未列这两处。
建议：(a) 决定 8 钉死"共享私有件一律放 values.ts，index 只做重导出"；(b) 步骤 6 ⑤⑨ 各补一句注释同步（assertKind→assertRole 字样）。

**#19 | P2 | Quality（维度 5：静默失效的配置面） | 位置：步骤 6/8（涉及面）、决定 3**
问题：subagent_profiles 命中条目内部的角色键（`subagents: { implement: ... }` 形态，config.d.ts:70-73）随值域切换改按新 role 键查表；存量用户配置里的旧键（implement/check/research/review/frontend）不会报错也不会命中，配置静默失效（回退继承宿主默认）。PRD 未要求处理，但根层级 subagents 都给了 fail loud 迁移指引，同一配置树内的旧角色键静默失效在工程上不一致；plan 对该迁移面只字未提（仅测试夹具键切换有安排）。
建议：步骤 8（或步骤 6 的 config-subagent 触点）对 profile 条目内命中旧五值键的情况输出加载期一次性 WARNING（文案指向新 role 键名），或在决定中显式裁定静默并记录理由。

### 统计

总数 19；P0（blocker）2；P1 8；P2 9。

P0 集中在步骤 1/2 的双向依赖改线悬空与步骤 5/6 的跨包过渡边界（local-prompts target 入口、executor-capacity 参数/文案/单侧归一）；两者都会使对应步骤自身的 Verify 按书面执行必红，须在实施前修订 plan。
