tasks/11-03-full-task-case-coverage:mw04k72zmoodsby1

# 完整任务 CASE 流程的资产改动面：代码事实

Research report for task `11-03-full-task-case-coverage`. 实施者可直接消费本文件；每条结论都带锚点。

> Scope: `packages/assets/`（workflow 契约与 templates）、`packages/core/src`（契约解析、注入、门禁、surface）、`packages/adapter-dsh/src` 与 `packages/adapter-pi/src` 的注册与注入、以及三个包的测试。只读调查，不含实现。
> Format: `##` 标题即结论；锚点写作 `path:line`（相对仓库根）；关键代码用围栏块摘录；无锚点的内容标为 unverified。
>
> 缺口说明（先声明一次）：本任务目录下没有 `plan.md`，`task.json` 的 `status` 仍是 `planning`（`.workloom/tasks/11-03-full-task-case-coverage/task.json:6`），research 属于 Phase 1.2，本来就在 plan 编写之前。因此本报告按 executor contract 直接以 `prd.md`、父任务 `prd.md` 和真实源码为据推进；任务 prompt 与 executor contract 之间没有需要裁决的冲突。

## 一、步骤集合一变就必须同时改 assets 契约与协议常量，且新版本号必须大于 24

| Topic | Fact（带锚点） |
| --- | --- |
| 契约版本 | `packages/assets/workflow/workflow.md:2` 是 `version: 24`；协议常量 `WORKFLOW_PROTOCOL_VERSION = 24` 在 `packages/core/src/domain/protocol.js:13` |
| 版本升级规则 | 只有「`states` 列表或 `####` 步骤集合/顺序变化」才同时升两处；步骤内补文字不升版本 — `.workloom/spec/repo/workflow/index.md:8-9` |
| 步骤集合 | 现为 `1.0/1.1/1.2/1.3/1.4/2.1/2.2/2.3/3.1`（`packages/assets/workflow/workflow.md:22,29,52,57,62,79,88,105,112`），被 `packages/core/test/contract-asset.test.js:316` 逐字锁定 |
| 解析规则 | 步骤头正则 `^####\s+(\d+\.\d+)\s+(.+)$` 在 `packages/core/src/domain/workflow-contract.js:38`，`extractSteps` 在 `:257`，`parseDocument` 在 `:312`，`parseContract` 在 `:357` |
| 版本握手 | `assertWorkflowProtocolVersion` 在 `packages/core/src/domain/protocol.js:22-30`；两个 adapter 在注册任何命令/工具前调用它（`packages/adapter-dsh/src/plugin.ts:271-281`、`packages/adapter-pi/src/index.ts:48-57`） |
| 步骤 id 的代码消费 | `packages/core/src`、`packages/adapter-dsh/src`、`packages/adapter-pi/src` 里没有任何硬编码的步骤 id 字面量（`grep "'2.2'"` 无命中），步骤 id 只存在于 assets、测试样本、技能文档与注释 |

实施者要落的具体形状（来自任务 PRD 的 R2，尚未实现）：

```markdown
#### 2.1 Implement      # 正文不动，只把末尾 “(see 2.2)” 改成 “(see 2.3)”
#### 2.2 Design CASE    # 新增步骤
#### 2.3 Check          # 原 2.2 整段正文搬过来
#### 2.4 Commit         # 原 2.3 整段正文搬过来
```

- 这次是步骤集合变化，`packages/assets/workflow/workflow.md:2` 与 `packages/core/src/domain/protocol.js:13` 必须一起从 24 升到 25（PRD AC2 要求「高于 24」）。— `.workloom/spec/repo/workflow/index.md:8-9`、`.workloom/tasks/11-03-full-task-case-coverage/prd.md:34`
- 现存测试把版本号与「步骤 id 列表」绑定：`packages/core/test/contract-asset.test.js:316`、`packages/core/test/protocol.test.js:18-38`，以及 `packages/core/test/contract-asset.test.js:50`、`:63`、`:74`、`:685` 的多处 `contract.version === WORKFLOW_PROTOCOL_VERSION` 断言。改契约时必须同步改这些断言的期望列表。

```js
// packages/core/src/domain/protocol.js:13
export const WORKFLOW_PROTOCOL_VERSION = 24
```

## 二、轻量契约文件本身零改动，但它与主契约共用编号空间，2.2/2.3 会变成两套含义

- `packages/assets/workflow/workflow-light.md:2` 是 `version: 1`，步骤为 `1.0 Start task`（`:17`）、`2.1 Implement`（`:24`）、`2.2 Self-check and record`（`:29`）、`2.3 Commit`（`:34`）、`3.1 Archive and record`（`:41`），没有 `[workflow-norms]` 块（`:46-56` 只有三个状态块）。
- 轻量契约的步骤 id 被 `packages/core/test/contract-asset.test.js:668` 逐字锁定为 `['1.0','2.1','2.2','2.3','3.1']`，并显式断言 `norms === null`（`:665`）。这就是「轻量流程不受影响」的机器判据。
- 生效契约的选择在 core 一处完成：`assembleWorkflowProjection`（`packages/core/src/service/workflow-service.ts:128-146`）按活跃任务的 `mode` 取轻量契约，`norms` 恒取自主契约；breadcrumb 走 `assembleBreadcrumbInternal`（`:153-190`），light 分支不叠加项目 overlay。
- 结论：主契约加入 `2.2 Design CASE` 并把 Check/Commit 改成 2.3/2.4 之后，同一个 id `2.2` 在完整轨表示「设计 CASE」，在轻量轨表示「自查并记录」，`2.3` 同理。代码层没有按 id 判语义的逻辑，所以不会坏；但三处文本必须按 track 分开写，不能写「2.3 是 check」这种无 track 限定的句子：
  - `packages/assets/workflow/workflow-light.md:29-37` 的自查/提交正文（保持原意）；
  - `packages/assets/skills/workloom-continue/SKILL.md:30-32` 的路由表（完整轨要 2.2/2.3/2.4，轻量轨要 2.2 self-check/2.3 commit）；
  - `packages/assets/skills/workloom-finish/SKILL.md:13` 的「回到 2.3 Commit」（轻量轨仍是 2.3，完整轨要写成 2.4）。

```markdown
# packages/assets/workflow/workflow-light.md:29-34
#### 2.2 Self-check and record
...
#### 2.3 Commit
```

## 三、主会话可见文本有三处注入源：breadcrumb、norms、快照步骤概览，全部要随步骤与 CASE 规则更新

| 注入物 | 来源 | 组装/消费点 |
| --- | --- | --- |
| 状态 breadcrumb（每轮用户消息后注入 system prompt） | `packages/assets/workflow/workflow.md:117-131` 的四个 `[workflow-state:*]` 块 | `packages/core/src/service/workflow-service.ts:103-123`（同步入口）、`:153-190`（实现）；DSH `packages/adapter-dsh/src/plugin.ts:148-164`；Pi `packages/adapter-pi/src/inject.ts:168-190` |
| always-on norms（快照尾部 `Always-on norms:`） | `packages/assets/workflow/workflow.md:133-164` 的 `[workflow-norms]` 块 | `packages/core/src/service/session-context.ts:82`（标签）、`:160-196`（`assembleInternal`，depth=0 用契约 norms、depth>0 换成 executor 版）；解析在 `packages/core/src/domain/workflow-contract.js:125-240` |
| 工作流步骤概览行（`Workflow: 1.0 ... → 2.1 ...`） | 生效契约的 `id + title` | `packages/core/src/service/session-context.ts:179-183`；投影来自 `packages/core/src/service/workflow-service.ts:128-146` |

现状中必须逐字改的三类句子：

1. `packages/assets/workflow/workflow.md:17`（principle 4）写着「the main session fixes check-stage findings per 2.2; git commits happen only in the main session's Phase 2.3 and Phase 3」，被 `packages/core/test/contract-asset.test.js:448-457` 逐字断言。
2. `packages/assets/workflow/workflow.md:126`（in_progress breadcrumb）写着「Follow Phase 2: implement → check → commit」「do not declare completion before 2.2 has passed, and once 2.2 passes record it」，被 `packages/core/test/contract-asset.test.js:500-521` 断言其中两句。
3. `packages/assets/workflow/workflow.md:121-123`（planning breadcrumb）写着「author plan.md when the final round chose to」，被 `packages/core/test/contract-asset.test.js:747-763` 断言；R1 要求完整实施任务必须无条件有 plan，这句要改成强制口径。

norms 是唯一「每轮重注入、与步骤正文同权」的通道，R3（实施与 CASE 设计并行）、R5（未确认不得执行最终 check）、R13（归档前校验 CASE 有效）这类跨步骤纪律应落在 `[workflow-norms]`，而不是只写在 2.2 正文里。— `packages/assets/workflow/workflow.md:133-164`、`packages/core/src/service/session-context.ts:188-193`

已知的纯文本消费者（改字就会红的测试）：

- `packages/core/test/contract-asset.test.js:47-58`（分层加载协议句与 marker 回声）、`:60-70`（2.1 末尾主会话处置句）、`:119-135`（frontend 门禁措辞）、`:448-457`（principle 4）、`:500-521`（in_progress breadcrumb）、`:619`（后台派发叙述）。
- `packages/core/test/session-context.test.js:827-897`（主/轻量契约样本，硬编码 `#### 2.2 Check`、`#### 2.3 Commit`）与 `:900-930`（轻量概览行逐字断言）。
- `packages/core/test/workflow-service.test.js:355-430`（`assembleWorkflowProjection` 的步骤 id 断言）。
- `packages/adapter-dsh/test/inject.test.js:208`、`:231`、`:266` 与 `packages/adapter-pi/test/inject.test.ts:306`、`:329`、`:369`（各自的契约样本与轻量概览行）。

## 四、check executor 的两阶段职责要同时写进 core 纪律段与 Pi 角色文案，而 `kind: check` 现在会立即把 stage 切成 check

- check executor 的注入纪律是唯一来源：`packages/core/src/domain/executor-context.js:273-286`（`EXECUTOR_CONTRACT_BY_KIND[check]`）。它现在只描述「分级 → 修 P2 → 报 P0/P1」，没有任何「先设计 CASE、确认后再执行」的表述。
- 契约 2.2 正文（`packages/assets/workflow/workflow.md:88-103`）与这段纪律互相引用：`packages/assets/workflow/workflow.md:90` 明确「the definitions below are the single source; the injected discipline summarizes them」；测试逐字核对了 P0/P1/P2 定义（`packages/core/test/contract-asset.test.js:354-394`）。
- Pi 侧另有一份自写角色文案：`packages/adapter-pi/src/agent-definitions.ts:52-70`（`check` 的 `systemPrompt`），被 `packages/adapter-pi/test/agents.test.ts:32-45`、`:65-77` 断言关键字（`fix what you find`、`## Open issues`、`- none`、`P0/P1/P2`、`fix P2`、`escalate`）。改两阶段职责会命中这些断言。
- 派发注入面：check 只物化 prd 的 `Requirements` + `Acceptance Criteria` 两节全文，其余 H2 只留标题指针 — `packages/core/src/domain/executor-context.js:138`（`PRD_FULL_SECTIONS`）、`:547-560`（`extractPrdContent`）、`:401-460`（段落顺序：prd 块 → Pointer list → Research materials → Task prompt → Executor contract）；`plan.md` 只给纯指针行（`:51`、`:430-440`）。
- 阶段推进是硬编码的：`computeTaskStage`（`packages/core/src/domain/task-store.js:1275-1291`）里 `kind === check` 一律返回 `TaskStage.CHECK`，`recordExecutorDispatchInternal`（`:1013-1018`）在写 dispatch 的同一点改 `task.stage`；测试在 `packages/core/test/task-store.test.js:1344-1360`。R3 要求「CASE 设计派发不得提前把实施中的任务切到最终 check 阶段」，所以这里必须引入显式信号（例如派发参数或 CASE 生命周期状态），不能靠 kind 推断。— `.workloom/tasks/11-03-full-task-case-coverage/prd.md:11`
- 续用同一 check 会话的入口已经存在：`workloom_execute` 的 `continue_executor` 参数（`packages/core/src/surface.ts:78`、`:138-140`、`:167-176`；`CONTINUE_EXECUTOR_LATEST` 在 `:171`），两个 adapter 各自实现续用，因此「设计轮 → 执行轮」只需继续同一 childId。

```js
// packages/core/src/domain/task-store.js:1284-1290
if (kind === EXECUTOR_KINDS.research) return current
if (kind === EXECUTOR_KINDS.review) return current
if (kind === EXECUTOR_KINDS.check) return TaskStage.CHECK
return TaskStage.IMPLEMENT
```

## 五、CASE/RESULT 两个固定模板目前只存在于父任务 PRD，没有可分发资产，也没有注入通道

这是本子任务最需要决策的一处，先列事实：

| Topic | Fact（带锚点） |
| --- | --- |
| 模板现在的位置 | 父任务 PRD 的 `## CASE Document Format` 从 `.workloom/tasks/11-03-check-case-coverage/prd.md:57` 开始（内嵌模板 `:69-131`），`## CASE Result Format` 从 `:133` 开始（内嵌模板 `:151-221`） |
| 本任务如何引用 | 本任务 PRD 直接写「check 按父任务 PRD 的 CASE Document Format 生成」— `.workloom/tasks/11-03-full-task-case-coverage/prd.md:12`、`:17` |
| 资产层现状 | `packages/assets/templates/` 只有 `research-facts.md`、`spec-detail.md`、`spec-index.md`（`ls packages/assets/templates`）；`packages/assets/package.json` 的 `files` 已包含 `templates`，新增文件会自动随包发布 |
| 资产访问器 | `packages/assets/index.js:22-27` 的 `readAssetText(rel)` 是唯一通用读入口；`:35-45` 只封装了两份 workflow 契约的读取，没有任何 CASE 模板读取函数 |
| 唯一使用 templates 的代码 | spec 模板：`packages/core/src/service/spec-templates.ts`（`ensureSpecTemplates`，`:48-90`），由两个 adapter 的 init 命令读资产后喂入 — `packages/adapter-dsh/src/commands.ts:38-39`、`:113-131`，`packages/adapter-pi/src/commands.ts:33-34`、`:101` |
| 已有的「模板资产 + 规范 + 纪律句」先例 | `packages/assets/templates/research-facts.md` + `.workloom/spec/repo/research-facts/index.md:6`（把模板资产指为 canonical shape）+ `packages/core/src/domain/executor-context.js:259`（research 纪律句「see the research-facts spec and its template asset」） |

关键限制：check executor 的注入**不会**内联 prd 的 `## CASE Document Format` 正文，只会给出标题指针（`packages/core/src/domain/executor-context.js:138`、`:547-560`）。父任务 PRD 是项目内任务文档，不会随 `@workloom-ai/assets` 分发，也不在子任务的 `.workloom/spec/` 下，`check.jsonl` 无法合规引用它（1.3 要求 spec 只放 `.workloom/spec/`：`packages/assets/workflow/workflow.md:57-60`）。所以按现状实现，check executor 与两个补写技能都拿不到「单一来源」的模板正文。

- 建议（未实现，属设计选项）：把两段模板原样抽成 `packages/assets/templates/case.md` 与 `packages/assets/templates/case-result.md`，作为唯一正文来源；`workflow.md` 的 2.2/2.3 正文、check 纪律段、`workloom_task_case` 的结构校验、两个补写技能都只引用路径，不再复制模板正文。
- 建议（未实现）：模板的固定章节名与字段名（`References/Scope/Static Review/Runtime Cases/Coverage/Traceability`、`caseHash/checkSession/status` 等）应落成 core 的冻结常量（与 `PRD_SECTIONS` 同风格，`packages/core/src/domain/task-gates.js:76-93`），供 `workloom_task_case` 做深度校验，避免「校验规则」与「模板正文」两处漂移。
- 注意分层约束：core 不读 assets（`packages/core/src/domain/protocol.js:5-9` 明确「不可 import assets——分层约束」），模板正文只能由 adapter 读入后作为入参传给 core，或由 executor 按指针自行读取。若选择「core 持有模板常量」，正文就不再是 assets 单一来源，二者只能选一。

## 六、workloom-continue / workloom-finish 的步骤指针与路由必须跟着改，Pi 侧还要重新构建技能副本

- `packages/assets/skills/workloom-continue/SKILL.md:30-32` 的路由表现在写死「`in_progress`, implemented but unchecked → 2.2 Check」「Check passed → 2.3 Commit → 3.1 Wrap up」。完整轨改号后必须变成 2.2 Design CASE / 2.3 Check / 2.4 Commit，并新增两类中间态路由：
  - 实施中 + CASE 已设计待确认 → 继续 2.1 或等用户确认（不能进 2.3）；
  - 实施完成 + CASE 已确认 → 2.3 Check（同一 check 会话执行静态审查与真实用例）。
  — 依据 `.workloom/tasks/11-03-full-task-case-coverage/prd.md:11-14`、`:21-22`
- `packages/assets/skills/workloom-finish/SKILL.md:13` 写死「go back to 2.3 Commit」，完整轨要改 2.4；同文件 `:14` 的归档步骤要补「确认 CASE 有效、RESULT 对应当前 CASE」的前置校验（PRD R13）。
- 两份技能在 DSH 侧是运行时读资产注册：`packages/adapter-dsh/src/skills.ts:50-62`（`SKILL_ASSETS` 清单）、`:165-190`（`registerSkills`）；清单顺序与内容被 `packages/adapter-dsh/test/skills.test.js:142-157` 逐字锁定，continue/finish 的正文关键句被 `:188-220` 断言。
- Pi 侧是构建产物：`packages/adapter-pi/scripts/sync-skills.mjs:21-31`（`SKILL_SOURCES`）在 `pnpm -r build` 时把 `packages/assets/skills/*` 递归拷进 `packages/adapter-pi/skills/`；该目录被 `packages/adapter-pi/.gitignore:1` 忽略，当前工作区里还是旧副本（`diff packages/assets/skills/workloom-continue/SKILL.md packages/adapter-pi/skills/workloom-continue/SKILL.md` 仍显示旧的 `design.md` 措辞）。`packages/adapter-pi/test/skills.test.ts:15-38` 断言 `package.json` 的 `pi.skills` 与产物目录清单，因此跑 Pi 测试前必须先 `pnpm build`。
- 两个技能不再注册为命令：`packages/adapter-dsh/test/commands.test.js:108-116` 明确断言「continue/finish 不再注册为命令（改造为同名 skill）」，不要在改流程时又加回命令入口。

## 七、双 adapter 的资产注册、版本握手与契约测试完整清单

| 层 | 文件:符号 | 作用 |
| --- | --- | --- |
| assets | `packages/assets/index.js:15` `ASSETS_ROOT`、`:22` `readAssetText`、`:35` `loadWorkflowContractText`、`:43` `loadWorkflowLightContractText` | 唯一资产读入口；文件缺失返回 `null` |
| core | `packages/core/src/service/step-lookup.ts:27` `lookupWorkflowStep` | `workloom_step` 的查找下沉，adapter 只读契约文本 |
| core | `packages/core/src/service/workflow-service.ts:103/128/153` | breadcrumb 同步入口、投影、内部编排 |
| core | `packages/core/src/service/session-context.ts:160-196` | 快照组装（概览行 + norms） |
| core | `packages/core/src/domain/executor-context.js:252-330` | 五种 kind 的纪律段（含 check 两阶段职责要改的位置） |
| dsh | `packages/adapter-dsh/src/plugin.ts:271-281` `assertLoadedWorkflowProtocol`、`:148` `renderBreadcrumb`、`:175` `renderSessionContext`、`:213` `assembleSessionContextText` | 启动握手 + 两类注入 |
| dsh | `packages/adapter-dsh/src/skills.ts:50-62` `SKILL_ASSETS`、`:165` `registerSkills`、`:198` `registerStepsTool` | skills 注册与 `workloom_step` |
| dsh | `packages/adapter-dsh/src/tasks.ts:44` `registerTaskTools` | 任务工具注册面（新增 `workloom_task_case` 要在这里加一段 `tools.register`） |
| pi | `packages/adapter-pi/src/index.ts:29` 工厂、`:48` `assertLoadedWorkflowProtocol` | 启动握手 |
| pi | `packages/adapter-pi/src/skills-tool.ts:39-70` `registerStepsTool`、`packages/adapter-pi/src/inject.ts:48` `registerInjections`、`:64`/`:133` 快照、`:168` breadcrumb | 注入与步骤工具 |
| pi | `packages/adapter-pi/src/tasks.ts:36-101` schema 常量、`:103` `registerTaskTools` | 任务工具注册面（`TASK_CHECK_PARAMS` 在 `:61`） |
| 共享面 | `packages/core/src/surface.ts:28` `TOOL_NAMES`、`:42` `TOOL_DESCRIPTIONS`、`:65` `TOOL_SNIPPETS`、`:84` `PARAM_DESCRIPTIONS` | 两 adapter 的工具名/描述/参数文案单一来源；新增 CASE 工具必须在这里加键，否则两端各写一份 |

必须同步的测试文件：

- `packages/core/test/contract-asset.test.js`（契约解析、版本一致、步骤集合、逐字措辞、轻量契约）
- `packages/core/test/protocol.test.js:18-38`（版本常量与握手）
- `packages/core/test/workflow-contract.test.js`、`packages/core/test/step-lookup.test.js`
- `packages/core/test/workflow-service.test.js:355-430`、`packages/core/test/session-context.test.js:827-930`、`packages/core/test/executor-context.test.js`（纪律段与注入形状）
- `packages/core/test/surface.test.js`（工具名唯一、描述非空；`:254` 断言 `taskCheck` 描述含 `2.2 check pass`）
- `packages/adapter-dsh/test/skills.test.js:142-220`、`packages/adapter-dsh/test/inject.test.js`、`packages/adapter-dsh/test/tasks.test.js:67`
- `packages/adapter-pi/test/skills.test.ts:15-38`、`packages/adapter-pi/test/agents.test.ts:18-97`、`packages/adapter-pi/test/inject.test.ts`、`packages/adapter-pi/test/tasks.test.ts:92`

一个覆盖缺口（unverified，未找到反例即未覆盖）：两个 adapter 都没有「version mismatch 时 fail loud」的测试，握手只被 `packages/core/test/protocol.test.js:26-30` 单测覆盖；`grep assertWorkflowProtocolVersion packages/adapter-dsh/test packages/adapter-pi/test` 无命中。新增 `WORKFLOW_PROTOCOL_VERSION` 升级时，建议顺手补一侧握手测试。

## 八、实施前必须由主会话/用户锁定的开放问题（阻塞）

1. CASE 与 RESULT 模板的单一来源到底落在哪：`packages/assets/templates/` 新增两个资产，还是 core 常量，还是继续以父任务 PRD 为唯一来源？三者互斥于分层约束（core 不读 assets），且第三种无法被 executor 与补写技能获取正文。— 依据 `packages/core/src/domain/executor-context.js:138`、`packages/core/src/domain/protocol.js:5-9`；open，无锚点即未定。
2. `case.required` / 确认摘要值 / 摘要值时间等字段在 `task.json` 的精确字段名与结构，以及 `workloom_task_case` 的 `review`/`confirm` 参数表；PRD 只给了语义（R6/R17），没有冻结 schema。— `.workloom/tasks/11-03-full-task-case-coverage/prd.md:14`、`:25-26`
3. CASE 设计派发如何避免把 stage 切成 check：是在 `workloom_execute` 增加显式参数（例如 CASE 设计相位），还是让 `computeTaskStage` 依据 CASE 生命周期状态判定？这会同时影响 `dispatches` 记录结构、`doctor` 的 stage 一致性检查（`packages/core/src/service/doctor-check-rules.ts:229-255`）与 `packages/core/test/task-store.test.js:1344-1360`。— open。
4. 主契约升到 25 后，`version: 1` 的轻量契约 front-matter 是否也要同步改版本号？现状两个常量没有交叉断言（`packages/assets/workflow/workflow-light.md:2` 与 `packages/core/test/contract-asset.test.js:665-668` 只校验 norms 与步骤 id，不校验轻量 version），需确认「轻量流程不受影响」是否包含版本号不动。— open。
5. 新建的 CASE 相关技能（`workloom-case-active` / `workloom-case-archived`）不在本子任务范围（PRD R16），但本子任务必须让 `case` 生命周期状态可被后续技能读取；状态字段的命名要在本子任务一次性定死，否则第三个技能无法复用。— `.workloom/tasks/11-03-full-task-case-coverage/prd.md:24`
