# 简化 workloom 人工确认流程实施计划

## Design decisions

1. PRD 确认沿用 `task.alignment`，只保留 `passedAt` 与 `summary`；新增 `task.planConfirmation` 保存 PLAN 内容确认。旧哈希字段可作为历史数据保留在既有文件中，但新逻辑不得读取。
2. `workloom_task_align` 增加 `target=prd|plan`，缺省为 `prd`。PRD 确认后才能确认 PLAN；完整非容器任务启动前必须同时存在两份确认。轻量任务与容器任务保持豁免。
3. `workloom_task_case` 只保留 `action=review`，返回结构诊断与 `readyForExecution`。删除 CASE 的确认动作、哈希字段、确认记录和 `task.case.result` 状态记录；实际 `case-result.md` 与证据文件仍必须通过校验。
4. CASE 执行前置只要求 `case.md` 存在且 `case.designSession` 有效。主会话完成实际复核后直接续接设计会话执行，不写入额外复核凭证。
5. 删除旧 CASE 结果复用。每次执行都生成新的实际结果。`codeBaseline/codeFingerprint` 仅作为代码状态证据保留，不参与文档确认或旧结果复用。
6. 保留现有步骤编号和状态集合，workflow 协议版本保持 25。PRD 确认放在 1.1，PLAN 确认放在 1.4。
7. 系统发现的阻塞、范围变化或验收变化仍集中提问。用户主动提出的明确变更直接更新相关文档并继续，不再二次确认同一变更。
8. 构建产物只通过命令重新生成，不手工编辑。归档任务不迁移、不改写。

## Steps

#### 步骤 1 改造 PRD 与 PLAN 的内容确认记录

- Covers: AC1, AC2
- Target: `packages/core/src/domain/task-store.js` 的 `normalizeTaskRecord`、`recordAlignmentCredential`，新增 `recordPlanConfirmation`；`packages/core/src/domain/task-store.d.ts` 的对应记录类型；`packages/core/src/domain/alignment.js` 的 `evaluateAlignmentGate`；`packages/core/src/domain/alignment.d.ts` 的两参门禁声明；`packages/core/src/service/alignment-service.ts` 的 `executeAlignTask`；`packages/core/src/surface.ts` 的 align 工具描述；`packages/core/test/surface.test.js` 及相关 core 测试。
- Edit:
  ```text
  输入：task.json、prd.md、plan.md、target、action、summary。
  输出：PRD 或 PLAN 的内容快照、结构诊断、确认状态；确认成功时写回对应记录。

  PRD 确认：
    要求 PRD 结构完整且开放节点为 none。
    写入 { passedAt: 当前时间, summary: 非空摘要 }。
    不计算、不接收、不返回文档哈希。

  PLAN 确认：
    要求 target=plan 且 PRD 已有确认记录。
    复用 inspectPlanStructure 检查标题、Steps、步骤字段和 AC 覆盖。
    结构通过后写入 planConfirmation = { passedAt, summary }。
    PLAN 缺失或结构不完整时返回全部结构问题。
    PRD 未确认时拒绝 PLAN 确认，并提示先确认 PRD。

  通用约束：
    completed 任务拒绝写入。
    每次确认刷新 passedAt 与 summary，不做哈希幂等判断。
    旧 prdHash 字段不驱动任何新行为。
  ```
- Verify: 在 `packages/core` 运行 `node --test test/alignment.test.js test/task-ops.test.js test/task-store.test.js test/worktree-lifecycle.test.js test/surface.test.js`。预期全部通过，并覆盖 PRD 未确认、PLAN 未确认、顺序错误和重复确认。

#### 步骤 2 删除 PRD 的哈希失效判断并接入 PLAN 启动条件

- Covers: AC1, AC2
- Target: `packages/core/src/domain/alignment.js` 的 `computePrdHash`、`normalizePrdEol` 与 `ALIGNMENT_STALE`；`packages/core/src/domain/alignment.d.ts` 的对应声明；`packages/core/src/domain/task-gates.js` 的 `evaluateStartGate`、`evaluateStaleAlignmentGate`、`GATES`；`packages/core/src/domain/task-gates.d.ts`；`packages/core/src/domain/task-store.js` 的 check/archive 失效分支；`packages/core/src/index.ts` 的 PRD 哈希与 stale 导出；相关测试。
- Edit:
  ```text
  输入：任务状态、PRD/PLAN 确认记录、PLAN 结构检查结果。
  输出：启动、检查、归档和派发所需的缺失项列表。

  启动：
    PRD 只检查确认记录是否存在。
    完整非容器任务额外检查 planConfirmation 是否存在。
    缺 PLAN 时只报告结构缺失；结构合格但未确认时报告 PLAN_NOT_CONFIRMED。
    容器与轻量任务不要求 planConfirmation。

  后续阶段：
    删除 check、archive、executor 派发中的 PRD stale 判断。
    删除 STALE_ALIGN 枚举、工具映射和 force 分支。
    旧 overrides 中的 stale_alignment 值保持可读，不写迁移，也不用于新判断。
    computeContentHash 与 normalizeContentEol 仍被 CASE 使用，本步保留其实现、声明和导出，留到步骤 3 随 CASE 一并删除。
    文档确认后发生修改时，不产生哈希失效错误；按 workflow 的内容变更规则处理。
  ```
- Verify: 在 `packages/core` 运行 `node --test test/alignment.test.js test/task-gates.test.js test/task-store.test.js`。预期全部通过，并包含“确认后修改 PRD 或 PLAN 不产生 stale 错误”的回归用例，以及容器和轻量任务豁免 PLAN 确认的用例。

#### 步骤 3 改造 CASE 复核、执行和结果校验

- Covers: AC1, AC3, AC5
- Target: `packages/core/src/domain/case.js` 的 `createCaseRecord`、`computeCaseHash`、`evaluateCaseExecutionGate`、`evaluateCaseOutcomeGate`；`packages/core/src/domain/alignment.js` 与 `alignment.d.ts` 中不再被消费的 `computeContentHash`、`normalizeContentEol`；`packages/core/src/index.ts` 的共享哈希与 CASE 哈希导出；`packages/core/src/domain/case.d.ts`；`packages/core/src/domain/task-store.js` 的 CASE 写入与归档逻辑；`packages/core/src/domain/task-store.d.ts` 的 `CaseConfirmationInput`、`recordCaseConfirmation` 和 CASE 生命周期类型；`packages/core/src/service/case-service.ts`；`packages/core/src/domain/executor-context.js` 的 execution 注入；相关 core 测试。
- Edit:
  ```text
  输入：case.md、case-result.md、designSession、执行会话链、实际证据。
  输出：CASE 结构诊断、执行许可、实际结果诊断。

  CASE review：
    只支持 action=review。
    返回 case 内容、structureIssues、blockers、readyForExecution 和当前 designSession。
    不返回 caseHash，不写确认时间、摘要或复核指纹。

  CASE execution：
    required=true 时要求 case.md 存在且 designSession 非空。
    不再检查用户确认或文档哈希。
    普通续接只追加本轮执行指令，不追加哈希文本。
    首次执行、故障转移和 reinject 仍注入当前 CASE 与模板。

  CASE 结果：
    删除 RESULT 的 caseHash 关联校验。
    删除 task.case.result、resultHash 和 requireResultRecord。
    保留 RESULT 状态、SR/C 项、标准验证、覆盖率、证据路径和会话链校验。
    archive 依赖实际 RESULT 与 check 记录，不依赖额外结果状态字段。
  ```
- Verify: 在 `packages/core` 运行 `node --test test/case.test.js test/executor-context.test.js test/session-context.test.js`。预期全部通过，并证明无 CASE 确认记录也可执行、无 designSession 仍拒绝、旧哈希不参与结果校验。

#### 步骤 4 改写主 workflow 与需求对齐技能

- Covers: AC1, AC2, AC4, AC6
- Target: `packages/assets/workflow/workflow.md` 的 1.1、1.4、2.2、2.3、planning 指引和 norms；`packages/assets/skills/workloom-alignment/SKILL.md`；`packages/assets/skills/workloom-alignment/references/plan-authoring.md` 中涉及确认位置的引用；`packages/assets/skills/workloom-alignment/evals/evals.json`；`packages/assets/skills/workloom-migrate-plan/SKILL.md`；`packages/core/test/contract-asset.test.js`；`packages/core/test/protocol.test.js`。
- Edit:
  ```text
  输入：已收敛 PRD、已复核 PLAN、用户内容确认消息。
  输出：更新后的主流程与对齐指引。

  1.1：
    结构检查通过后展示 PRD 内容并请用户确认。
    用户确认后调用 align target=prd action=confirm，只传 summary。
    随后才进入调研、上下文配置和 PLAN 编写。
    删除“不得在 1.1 确认 PRD”和“author neither”规则。

  1.4：
    默认完成 PLAN 评审并处理发现的问题。
    展示 PLAN 内容供用户确认，不重新请求 PRD 确认，不展示哈希。
    用户确认后调用 align target=plan action=confirm，再调用 task_start。
    删除合并评审包和 stage-wise 例外描述。

  CASE 与异常：
    主会话复核 CASE 后直接执行，不出现用户 CASE 确认。
    保留系统发现阻塞或范围变化时的集中提问。
    用户主动提出的明确变更视为已确认，更新受影响文档后继续。

  对齐评测与文本保护：
    alignment evals 改为 PRD/PLAN 内容确认、summary 和 target=plan 的顺序预期。
    删除 same-hash 幂等等旧评测。
    workflow.md:163 的分层加载协议句与 2.1 末尾的阻塞集中提问句保持逐字不动。

  协议：
    不修改 states、步骤 id 或步骤顺序，version 与 WORKFLOW_PROTOCOL_VERSION 均保持 25。
  ```
- Verify: 在 `packages/core` 运行 `node --test test/contract-asset.test.js test/protocol.test.js`。预期全部通过；文本断言覆盖两次内容确认、无哈希、无 CASE 用户确认及用户主动变更免二次确认。

#### 步骤 5 清理 CASE 技能、模板与评测夹具

- Covers: AC1, AC3, AC4, AC5, AC6
- Target: `packages/assets/skills/workloom-case-active/SKILL.md` 及其 evals/fixtures；`packages/assets/skills/workloom-case-archived/SKILL.md` 及其 evals/fixtures；`packages/assets/skills/workloom-continue/SKILL.md`；`packages/assets/skills/workloom-finish/SKILL.md`；`packages/assets/templates/case-result.md`；`packages/assets/test/case-templates.test.js`。
- Edit:
  ```text
  输入：当前任务或归档重建任务、CASE 文档、实际执行结果。
  输出：一致的 CASE 使用规则与评测预期。

  所有入口：
    删除用户批准 caseHash、expectedCaseHash、confirm CASE 的要求。
    主会话复核后直接续接 designSession 执行。
    删除旧结果复用和批量审批包规则。
    归档原始字节清单继续保留，不与文档确认混用。

  case-result.md：
    删除 front-matter 的 caseHash。
    保留 codeBaseline/codeFingerprint 作为当次代码证据。

  continue/finish：
    按 case.md、designSession 和实际 RESULT 路由与收尾。
    不再读取 case.result 或 resultHash。

  评测：
    将“等待用户批准”的预期改为“主会话复核后执行”。
    删除夹具中的 prdHash、caseHash、confirmedAt 等旧确认输入。
  ```
- Verify: 在 `case-templates.test.js` 中解析 RESULT front-matter 的键集合，并用完整结构断言确认 `caseHash` 键不存在；随后在 `packages/assets` 运行 `node --test test/case-templates.test.js`，在 `packages/core` 重跑 `node --test test/contract-asset.test.js`。预期这些检查通过，技能不再包含 CASE 用户确认指令。本步完成后，adapter-dsh 的 CASE 旧技能断言可能暂时失败，由步骤 6 同步修复。

#### 步骤 6 同步 DSH adapter

- Covers: AC1, AC3, AC4
- Target: `packages/adapter-dsh/src/tasks.ts` 的 align/case schema 与参数透传；`packages/adapter-dsh/src/executor.ts` 的 stale 分支；`packages/adapter-dsh/src/executor-schema.ts` 的 purpose 描述引用；`packages/adapter-dsh/test/tasks.test.js`、`case.test.js`、`case-executor.test.js`、`executor.test.js`、`skills.test.js`。
- Edit:
  ```text
  输入：core 的新工具参数与 CASE 执行规则。
  输出：DSH 工具 schema、主会话限制和派发行为。

  align 增加可选 target=prd|plan，删除 expectedPrdHash。
  case 只接受 action=review，删除 expectedCaseHash、summary 和 confirm 分支。
  删除 stale-alignment 阻断、staleMissing 与 stale_alignment override。
  保留 PRD/PLAN 确认只能由主会话调用的限制。
  CASE review 可继续限制在主会话，执行授权由主会话派发动作表达。
  更新测试为完整结构缺席断言，不用裸子串判断参数已删除。
  ```
- Verify: 先运行 `pnpm --filter @workloom-ai/core build`，再在 `packages/adapter-dsh` 运行 `pnpm test`。该命令会先重建 adapter-dsh 的 dist，再运行全部测试。预期全部通过，类型引用的 core 导出与新 schema 一致。

#### 步骤 7 同步 Pi adapter

- Covers: AC1, AC3, AC4
- Target: `packages/adapter-pi/src/tasks.ts` 的 align/case schema 与透传；`packages/adapter-pi/src/executor.ts` 的 stale 与 force 聚合；`packages/adapter-pi/src/agent-definitions.ts` 的 check 角色文案；`packages/adapter-pi/test/tasks.test.ts`、`case.test.ts`、`case-executor.test.ts`、`case-executor-forward.test.ts`、`executor.test.ts`、`skills.test.ts`。
- Edit:
  ```text
  输入：与 DSH 相同的 core 工具接口和资产内容。
  输出：Pi 工具 schema、角色提示和派发行为。

  同步 target=prd|plan，删除两个文档哈希参数。
  CASE 工具只保留 review，删除 confirm 透传。
  删除 staleMissing、stale_alignment 及相关 force 聚合。
  check 角色改为“主会话复核 CASE 后用 purpose=execution 执行”。
  重新生成 adapter-pi/skills，再运行测试，避免旧构建产物干扰结果。
  ```
- Verify: 运行 `pnpm --filter @workloom-ai/adapter-pi build`，再在 `packages/adapter-pi` 运行 `bun test test/*.test.ts`。预期全部通过。

#### 步骤 8 重建产物并执行全量验证

- Covers: AC1, AC2, AC3, AC4, AC5, AC6
- Target: `packages/core/dist/`、`packages/adapter-dsh/dist/` 的生成产物；所有修改过的源码、资产和测试文件。
- Edit:
  ```text
  输入：全部源码、资产、模板和测试修改。
  输出：与源码一致的构建产物和完整验证报告。

  不手工修改 dist。
  依次执行 lint、typecheck、build 和各包测试。
  检查没有源码仍读取旧确认哈希或旧 CASE 确认字段。
  检查历史归档文件未被修改。
  若验证失败，回到所属步骤修复，并重跑该步骤及全量验证。
  ```
- Verify: 在仓库根目录运行 `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`；随后运行 core 与 adapter-dsh 的 `node --test test/*.test.js`，以及 adapter-pi 的 `bun test test/*.test.ts`。预期所有命令退出码为 0，LSP 对修改过的 TS 文件无诊断错误，git 差异包含同步后的 dist。
