# rotate_on_busy 轮换恢复

行号锚点以 main HEAD `4409d82` 为准；旧实现事实源为 git `62332be^`（executor-rotation.js 全文、executor.ts 轮换段 67-73/384-389/540-570/690-698、config.js:20-22 与 600-608）。

## Design decisions

1. 模块落位：轮换纯函数（selectRotationStartIndex、materializeRingChain）新建于 packages/dsh-workloom/src/dispatch/executor-rotation.ts——唯一消费方归属原则（先例：dispatch-binding 迁 dsh），TS 重写非文件搬迁；占用集合收集 collectUsedModels 恢复进 executor-capacity.ts（占用取数与容量收集同域，旧落位一致）。
2. 占用取数三级恢复（R3）：一级进程内登记——InFlightEntry 与 registerInFlightDispatch 恢复 model 承载（现签名 (seq, role) 扩为 (seq, role, model?)，model 可选使本决定先行落地时 executor.ts 未改也全绿）；二级本任务 dispatches 记录——RunningExecutorRecord.model 字段子任务四已预留（core executor-capacity.d.ts:9-13，注释明写容量判定不读该字段），本任务只让 collectRunningExecutors 开始填充：in-flight 条目直取、dispatches 记录取 record.model（角色归属已经子任务四 tryNormalizeExecutorRole 归一，model 字段为正交既有面）；三级保守归一——读不到模型的在飞项在 collectUsedModels 内按主模型位 label 计入（沿旧语义"读不到按主模型位归一"）。
3. 留痕构造单点化：buildNewDispatchBinding（dsh dispatch-binding.ts）增可选 rotation 入参——传入轮换选中条目时返回 {model, effort?, modelSource:'rotate'}，不传时现行为零变化；'rotate' 为 DispatchModelSource 既有类型成员（子任务四保留的惰性值，本任务转活，无类型改动）。
4. 重试衔接（R6，Q2=A 落地）：RespawnContext 增可选 failoverChain 字段（{model, effort?}[]）；executor.ts 派发登记时轮换起步传物化链、非轮换不传；runModelFailoverRetry 取链改为 respawn.failoverChain 优先、缺省回落现行配置重算链（旧登记与未轮换路径零行为变化），next 判定沿用"链中首个不同于 deadModel 的条目"——对物化环序链即起点后继，对配置链即现状语义，同一判定式两态恒等。
5. 回执标注：TurnMeta（executor-continuation.ts——buildTurnReceiptText 的现行宿主，非 executor-receipt.ts）增可选字段 rotation?: { model: string }，buildTurnReceiptText 在 reused 标注后（现行尾部）逐字追加 " (rotated: <model>)"，标注顺序 forced→reused→rotated 沿旧（旧 failover 标注现行回执已无，不恢复）；主模型位起步不置字段不标注。
6. 同步段接线点位（R3 核心纪律）：executor.ts 新派发分支内，runCapacityGate 放行之后、generateDispatchSeq 与 registerInFlightDispatch 之前完成池构建与选取，registerInFlightDispatch 携带实际选定模型（并行两笔同角色派发在同步段互见选择、不撞同一模型）；判定到选取到登记之间无 await。池首条目依赖 PARENT_MODEL_LABEL——该常量子任务四后收为 core surface.ts 模块内私有，本任务步骤 1 恢复 core 导出（单源注释同步修正），dsh 不自造同值字符串（禁 Magic String）。进入条件：effective.rotateOnBusy === true 且 params.model === undefined 且 fallback 链非空；池 = [主模型位条目（effective.model ?? PARENT_MODEL_LABEL 归一，effort 随带）, ...fallbackModels]；startIndex > 0 时物化链并置 rotation 状态（failoverChain、selectedModel、receipt 标注、绑定留痕四点联动），startIndex = 0（含全占用回绕）不置 rotation、零留痕（沿旧语义"回绕即现状绑定零行为变化"）。runCapacityGate 返回值须先恢复 { text, running } 一次取数两用形态（现行为 Promise<string | null>，running 是局部变量；旧形态见 62332be^ executor.ts:398-402），闸后同步段才有 running 可消费。
7. 配置解析恢复口径（R1）：parseProfileEntries 的条目字段白名单加 rotate_on_busy——typeof 非 boolean 即抛 WorkloomConfigError（含字段路径，字符串/数字布尔不收，沿旧 config.js 严格口径）；仅显式 true 落内存 rotateOnBusy（false 与缺省等价不落）；SubagentConfigEntry 类型加 rotateOnBusy?: boolean；resolveSubagentDefaults 命中条目字段合并链路透出 rotateOnBusy（当层缺省回落下一层语义与其他字段一致；现仅剩 profiles 单层加宿主默认，实际为命中条目直取）。冲突检测不涉及（无对应显式参数）。
8. 测试面分布：config.test 五形态解析用例（AC1）；executor-rotation.test.ts 新建于 dsh test（参照 git 62332be^ 的旧 executor-rotation 单测移植 TS 化）钉纯函数四行为（池序首个未占用、全占用返回 0、空池物化抛错、越界夹回）；collectUsedModels 与 in-flight model 承载用例落 executor.test.ts 容量夹具段（不新建独立 capacity 测试文件，与步骤 2 Target 同口径）；executor.test 补编排用例（轮换起步记录 modelSource='rotate' 与 receipt 标注、全占用回绕零痕迹、四路径零变化、respawn.failoverChain 为物化环序）；settle 重试用例补"轮换起步后一跳取环序后继"（AC4）。全部沿 HOME 加 TMPDIR 隔离惯例。
9. 提交分组与构建时序沿子任务四：实施步骤只验证不提交；末步单一 work commit 落代码加两包 dist（executor 契约禁止 commit 时暂存交还主会话）；验 dsh 前先 pnpm -r build；dist 镜像守卫同场验证。

## Steps

#### 步骤 1：配置解析恢复 rotate_on_busy

- Covers: AC1
- Target: packages/core/src/workspace/config-subagent.ts（parseProfileEntries 白名单与解析、resolveSubagentDefaults 透出）、packages/core/src/workspace/config.d.ts（SubagentConfigEntry 与 ResolveSubagentDefaultsResult 类型）、packages/core/src/injection/surface.ts 与 packages/core/src/index.ts（PARENT_MODEL_LABEL 恢复导出）、packages/core/test/config.test.ts。
- Edit:

  ```text
  Input: 决定 7；现行 parseProfileEntries（config-subagent.ts:46-102）的字段白名单（model/effort/tools/max_concurrent/fallback_models）与 unknown field 报错文案形态；旧口径 git 62332be^ config.js:20-22 与 600-608（白名单与 allowed 清单）、623-631（typeof 严格校验与仅 true 落字段）；surface.ts:182 的 PARENT_MODEL_LABEL 模块内私有注释。
  Output: 白名单加 rotate_on_busy；解析分支 typeof spec.rotate_on_busy !== 'boolean' 时抛 WorkloomConfigError（field 路径 `${prefix}.${name}.rotate_on_busy`，文案含 must be a boolean 语义）；仅 true 落 parsed.rotateOnBusy = true（false/缺省不落字段）；SubagentConfigEntry 加 rotateOnBusy?: boolean；ResolveSubagentDefaultsResult 加 rotateOnBusy?: boolean 且 resolveSubagentDefaults 从命中条目透出；unknown field 报错文案的 allowed 清单同步加 rotate_on_busy；PARENT_MODEL_LABEL 恢复 core 导出——surface.ts 私有单源注释改为导出单源说明、index.ts 加具名重导出（步骤 5 池构建的依赖符号，评审 #3）。测试：config.test 新增五形态用例（true 落字段、false 不落、缺省不落、字符串 "true" 抛错含路径、数字 1 抛错含路径）与 resolveSubagentDefaults 透出用例。
  Preconditions: none
  Procedure: 1) config.d.ts 类型面；2) parseProfileEntries 白名单与严格校验；3) resolveSubagentDefaults 透出；4) 报错文案 allowed 清单；5) PARENT_MODEL_LABEL 导出恢复；6) 测试五形态加透出。
  Failure: 非 boolean 值 fail loud 抛 WorkloomConfigError；既有配置（用户全局四角色 rotate_on_busy: true）解析恢复合法。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；`cd packages/core && pnpm test` 全绿（build 先于 test——config.d.ts 改动需重建 dist，否则 dist-dts 字节守卫必红，评审 #4）。

#### 步骤 2：容量面占用取数恢复（in-flight 与记录携带模型）

- Covers: AC2
- Target: packages/dsh-workloom/src/dispatch/executor-capacity.ts（InFlightEntry、registerInFlightDispatch、getInFlightDispatches、collectRunningExecutors、新增 collectUsedModels）、packages/dsh-workloom/test/executor.test.ts（容量夹具段补用例——dsh 无独立 capacity 测试文件，现状集中于 executor.test.ts，评审 #10）。
- Edit:

  ```text
  Input: 决定 2；现行 InFlightEntry {role,...}（38-42）、registerInFlightDispatch(seq, role)（66）、collectRunningExecutors（135-176）、RunningExecutorRecord.model 已预留（core executor-capacity.d.ts:9-13）；旧 collectUsedModels 语义（git 62332be^：running 记录 + kind 过滤 + 主模型位保守归一 → Set<model label>）。
  Output: InFlightEntry 增 model?: string；registerInFlightDispatch 签名扩为 (seq, role, model?)（可选参数，现调用点不改也编译）；getInFlightDispatches 产出携带 model；RunningExecutorRecord.model 既有字段直接可用（子任务四预留，勿重复增类型——评审 #7），collectRunningExecutors 开始填充：in-flight 条目直取、dispatches 记录取 record.model、listDescendants 无记录项留空；collectUsedModels(running, role, primaryModelLabel) 导出于 executor-capacity.ts：过滤同角色（角色值已归一）在飞项，模型缺失项按 primaryModelLabel 保守计入，返回 Set<string>。测试（executor.test.ts 容量夹具段补）：in-flight 登记携带模型、收集三级来源各一例、collectUsedModels 过滤与保守归一用例。
  Preconditions: none（与步骤 1 独立）
  Procedure: 1) InFlightEntry 与 register/get 扩 model；2) collectRunningExecutors 填充既有 model 字段；3) collectUsedModels 实现；4) 测试。
  Failure: 读不到模型的在飞项保守计入主模型位（宁多计占用不漏计，沿旧口径）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；`cd packages/dsh-workloom && pnpm test` 全绿。

#### 步骤 3：轮换纯函数移植 executor-rotation.ts

- Covers: AC2
- Target: 新建 packages/dsh-workloom/src/dispatch/executor-rotation.ts 与 packages/dsh-workloom/test/executor-rotation.test.ts。
- Edit:

  ```text
  Input: git 62332be^ 的 packages/core/src/dispatch/executor-rotation.js 全文（selectRotationStartIndex 与 materializeRingChain 语义）与旧单测；prd R2。
  Output: TS 重写两纯函数，语义逐条沿旧——selectRotationStartIndex({poolModels, usedModels})：池序返回首个不在占用集合的下标，全占用或空池返回 0；materializeRingChain({pool, startIndex})：空池抛可判定错误（fail loud），下标越界夹回池内，返回 {startEntry, chain}（chain 为起点后继的环序线性化，绕回段含主模型位条目，不含起点自身）；池条目类型 {model: string, effort?: string}；头注释写明设计意图与环形物化协议（与失败转移线性消费兼容）。测试参照旧单测移植：池序选取、全占用回绕 0、空池抛错、越界夹回、物化链序（起点后继环序与恒等态 startIndex=0）。
  Preconditions: none（与步骤 1/2 独立）
  Procedure: 1) 模块与两函数；2) 单测移植补齐；3) 头注释。
  Failure: 空池物化 fail loud 抛错（调用方保证链非空才进轮换）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；`cd packages/dsh-workloom && pnpm test` 全绿（新建 src 文件须同步重建 dist，否则 dist-mirror 双向差集守卫必红——评审 #5）。

#### 步骤 4：绑定、回执与重派上下文的轮换接口面（纯增量可选面）

- Covers: AC4
- Target: packages/dsh-workloom/src/dispatch/dispatch-binding.ts（buildNewDispatchBinding）、executor-continuation.ts（TurnMeta 与 buildTurnReceiptText:56-80——回执渲染宿主，非 executor-receipt.ts，评审 #1）、executor-settle.ts（RespawnContext、runModelFailoverRetry）；packages/dsh-workloom/test/executor.test.ts（failover 用例段 3083-3232 同款事件夹具）。
- Edit:

  ```text
  Input: 决定 3/4/5；现行 buildNewDispatchBinding(params, effective, mainModel)（dispatch-binding.ts:48-62）、runModelFailoverRetry 的链取值段（executor-settle.ts：resolved.fallbackModels 重算 + find 首个非 deadModel）、RespawnContext 七字段（93-108）；旧回执 rotation 入参形态（git 62332be^ executor.ts:693-694）。
  Output: ①buildNewDispatchBinding 增第四可选参数 rotation?: {model, effort?}——传入时返回 {model: rotation.model, ...(effort), modelSource: 'rotate'}，不传时现行为逐字不变；②TurnMeta 增可选字段 rotation?: { model: string }，buildTurnReceiptText 在 reused 标注后（现行尾部）逐字追加 " (rotated: <model>)"，标注顺序 forced→reused→rotated 沿旧（旧 failover 标注现行回执已无，不恢复——评审 #9）；③RespawnContext 增可选 failoverChain?: {model, effort?}[]；④runModelFailoverRetry 链取值改为 respawn.failoverChain ?? 现行配置重算链（loadConfig 重算仅在无 failoverChain 时执行），next 判定式不变（链中首个 model !== deadModel 的条目）。测试：binding rotation 分支留痕 'rotate'、receipt 标注文案逐字、settle 传入物化链时一跳取环序后继——经 registerDispatchSettlement 的 subagent/end 事件夹具通道（runModelFailoverRetry 为模块私有函数不可直调；参照 executor.test.ts:3083-3232 failover 用例的事件驱动写法，但该全链路路径的 respawn 上下文由 executor.ts 组装、无 failoverChain 注入点，本用例改经 trackDispatchSettle 手工登记携带 failoverChain 的 respawn 上下文夹具——第 2 轮 #2），构造环序链夹具：起点 F2 的物化链 [F3, main, F1]、deadModel=F2，断言重派 spawn spec 的 model=F3；不传链时回落配置重算（现状用例零回归）。
  Preconditions: none（可选面增量，先行落地全绿）
  Procedure: 1) binding 第四参与 'rotate' 分支；2) TurnMeta.rotation 字段与回执文案；3) RespawnContext 字段；4) settle 链取值优先级；5) 四点测试。
  Failure: 无 rotation/failoverChain 入参的全部现存调用路径行为逐字不变（可选面设计保证）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck` 退出码 0；`cd packages/dsh-workloom && pnpm test` 全绿（含既有用例零回归）。

#### 步骤 5：executor.ts 编排接线

- Covers: AC2, AC3, AC4
- Target: packages/dsh-workloom/src/dispatch/executor.ts（新派发分支：容量闸后至 spawn 段、记录段、trackDispatchSettle 段、receipt 组装段）、packages/dsh-workloom/test/executor.test.ts。
- Edit:

  ```text
  Input: 决定 6；现行 executor.ts 新派发分支（runCapacityGate 放行 → buildChildLabel → generateDispatchSeq/registerInFlightDispatch(dispatchSeq, params.role) → spawnExecutorChild(effective.model/effort) → releaseInFlightDispatch → recordExecutorDispatch(buildNewDispatchBinding) → trackDispatchSettle(binding 取 effective) → receipt 组装）；旧编排参照 git 62332be^ executor.ts:540-570 与 690-698。
  Output: ①runCapacityGate 返回值恢复 { text, running } 一次取数两用形态（现行为 Promise<string | null>、running 是局部变量——executor.ts:340-355；续用与新派两处调用点同步改取 .text，沿旧 62332be^ executor.ts:398-402 的"避免二次 listDescendants 异步窗口"设计，评审 #2）；随后闸放行后、登记前的同步段插入轮换：进入条件 effective.rotateOnBusy === true 且 params.model === undefined 且 effective.fallbackModels 非空；池 = [{model: effective.model ?? PARENT_MODEL_LABEL（步骤 1 已恢复 core 导出）, ...(effort)}, ...fallbackModels]；usedModels = collectUsedModels(dispatchGate.running, params.role, 池首模型 label)；startIndex = selectRotationStartIndex；startIndex > 0 时 materializeRingChain 物化，置 rotation 状态（选定条目）并把后续消费链切换为物化链，startIndex = 0 全路径零变化；②registerInFlightDispatch 携带实际选定模型 label（轮换时为选中条目模型；非轮换显式传 effective.model ?? PARENT_MODEL_LABEL，不留"现状"含糊口径——第 2 轮 #3）；续用分支的 in-flight 登记同步携带 spawnBinding?.model ?? effective.model ?? PARENT_MODEL_LABEL（沿旧 62332be^ executor.ts:450-454——否则续用在途期间另一笔同角色轮换派发会把主模型位多算为占用，评审 #12）；③spawnExecutorChild 的 model/effort 用选定条目（轮换时覆盖 effective 值，effort 缺省不传沿链条目独立档位口径）；④recordExecutorDispatch 绑定改 buildNewDispatchBinding(params, effective, mainModel, rotation)（轮换时 modelSource='rotate'）；⑤trackDispatchSettle 的 binding 用选定条目、respawn 上下文增传 failoverChain（轮换时为物化链，非轮换不传）；⑥receipt 组装传 rotation 标注；⑦整段无 await（判定→选取→登记同步纪律，头注释写明）。测试：轮换起步（占用主模型位时选 F1，记录 modelSource='rotate'、receipt 含 rotated 标注、respawn 链为物化环序）、全占用回绕（零痕迹）、四路径零变化（开关关/显式 model/续用轮/容量拒绝——记录与回执无轮换痕迹）、并行同角色两笔同步段互见不撞同一模型（in-flight 登记携模型后第二笔顺延）。
  Preconditions: 步骤 1、2、3、4 完成
  Procedure: 1) runCapacityGate 返回形态恢复与两调用点改线；2) 同步段选取与 rotation 状态；3) 登记携模型（新派与续用两支）；4) spawn 选定条目；5) 记录绑定传 rotation；6) settle 上下文传链；7) receipt 标注；8) 头注释同步（模块职责段补轮换编排说明，模块边界段"receipt 渲染在 executor-receipt.ts"过期指向修正为 executor-continuation.ts——评审 #14）；9) 测试四组。
  Failure: 轮换段任何异常不得吞派发——物化空池抛错属调用方违约（进入条件已保证链非空）；collectUsedModels 读不到模型保守计入（决定 2 三级语义）。
  ```

- Verify: `pnpm -r build && pnpm -r typecheck && pnpm lint` 退出码 0；两包 `pnpm test` 全绿；`wc -l packages/dsh-workloom/src/dispatch/executor.ts` 低于 600（现行 556 行，本步插入若超线按 code-style 拆分——如轮换段抽 dispatch 内私有模块，评审 #13）。

#### 步骤 6：终验与单一 work commit

- Covers: AC1, AC2, AC3, AC4, AC5
- Target: 全仓终态；两包 dist。
- Edit:

  ```text
  Input: 步骤 1-5 产物；prd 五条 AC。
  Output: 完整验证记录与单一 work commit（主会话执行，executor 禁止 commit 时暂存交还）。
  Preconditions: 步骤 1-5 全部完成且各自 Verify 通过
  Procedure: 1) pnpm -r build && pnpm -r typecheck && pnpm lint（AC5）；2) 两包 pnpm test 全量（含 dist 镜像守卫）；3) AC1-AC4 用例点名复跑；4) lsp_diagnostics 或 tsc 复核改动文件零诊断；5) dist 与 src 镜像一致确认；6) 主会话单一 work commit（src+test+两包 dist），message 按 repo/commits 规范。
  Failure: 任何验证红回到对应步骤修复后重跑，禁止带红提交。
  ```

- Verify: 上述 1-5 全零退出；`git show --stat` 单 commit 含两包 dist。
