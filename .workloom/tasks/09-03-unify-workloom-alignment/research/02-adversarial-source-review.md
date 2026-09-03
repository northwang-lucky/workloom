tasks/09-03-unify-workloom-alignment:mtlf6trr3mis7h7a

# 02 第二轮对抗式源码核查：PRD 可实现性与反例清单

> 独立于 01 号研究重读源码；01 结论不作默认前提，凡与本轮核查冲突处已逐条标注。
> 报告格式按 research-facts 规范：每条结论锚定 `path:line`（相对仓库根），建议与已验证事实分开标注。
> 本轮只读核查，未改任何实现或既有任务文档。

## 核查结论速览：八项重点各有新发现，其中五项推翻或收窄了 01 号研究的表述

| 重点 | 结论（与 01 对比） |
| --- | --- |
| 1 review/confirm 原子与幂等 | 现有写盘边界内可做同步全链路幂等；但"原子写"无任何既有基建，writeFileSync 非原子，AC4 的"写入原子性"测试需要新建 temp+rename 或明确定义语义 — packages/core/src/legacy/task-store.js:288-293 |
| 2 hash/open-node 最小公共接口 | `findMissingPrdTitle`/`findUnfilledPrdSections` 已导出可复用（packages/core/src/legacy/task-gates.js:98-122）；`splitSectionBodies` 与 executor-context 的 `splitH2Sections` 是两份私有重复实现（packages/core/src/legacy/task-gates.js:275、packages/core/src/legacy/executor-context.js:511），新解析应避免第三份 |
| 3 force 入口 | 四条链路（start/executor/check/archive）force 参数齐备；但 `recordExecutorOverride` 硬编码 `EXECUTOR_MODEL_EFFORT` 门禁（packages/core/src/legacy/task-store.js:806），stale force 无法按 R14 记"对应 override"，需新门禁参数化写口；executor 的 force 仅冲突时启用（冲突门先于任何 stale 判定） |
| 4 旧数据 read/write | 全量写回模型 + normalize 展开 parsed（packages/core/src/legacy/task-store.js:216-231）保证旧字段（含 grilling）不被写丢；archive 数据无读时改写；关键风险只在 doctor-fix 对归档任务写回时新增 alignment:null |
| 5 protocol version | 运行时启动校验可落在 DSH apply（packages/adapter-dsh/src/plugin.ts:102）与 Pi 工厂（adapter-pi/src/index.ts:21）；比"运行时读 package.json"更稳的是构建期常量 + 构建测试，运行期只对契约 version 与 core 常量比对；注意契约 version 19 目前**无人消费**（只有测试断言） |
| 6 移除两 skill 的遗漏面 | DSH `SKILL_ASSETS`（packages/adapter-dsh/src/skills.ts:45-52）与 Pi `sync-skills.mjs`（:18-25）清单均无测试锁（风险缝隙）；本机 `packages/adapter-pi/skills/` 当前仍是 6 目录构建产物（gitignore），重建即替换 |
| 7 文件尺寸 | task-store.js 已 1194 行（packages/core/src/legacy/task-store.js:1-1194；超 600 规则先例 config.js 996/executor-context.js 789），新增 alignment 写口建议收窄 API 避免继续膨胀；纯函数建议独立新模块 |
| 8 PRD 条目核查 | R10"仅主会话可调"、R12"只重开受影响分支"、R22 eval viewer、R21"protocol version"粒度、AC4"写入原子性"五处需要补充决策；R11 幂等语义（不刷新 passedAt，.workloom/tasks/09-03-unify-workloom-alignment/prd.md:19）与 01 号阻塞项 3 的"建议刷新"矛盾，以 PRD 为准 |

## 核查 1：confirm/review 在现有写盘边界内的原子性与幂等性（半可行，需新基建）

- task.json 的全部写入口最终走 `writeTaskJson`：`writeFileSync(join(taskDir, 'task.json'), JSON.stringify(record, null, 2) + '\n')` — 单次同步写、无 temp+rename、无文件锁 — `packages/core/src/legacy/task-store.js:288-293`。因此 PRD R10/AC4 的"原子写入凭据"在仓库内**没有现成机制可继承**；doctor-fixes.ts 也是直接 writeFileSync（`packages/core/src/service/doctor-fixes.ts:112,121`）。实现需二选一：
  1. 新增 `writeFileAtomic`（temp 同目录 + renameSync）只用于 confirm 写口，AC4 的原子性测试才能有可断言接缝（建议）；
  2. 或者把"原子性"定义为"同步单次全量写 + 校验失败绝不写"，沿用 checkTask 先例（packages/core/src/legacy/task-store.js:647-708 全程同步），测试只能断言"hash 不一致/非法 PRD 时不落盘"而非崩溃原子性。
- 幂等（R11 同 hash 不刷新 passedAt）可达成：confirm 内先 `readTask` 拿 `task.alignment?.prdHash`，与重算 hash 相等即直接返回成功、不动 `passedAt`。现有可参照的同步幂等样板是 `checkTaskInternal`（同步函数，无 await 穿插，单进程内不会与其他工具调用交错）— `packages/core/src/legacy/task-store.js:666-708`。**约束：confirm 必须保持全程同步**（read prd → hash → compare → read task.json → mutate → write 之间不得出现 await），否则跨会话并发下出现 read-after-write 竞态。
- 写口归属：`writeTaskJson`/`requireTask` 均为 task-store 模块私有（packages/core/src/legacy/task-store.js:276-293），service 层无法直接复用。新增 confirm 写凭据应做成 task-store 新导出函数（如 `recordAlignmentCredential(root, taskRelPath, {summary, prdHash})`，风格对齐 `recordGrillingCredential` :722-777），服务层只编排；否则会复刻 doctor-fixes 的"service 直接写盘"模式造成序列化逻辑第三份。

```js
// packages/core/src/legacy/task-store.js:288-293 —— 唯一写盘出口，非原子
function writeTaskJson(taskDir, record) {
  writeFileSync(join(taskDir, FILE_NAMES.taskJson), `${JSON.stringify(record, null, JSON_INDENT)}\n`)
}
```

## 核查 2：hash/开放节点解析应复用的最小公共接口（现成可复用项与三份重复风险）

- PRD 结构校验三件套已导出且被 doctor 复用，confirm/gate 可直接调用，无需新写：
  `findMissingPrdTitle`（packages/core/src/legacy/task-gates.js:98-104）、`findUnfilledPrdSections`（:112-122）、
  `countEffectiveJsonlRecords`（:131-133）；packages/core/src/service/doctor-check-rules.ts:319-348 已有消费先例。
- 按 `## ` 切小节的解析存在**两份私有实现**：task-gates.js `splitSectionBodies`（:275-290，供 grilling/UI 判定 :151,220 用）
  与 executor-context.js `splitH2Sections`（:511-529，供 prd 按节抽取 :471-496 用），形状相同但互不共享。
  新 alignment 的「Alignment Decisions 小节提取 + 开放节点扫描」如果照抄会成第三份。
  建议：把开放节点扫描做成只认注释行 `<!-- workloom:open-nodes=pending|none -->` 的全文正则纯函数
  （本任务 .workloom/tasks/09-03-unify-workloom-alignment/prd.md:61 的落地格式即该注释在 `## Alignment Decisions` 节末），不强依赖小节解析；
  这样可最小化新公共面（只新增 `computePrdHash` + `findOpenNodeMarker` 两个纯函数），并把
  `splitSectionBodies` 导出或收敛进 executor-context 共用（二选一，避免第三份）。
- prd 全文 hash 不需要任何小节解析：`sha256(normalizeEol(全文))`，归一化仅 CRLF/CR→LF（PRD R9 已定）。
  crypto 标准库即可（`node:crypto` createHash），无第三方依赖。
- 现有 start 门禁每次求值都重读 prd.md（packages/core/src/legacy/task-gates.js:175 readIfExists），说明 gate 内做文件 IO 是既有模式；
  stale 判定（对齐凭据 hash vs 当前 prd hash）放进同层纯函数没有 IO 约束问题。
- 校验文案风格参照 grilling 缺失项：指引下一步动作并点名工具（packages/core/src/legacy/task-gates.js:84-90），新 alignment 缺失项文案照此写，利于模型自愈。

## 核查 3：全部实际 force 入口审计（四链路齐备，但有三处 R14 语义缺口）

| 动作 | 入口 | force 生效点 | override 记录 |
| --- | --- | --- | --- |
| start | `workloom_task_start` | packages/core/src/legacy/task-store.js:612-614（force 直接跳过整个 evaluateStartGate） | `makeOverride(GATES.START)` |
| executor 新派发/续用 | `workloom_execute` | DSH packages/adapter-dsh/src/executor.ts:401-425（仅 conflicts>0 时 forced）；Pi resolveConflictGate packages/adapter-pi/src/executor.ts:196-201 | `recordExecutorOverride` → packages/core/src/legacy/task-store.js:806 硬编码 EXECUTOR_MODEL_EFFORT |
| check | `workloom_task_check` | packages/core/src/legacy/task-store.js:686-688（force 跳过 jsonl/UI 门禁） | `makeOverride(GATES.CHECK)` |
| archive | `workloom_task_archive` | packages/core/src/legacy/task-store.js:1074-1076（force 跳过 check 缺失拒绝） | `makeOverride(GATES.ARCHIVE)` |

- **缺口 A（R14"记录对应 override"不可直接实现）**：`recordExecutorOverrideInternal` 只写
  `GATES.EXECUTOR_MODEL_EFFORT`（packages/core/src/legacy/task-store.js:806），无 gate 参数。stale force 要留 `stale_alignment`
  门禁审计，必须新增参数化写口（如 `recordGateOverride(root, taskRelPath, gate, reason)`）并扩
  `GATES`/`GATE_TOOLS`/`GateValue`/`GateKey`（packages/core/src/legacy/task-gates.js:33-52、packages/core/src/legacy/task-gates.d.ts:6-15；GATE_TOOLS 是
  `Record<GateValue,string>` 全量映射，加值必须同步加工具名，tsc 会强制）。
- **缺口 B（executor force 语义与 stale 叠加）**：DSH 的 `forced = conflicts.length > 0`（packages/adapter-dsh/src/executor.ts:415），
  无冲突时即使传 force 也不会走 forced 分支、不校验 reason（assertForceReason 只在 forced 时调用，:416）。
  新 stale 门禁若复用同一 force 参数，需在"无冲突但 stale"时也允许 force+reason 放行并记录 stale override；
  若冲突与 stale 同时存在，一次调用要落两条 override（executor_model_effort + stale_alignment）还是只落一条，需要 design 定。
- **缺口 C（check/archive 的 stale force 留痕粒度）**：现 force 分支只落 CHECK/ARCHIVE 一条 override
  （packages/core/src/legacy/task-store.js:686-688 / :1074-1076），且 force 时**不求值任何门禁**。AC6 要求"`stale_alignment` force 逐次留痕"，
  若 check/archive 的 stale 阻断被同一 force 放行，是否追加一条 stale_alignment override、还是仅 CHECk/ARCHIVE 一条即算留痕，未定。
- **缺口 D（start 的 force 未要求 reason）**：PRD R14 写"force + reason"，但 start/check/archive 的 force
  目前都不校验 reason（makeOverride 空 reason 直接省略，packages/core/src/legacy/task-gates.js:246-253）；只有 executor 冲突 force 强制非空 reason
  （config.js `assertForceReason`）。新 alignment force 是否沿用 executor 口径强制 reason，需 decision（建议强制，理由：R14 明确 force+reason）。
- 续用（continue_executor）路径与派发共用同一 force 参数与同一任务解析点（DSH packages/adapter-dsh/src/executor.ts:418 resolveTaskRelPath 后
  分支到 :468 续用 / :528 新派发），stale 阻断放 :418 之后即可同时覆盖两路，无需第二处 force 入口（Pi 无续用能力：
  EXECUTOR_PARAMS 无 continue_executor，adapter-pi/src/executor.ts:75-86；surface 注释亦声明 Pi 不消费 spawn 绑定，packages/core/src/surface.ts:295-297）。

## 核查 4：executor stale 阻断的落点与状态口径（planning 期 research 派发仍是合法路径，门禁只能收窄到 in_progress）

- DSH：stale 求值插在 `resolveTaskRelPath`（packages/adapter-dsh/src/executor.ts:418）之后、冲突 force 覆盖记录（:420-425）之后、
  分支（:468 续用 / :528 新派发）之前即可同时拦新派发与续用；阻断形式建议仿冲突门返回提示文本而非抛错
  （:408-414 先例），否则模型看到的是工具报错而不知道可 force 重试。
- Pi：插在 `resolveTaskRelPath`（adapter-pi/src/executor.ts:400-405）之后、`dispatchChildPi`（:433）之前；
  Pi 无续用，只需拦新派发。注意 Pi 的派发审计 `recordExecutorDispatchEntry` 在子进程成功返回后才写（:448），
  而 stale 阻断必须发生在 spawn 前（:433 前），不要依赖 :448 位置。
- **关键反例（01 号研究未覆盖）**：executor 派发**不是 in_progress 专属**——planning 任务在 Phase 1.2 派 research
  是当前合法流程（packages/assets/workflow/workflow.md:65-68；executor 代码对 status 无任何检查，只经 resolveTaskRelPath 解析路径）。
  因此 stale 门禁若不加 status 条件就会误伤「planning 期 research 派发」（旧 planning 任务 alignment=null 重新对齐期间也要能跑 1.2）。
  判定口径必须与 R17 一致：`status==='in_progress' && alignment!==null && prdHash 不一致` 才 stale；
  `alignment===null`（旧任务）与 planning 任务一律不在此门禁内（planning 由 start 门禁约束，见核查 6）。
- check/archive 的 stale 阻断落点：check 在写 check 凭据前（packages/core/src/legacy/task-store.js:705-706 前）；archive 在门禁区
  （:1074-1082）。两处现在 force 即跳过求值（:686-688/:1074-1076），stale 判定应并入"非 force 时"求值分支，
  否则 force 放行的同时不产生任何 stale 留痕（与核查 3 缺口 C 同源）。

## 核查 5：旧 archived/planning/in_progress 数据 read/write 往返安全性（无字段丢失；唯一写回风险在 doctor-fix）

- `normalizeTaskRecord` 展开 `...parsed` 后仅补默认值（hooks/check/grilling/overrides/stage/dispatches/parent/children），
  **不剔除未知字段**（packages/core/src/legacy/task-store.js:201-231）→ 任何读后写回（start/check/archive/doctor-fix/子任务联动）都会保留
  grilling 等旧字段。新增 `alignment: parsed.alignment ?? null` 同法补默认即可，不存在丢字段路径。
- 已归档任务实际数据：`tasks/archive/2026-{08,09}/*/task.json` 抽查全部 status=completed，grilling 有 true 有 false
  （如 `executor-batching-and-injection-stats` 有、`spike-kimi-code-runtime` 无）；readTask 只读不写（packages/core/src/legacy/task-store.js:240-268），
  归档目录不在 listTasks 枚举内（packages/core/src/legacy/task-store.js:1154 跳过 archive），正常生命周期不会再写它们。
- **唯一写回归档的路径是 doctor --fix**：`fixParentChildGaps`/`fixCompletedArchive` 会把 normalize 后的整条记录
  写回（packages/core/src/service/doctor-fixes.ts:75-78,111-112,118-122；collectTasks 含 archive 节点 packages/core/src/service/doctor-tasks.ts:39-49）。
  若新 normalize 增加 `alignment:null`，任何对含归档节点的 doctor --fix 都会给**被改动**的归档任务静默补上
  alignment:null（grilling 仍在）。这本身无害，但属于"写入旧归档"，与 R17"保持原样"有轻微张力：doctor fixer
  只在任务确有缺口时写回，建议在实现说明中记录该边界（不可行则把 doctor fixer 对 archived 节点保持只读）。
- 旧 planning 样例核实：`tasks/08-26-adapter-opencode` 与 `tasks/08-31-workloom` 均 status=planning、无 grilling、
  无 stage 字段（normalize 兜底 implement）→ 迁移后 alignment=null，新 start 门禁将拦（R17 预期：须重新 alignment）。
- 旧 in_progress 不追溯阻断的判定锚点：只要门禁写成「alignment!==null 且 hash 失配才 stale」，alignment=null 的
  旧 in_progress 天然放行，无需任何豁免分支——**不要**写"alignment===null 且 status=in_progress 也拦"的口径
  （那会把全部旧任务变红，与 R17/AC7 冲突）。
- grilling 字段的数据层处理建议：normalize 展开保留它（不动），buildTaskRecord 新建任务不再写它（删 packages/core/src/legacy/task-store.js:342-343
  两行），d.ts 的 TaskGrillingRecord/grillingPending 语义删除（packages/core/src/legacy/task-store.d.ts:49-56,153,168-171,213-224）。
  没有任何代码需要"迁移" grilling 值到 alignment —— 旧数据就是惰性历史字段（R17），不要做值映射。

## 核查 6：protocol version 的真实可行落点（比"运行时读 package.json"更稳的替代）

- 现状：`contract.version`（packages/assets/workflow/workflow.md:2 = 19）只被解析、**无任何运行时代码消费**
  （parseContract 后无人读 version；唯一断言在 packages/core/test/contract-asset.test.js:39,49,60 等）；四个 package.json 版本全为
  `0.1.0`（core/assets/adapter-dsh/adapter-pi 已核实），也没有任何一致性校验。
- 启动校验落点确认：DSH 唯一激活入口 `apply`（packages/adapter-dsh/src/plugin.ts:102-134，index.ts 只转发 apply/inject/name），
  Pi 唯一工厂 `workloomExtension`（adapter-pi/src/index.ts:21-28）。两者都是同步入口，可在注册副作用前做一次校验。
  DSH plugin.test.js 用 mock ctx 直接调 apply（:41,51,61），校验若抛错会把这些测试打红——需要校验做成
  "版本不匹配即抛清晰错误"且测试环境同源同版必然通过；Pi 侧无测试 import 工厂入口，风险小。
- **建议（优于运行时读 package.json）**：core 导出协议版本常量（构建期固定），构建测试读四个 package.json 断言 semver
  一致（core/test 可用相对路径读 `../../assets/package.json` 等，测试跑在 monorepo 内）；运行期只在 DSH apply/Pi
  工厂把「core 协议常量 ↔ 契约 front-matter version（经 loadWorkflowContractText + parseContract）」比对一次。
  这样不需要在 dist 布局里猜 package.json 相对路径（core 构建后 dist/ 与 package.json 隔一层，读包号最易碎）。
- 粒度歧义待定（见阻塞项）：契约 version 每改 workflow.md 内容就 +1（19→20），package semver 只在发布时动。
  两者不可能相等，故「协议版本」应是一个独立小整数/字符串常量，与契约 front-matter version 相等并同时 bump，
  而不是拿 package semver 对契约 version。R21/AC10 需 design 明确定义。

## 核查 7：移除两 skill 后的资产分发/vendored 注记/测试/构建产物遗漏面

- DSH 注册清单：`SKILL_ASSETS` 6 项含两个将被删的 workloom skill（packages/adapter-dsh/src/skills.ts:45-52），换为
  `skills/workloom-alignment/SKILL.md`；注册循环对缺失/解析失败只 warn 不阻塞（:208-231）。
  **当前没有任何测试断言该清单内容**（grep registerSkills/SKILL_ASSETS 无测试引用）——AC2"只注册新 skill"
  必须新增清单契约测试，否则删错/漏删无红可依。
- Pi 分发：`sync-skills.mjs` 的 `SKILL_SOURCES` 6 目录（:18-25）删除两个、新增 workloom-alignment 目录；
  `skills/` 是 gitignore 的构建产物（packages/adapter-pi/.gitignore:1），rmSync 整目录重建（:30-31），残留旧目录不会留存。
  本机 `packages/adapter-pi/skills/` 此刻仍是 6 目录+LICENSE（已核实），重建即换。LICENSE 拷贝行（:37）不受影响。
- Pi 的 assets/ 里另有 research-scope.ts（随包 -e 加载，adapter-pi/assets/research-scope.ts）与 skills 无涉，不动。
- vendored 注记（必须改、否则 R20 语义断裂）：grilling/SKILL.md:8 的 workloom 块引用（Phase 1.1c 驱动句）、
  tdd/SKILL.md:22 与 :30-31（seam 归属 Phase 1.1c grilling）以及 :3 的 description（"prd.md in a workloom task
  explicitly requires test-first delivery" 保留可不动）——改指向 workloom-alignment；grilling 的 description
  需按 R20 增加"排除 active workloom planning task"的触发边界（vendored 文件头 front-matter 的 name/description
  会被 DSH 原样注册，见 packages/adapter-dsh/src/skills.ts:221-228）。
- 文案/测试锁定面（红面清单，01 已列大部分，本轮核实无遗漏）：
  - contract-asset.test.js：version=19 断言 :39,:49,:60；grilling/1.1b/1.1c 措辞 :89-98,154-211；planning 面包屑
    :185-198；norms Grilling :200-211；步骤 id 全表 :213-222。
  - surface.test.js：TOOL_SNIPPETS↔TOOL_NAMES 键对齐 :48-53（新增 taskAlign 必须进 TOOL_SNIPPETS）；
    TASK_CREATE_NOTE/GRILLING_PENDING_NOTE 措辞断言 :233-241；TOOL_SNIPPETS.taskCheck 含 phase :215。
  - adapter-dsh/test/tasks.test.js:58-72 与 adapter-pi/test/tasks.test.ts:82-104：phase 枚举 ['check','grilling']
    与 grillingRequired 描述（两个 adapter schema 测试都会红，需改为 check 单值 + 新 align 工具 schema 测试）。
  - core/test/task-gates.test.js:164-203（grilling 门禁逐字文案）、packages/core/test/task-store.test.js:1206-1460（grilling 归一化/判定/收敛
    一组）、packages/core/test/task-ops.test.js:243-265（grillingPending/grillingNote）、subtask-contract.test.js（fixture 内 grilling 措辞）。
  - task-ops.ts/surface.ts/legacy 注释与常量：packages/core/src/service/task-ops.ts:142-143（TASK_CREATE_NOTE）、:196-199（grillingPending）；
    packages/core/src/surface.ts:212-220；packages/core/src/index.ts:159-161 导出表。
- workflow.md 契约层改造面：1.1 正文 :28-63、planning 面包屑 :129-131、Grilling always-on norms :161-164、
  2.1 frontend 派发句（:91 依赖 "UI-design fixed question answered yes" 措辞，若改提问机制需同步）。
- **skill 触发路由的代码侧零改动**：skill 的"何时触发"只存在于 front-matter description/whenToUse 文案
  （workflow.md 与注册清单引用 skill 名，但没有代码按名字路由）。R20 的"grill 类请求路由到 workloom-alignment"
  必须靠文案措辞实现（brainstorm/grilling description + workflow 1.1 正文），纯文本层可控。

## 核查 8：文件尺寸与模块拆分必要性（新增逻辑的落点建议）

| 文件 | 现尺寸 | 超 600 行规则？ | 新增逻辑建议 |
| --- | --- | --- | --- |
| task-store.js | 1194 | 是（先例：config.js 996、executor-context.js 789 也未拆） | 只加「写凭据」窄口函数（如 recordAlignmentCredential），~60 行 |
| task-gates.js | 290 | 否 | 加 hash/open-node/stale 纯函数 + evaluateStartGate 分支改 alignment，约 +90 行仍 <450 |
| task-ops.ts / surface.ts | 423/358 | 否 | 新 executeAlign 编排 + 常量文案，surface 加约 20 行 |
| doctor-check-rules.ts | 509 | 否 | 新 overlay 检查 ~+40 行 |
| 新模块（建议） | — | — | 纯函数（computePrdHash/findOpenNodeMarker/evaluateStaleAlignment）建议独立 legacy 模块或并入 task-gates，避免 task-gates 与 task-store 继续膨胀；service 编排建议独立 alignment-service.ts（对齐 task-ops 模式） |
- 拆不拆的判据：新代码若只加 ~200 行且能落进 <600 文件就无需先拆；task-store 已超限属存量债，
  R16"本任务原子交付不拆分"意味着本轮不应顺手重构 task-store，只需把新写口做窄、不做大改。
- doctor 检查注册需要两处同步：DoctorIssueCode（packages/core/src/service/doctor-types.ts:13-23）+ CHECK_META（:100-115，10 类注释在
  packages/core/src/service/doctor-checks.ts:1 也有数字）。overlay 读取可复用 workflow-service 私有 `readOverlay` 的路径常量（packages/core/src/service/workflow-service.ts:28,127-134），
  建议把 OVERLAY_REL_PATH 提升为共享导出（当前 private，doctor 新检查要么重复常量要么提权）。

## PRD 逐条核查：三条不准确/需补决策，两条语义含糊，其余可落地

- R1/R2（skill 合并、Phase 1.1 统一）：可行。skill 加载点全在文案层（workflow.md 与两个注册清单），无代码按名路由；
  唯一代码面是 grilling 在 task-store/task-gates 的凭据写路径（R9 删除对象）与 surface/任务工具文案。
- R3/R4（design tree 节点族与 boundary）：可行但全部是 skill 资产文本，**机器不可验证的部分**（frontier 轮次完整性、
  "合并高度相关问题"）只能靠 AC3 的资产契约测试锁固定节点族/推荐答案/事实调查等**文本结构**，测试只能断言文档含这些规则段
  与固定的节点顺序词（参照 contract-asset 逐字断言先例 packages/core/test/contract-asset.test.js:154-211），不能验证运行时行为。AC3 表述
  "frontier 批次、推荐答案、事实调查…均有资产契约测试"需按此口径实现（测试对象是 SKILL.md 文本，不是引擎）。
- R5（1.1 可调查事实 / 1.2 留给深度研究）：文案层。注意 planning 期 research 派发仍在 1.2 使用（核查 4），
  1.1 内"Agent 调查事实"若走 workloom_execute 会与 1.2 边界混淆——需 skill 内写明 1.1 用自检索（web/LSP/文件），
  深度调研才派 research executor。
- R6（UI 七轴/test-first 变为按需参考）：可行。evaluateFrontendDispatchGate 与 `## UI Design` 小节判定保留
  （packages/core/src/legacy/task-gates.js:219-226,79），prd 的 UI Design 小节仍是 frontend 派发门禁依据（packages/assets/workflow/workflow.md:91,110）——本重构只改
  "谁来做 UI 对齐"（grilling 判定 → alignment design tree），不改 frontend 门禁机制本身。
- R7/R8（Alignment Decisions 节 + open-nodes 标记 + 收敛顺序）：可行。标记格式已在本任务 .workloom/tasks/09-03-unify-workloom-alignment/prd.md:61 落地
  （`<!-- workloom:open-nodes=none -->`）。**收敛顺序（frontier 空 → finalize prd → review → 用户确认 → 写凭据）
  是 skill 指令 + 工具协议，代码只能强制 review/confirm 两段与 hash 一致性，无法强制"先 frontier 空"**——
  若用户在 frontier 未空时直接调 confirm，凭据会被写入；skill 必须自持纪律（无代码护栏），与 grilling 现状同理。
- R9（alignment 字段替换 grilling）：可行。数据层细节见核查 5；注意 `task.json.alignment.prdHash` 是"快照"，hash 输入
  是**含 Alignment Decisions 的最终 prd.md 全文**，这意味着 alignment skill 每次向 prd 增量写结论都会使凭据 stale——
  因此增量写入必须发生在最终 review 之前（R7/R8 时序），confirm 之后 prd 再动即 stale（R12 预期行为，01 风险清单已述，
  本轮确认与 R11 幂等不冲突：同 hash 幂等返回 + 不同 hash 视为新一轮确认并刷新 passedAt）。
- R10（工具只主会话）：默认可达——executor allow 清单基集是 NATIVE_TOOLS 显式枚举（packages/core/src/legacy/executor-tools.js:20-42），
  不含任何插件工具，`workloom_task_align` 注册后默认不进子代理工具面。**但非结构性强约束**：subagent_profiles
  tools.includes 可显式补回任意插件工具（buildAllowList :69-79），届时无任何代码拒绝。若"只允许主会话"是硬要求，
  DSH 侧应在工具 execute 内查 `delegationDepthOf(agent)>0` 拒绝（DSH 有该 API，packages/adapter-dsh/src/skills.ts:280 已有先例）；Pi 的 child pi
  以 `--no-extensions` spawn（packages/adapter-pi/src/pi-args.ts:55 固定参数序列；packages/adapter-pi/src/executor.ts:13 头注），天然无该工具，无需额外拦截。
- R11（confirm 校验与幂等）：可行，条件清单（结构错误/占位符/open-nodes≠none/hash 不一致 → 不动 task.json）全部可机检，
  复用 task-gates 三个纯函数 + 新开放节点扫描。**注意顺序**：开放节点≠none 属于"过程未收敛"，占位符/结构错误属于
  "文档不合法"，两者都要在任何写盘前判完（confirm 全程同步即可保证"校验失败不落盘"）。
- R12（PRD 变化 stale；改需求只重开受影响分支）：**"只重开受影响分支"无法机器化**——design tree 状态与"哪些分支受影响"
  只存在于对齐会话/skill 上下文，没有任何持久化结构记录节点关系；开放节点标记只有 pending/none 两态。可落地的只有：
  confirm 后 prd 任何变化 → stale → 重新完整对齐（而非仅重开分支）。AC12 的"需求变更重开分支" eval 只能测 skill 文本行为，
  建议 PRD 措辞在 design 阶段澄清为"重新进入 alignment（skill 引导聚焦变更区域）"。
- R13/R14（stale 门禁与 force）：落点与缺口见核查 3/4。**门禁覆盖到 planning 的哪一级需要定**：
  start 门禁拦 planning（无凭据或 stale 均拦）；executor/check/archive 只拦 in_progress stale（否则误伤 planning research）。
- R15（Phase 1.4 保留）：无需代码改动；packages/core/src/service/route-service.ts:96-112 的 planning 路由（prd 就绪→1.4）保持。
- R17（三类旧任务迁移）：见核查 5，判定口径建议为「stale = alignment!==null && hash 失配」，旧任务天然放行，无兼容分支。
- R18（legacy-module 规范）：`.workloom/spec/repo/legacy-module/index.md` 现仅 12 行、无迁移小节，需补数据模型迁移
  边界描述（把核查 5 的"展开保留旧字段 + 只补默认值"写法固化为规范）。
- R19（doctor 检出 overlay 旧引用）：可行。检查函数读 `.workloom/workflow.override.md`（路径常量 packages/core/src/service/workflow-service.ts:28），
  匹配 workloom-brainstorm/workloom-ui-design/1.1a/1.1b/1.1c 词，fixable:false，不注册修复器（doctor-check-rules 只读，
  修复在 doctor-fixes.ts，不新增即满足"不自动改写"）。
- R20（grill 请求路由 + generic grilling 排除描述）：文案层，见核查 7。
- R21（同版本发布 + 协议握手）：见核查 6；四包 semver 一致性构建测试放 core/test（可读其他包 package.json）。
- R22/AC12（skill eval + eval viewer）：**仓库内无任何 eval 基建**（grep 无 eval/benchmark/viewer 相关代码或资产），
  此条目是全新工作且 PRD 未定义落地形式（哪个 runtime 驱动、用例放哪、viewer 是文件还是命令、用什么模型跑触发样本）。
  这是本轮核查认为最欠决策的一条，见阻塞项。
- R23/R24：约束条目，无代码验证面（R23 的 headless/沙箱现实已核实：~/.dsh/profiles 下有 headless 与 web；
  web 绑定 trellis-hotplug 的 adapter 路径（file:/data00/.../trellis-hotplug/packages/adapter-dsh），与本仓库不同源，
  GUI 冒烟确实不可用，R23 约束成立）。

## 与 01 号研究结论的冲突点（本轮独立核查推翻或修正处）

- 01 阻塞项 3 建议"同 hash 重复 confirm 刷新 passedAt"；PRD R11 与任务 grilling summary 均定稿为
  **幂等且不刷新 passedAt**（.workloom/tasks/09-03-unify-workloom-alignment/task.json:29 grilling.summary 原文 "same-hash confirm is idempotent without
  timestamp refresh"）。以 PRD/凭据为准，01 的这条建议已失效。
- 01 阻塞项 4 问 stale force 是新增 GATES 还是复用 START；.workloom/tasks/09-03-unify-workloom-alignment/task.json:29 已定 "stale_alignment is a distinct
  audited gate covering new and continuation executor dispatches" → 新 gate 值 `stale_alignment`。但 01 只讨论了
  executor 侧；check/archive 的 stale force 是否也落 stale_alignment override（核查 3 缺口 C）仍未闭环。
- 01 称"已归档任务全部 required:true"：实测 archive/2026-08 有大量 required=false 或无 grilling 字段
  （见核查 5 抽查），不影响 R17 结论但修正其数据描述。
- 01 未提 planning 期 research 派发合法这一事实（核查 4 关键反例）——若照 01 的拦截点清单不加 status 条件，
  stale 门禁会误伤 planning 任务 1.2 的 research 派发。这是本轮最重要的反例。
- 01 未覆盖 force 语义与 stale 叠加（核查 3 缺口 A/B/C/D）：recordExecutorOverride 硬编码门禁、
  executor force 仅冲突时生效、start/check/archive force 不要求 reason 三处都会让 R14 无法直接落实。
- 01 把 SKILL_ASSETS 缺测试当作顺带提一句；本轮确认这是 AC2 唯一可机检落点（注册清单契约测试），应提升为显式交付。

## 未验证项（本环境无法实读）

- Pi 运行时如何加载 skills/（pi-coding-agent dist 的 package resources 逻辑不在本仓库内，`RESOURCE_TYPES` 注释来自
  adapter-pi/assets 之外的 Pi CLI 行为说明，无法在仓库内验证 AC11 的"Pi 沙箱内不加载旧 skill"断言方式）。
- DSH apply 抛错对插件激活的影响行为（cordis 加载失败的表现）未实测——版本校验若 fail loud，需在 headless profile 冒烟验证
  "插件激活失败时报错可读且可恢复"。

## 阻塞项（需主会话转用户/design 决策）

1. 「写入原子性」的验收语义：temp+rename 真原子写 vs 同步全量单写（建议前者，AC4 才有可测接缝）。
2. stale force 的 override 留痕粒度：check/archive 被 stale 拦后 force，是否追加 `stale_alignment` override
   （建议追加，满足 AC6"逐次留痕"）；executor 冲突 + stale 同时存在时一次调用落两条还是一条。
3. alignment force 是否强制非空 reason（建议强制，对齐 executor assertForceReason 口径；start/check/archive 现有 force
   均不强制，需一并定或只对 alignment/stale 强制）。
4. R21「protocol version」粒度与载体：独立协议常量（与契约 front-matter version 同步 bump）vs 复用契约 version；
   启动校验失败行为（fail loud 抛错 vs warn 降级）。
5. R22/AC12 eval 基建落地形式：仓库内无 eval/viewer 先例，需定用例清单存放位置、驱动模型样本、viewer 输出物
   （Markdown/HTML/命令），以及是否纳入本任务交付（涉及不可忽略的新基建）。
6. "只重开受影响分支"不可机器化（PRD R12）：建议降级为"重新进入 alignment 并聚焦变更区域"，需用户确认措辞调整。
7. doctor --fix 写回归档任务时补 alignment:null 是否可接受（核查 5）：建议接受并记入 legacy-module 规范，或把
   doctor fixer 对 archived 节点改为只读。
8. executor stale 门禁在 planning 期 research 派发上的口径：建议仅 in_progress 触发（核查 4），需确认与 AC6
   "planning 无法 start"的分工无歧义。
