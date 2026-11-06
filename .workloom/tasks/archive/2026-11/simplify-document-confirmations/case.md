---
version: 1
task: tasks/11-06-simplify-document-confirmations
---

# CASE: 简化 workloom 人工确认流程

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `workloom/11-06-simplify-document-confirmations @ .workloom/worktree/11-06-simplify-document-confirmations（base main）`
- Source task: `none`

## Scope

- Requirements: `R1–R9`
- Acceptance criteria: `AC1–AC6`
- Out of scope:
  - PRD 模板与业界格式改造、PLAN 伪代码编写规范，均属后续子任务；本任务只验证确认机制。
  - 前端 UI 与浏览器验证：本任务不改前端，不产生 UI Design 要求。
  - 归档任务内容迁移或重写：只验证正常、补充 CASE、归档重建三个入口规则一致，不改写任何归档目录。
  - DSH/Pi profile 的依赖锁更新、宿主重启与线上部署：只核对源码、dist 与 Pi 构建副本同步。
  - 对“用户 CASE 确认”本身做真实用户评测：本任务明确取消该步骤，C3/C7 用服务行为与适配层测试证明不再依赖它。

## Static Review

### SR1 对齐门禁与文档哈希删除

- Covers: `AC1, AC2`
- Target: `packages/core/src/domain/alignment.js#evaluateAlignmentGate`
- Checks:
  1. 文件不再导出 `normalizeContentEol`、`computeContentHash`、`normalizePrdEol`、`computePrdHash` 与 `ALIGNMENT_STALE`；`findOpenNodeState` 与 `ALIGNMENT_MISSING` 保留。
  2. `evaluateAlignmentGate(status, alignment)` 只有两个参数；`GATED_STATUSES` 内 `alignment === null` 时返回 `[ALIGNMENT_MISSING]`，有记录返回 `[]`，不再读取任何文档内容或哈希。
  3. `ALIGNMENT_MISSING` 文案只表达“PRD 内容尚未确认”，不含 hash、stale、re-confirm 失效等旧措辞；in_progress 无记录维持放行。
  4. 旧的 `grilling` 等历史字段不被读取，也不被映射进对齐门禁。
- Expected: 两参调用可通过；源码不存在哈希计算与 stale 判定；确认后修改 prd.md 不再产生门禁缺失项（C2 端到端钉死）。

### SR2 启动门禁的 PRD/PLAN 两次内容确认

- Covers: `AC1, AC2`
- Target: `packages/core/src/domain/task-gates.js#evaluateStartGate`
- Checks:
  1. 完整非容器任务在 `inspectPlanStructure` 之后检查 `task.planConfirmation`，缺失追加 `PLAN_NOT_CONFIRMED`（新导出常量，文案含 plan.md 内容未确认与 confirm 指引），检查顺序固定为 PRD 结构 → PLAN 结构 → PLAN 确认 → PRD 确认。
  2. 容器任务（`children` 非空）与轻量任务不要求 `planConfirmation`；轻量任务仍跳过 alignment 与双 jsonl，其余轻量语义不变。
  3. `evaluateStaleAlignmentGate`、`GATES.STALE_ALIGN`、`GATE_TOOLS.stale_alignment` 删除；其余 `GATES` 值与工具映射保持；`evaluateAlignmentGate` 调用改为两参。
  4. `inspectPlanStructure` 的 H1、`## Steps`、步骤四要素与 AC 覆盖检查保持不变（PLAN 结构错误与未确认错误可区分）。
- Expected: 结构合格但未确认 PLAN 时 start 缺失项恰含 `PLAN_NOT_CONFIRMED`；两份确认齐全后缺失项为空（C2 验证）。

### SR3 任务记录写口与旧字段兼容

- Covers: `AC1, AC2, AC3`
- Target: `packages/core/src/domain/task-store.js#recordPlanConfirmation`
- Checks:
  1. `normalizeTaskRecord` 为旧记录补 `planConfirmation: null`；`alignment` 旧 `prdHash` 等历史字段原样保留、不驱动新逻辑；新建的 CASE 记录只含 `required` 与 `designSession`，既有任务的旧 `confirmedAt`/`caseHash`/`summary`/`result` 字段原样保留、可读作历史，但任何新门禁、执行、结果校验与复用逻辑都不得读取它们（与旧 `grilling` 字段同策）。
  2. `recordAlignmentCredential` 入参只有 `{summary}`；删除 prdHash 校验与同 hash 幂等早退；每次 confirm 刷新 `passedAt`；completed 拒绝；仍用原子写。
  3. 新增 `recordPlanConfirmation(root, taskRelPath, {summary})`：拒绝 completed、summary 非空、要求 `task.alignment !== null`（PRD 未确认时拒绝并给出先确认 PRD 的指引），写入 `planConfirmation = { passedAt, summary }`，原子写，失败零写入。
  4. 删除 `recordCaseConfirmation` 与 `task.case.result`/`resultHash` 写入；check、archive 的 stale 分支与 `STALE_ALIGN` override 留痕删除；旧 overrides 里的 `stale_alignment` 值保持可读、不参与新判断；check/archive 的 CASE 硬门禁不可 force 的语义保留。
- Expected: 两类确认记录键集合恰为 `['passedAt','summary']`；新建 CASE 记录只含 `required`/`designSession`，旧 CASE 字段原样保留可读但从不参与新判断；确认后改文档不会触发写口或门禁的哈希比较；旧记录读取不报错、不迁移。

### SR4 任务记录类型锚点

- Covers: `AC1, AC2, AC3`
- Target: `packages/core/src/domain/task-store.d.ts#TaskRecord`
- Checks:
  1. `TaskAlignmentRecord` 只含 `passedAt` 与 `summary`；新增 `TaskPlanConfirmationRecord` 与 `TaskRecord.planConfirmation`。
  2. `TaskCaseRecord` 只含 `required` 与 `designSession`；删除 `TaskCaseResultRecord`、`CaseConfirmationInput`、`recordCaseConfirmation` 声明以及 `confirmedAt`/`caseHash`/`summary`/`result` 类型字段；既有任务的旧字段不以类型字段暴露，但运行时读取与写回时原样保留、不迁移。
  3. `AlignmentCredentialInput` 删除 `prdHash`；新增 `recordPlanConfirmation` 与入参类型声明。
  4. 手写 d.ts 仍作为 dist 类型锚点，构建脚本覆盖后与 `dist/domain/*.d.ts` 逐字一致；旧字段不再以必需属性出现。
- Expected: `pnpm -r typecheck` 无错、`dist-dts` 测试通过；类型面没有任何哈希确认参数。

### SR5 align 服务支持 target=prd|plan

- Covers: `AC1, AC2`
- Target: `packages/core/src/service/alignment-service.ts#executeAlignTask`
- Checks:
  1. `ExecuteAlignTaskParams` 增加 `target?: 'prd' | 'plan'`（缺省 `prd`），删除 `expectedPrdHash`；review 结果删除 `prdHash`，保留内容快照、结构诊断、`readyToConfirm` 与既有确认记录。
  2. `target=plan` 的 review 读取 prd.md 与 plan.md，复用 `inspectPlanStructure` 返回全部结构问题；plan 缺失或结构不合格时 `readyToConfirm=false`。
  3. `target=plan` 的 confirm 顺序固定：结构 blocker 聚合拒绝 → summary 非空 → PRD 确认已存在（否则明确拒绝并指引先确认 PRD）→ `recordPlanConfirmation`；`target=prd` 的 confirm 只做 PRD 结构校验与 summary 校验后调用窄写口。
  4. 任一失败零写入；completed 拒绝；每次确认刷新记录，不做“同内容幂等”早退。
- Expected: PRD 未确认时 PLAN 确认被拒且 `planConfirmation` 保持 null；PRD 确认后 PLAN 确认成功；review/confirm 结果不含任何哈希字段（C2 验证）。

### SR6 CASE 执行门禁、结果校验与旧结果复用删除

- Covers: `AC1, AC3, AC5`
- Target: `packages/core/src/domain/case.js#evaluateCaseExecutionGate`
- Checks:
  1. 删除 `computeCaseHash` 及对 alignment 哈希工具的 import；`createCaseRecord` 只返回 `required` 与 `designSession`。
  2. `evaluateCaseExecutionGate` 只检查：`required === true` → case.md 存在 → `designSession` 非空；删除确认记录与哈希分支。
  3. RESULT 校验删除 `meta.caseHash` 比对、`task.case.result`、`resultHash` 与 `requireResultRecord`；保留 version/task/status/startedAt/completedAt、`checkSession` 会话链、SR/C 全集、证据路径、覆盖率、标准验证与 Open issues 校验。
  4. CASE 结构校验保留 References/Scope/Static Review/Runtime Cases/Coverage/Traceability、changedFiles 的 SR 覆盖规则与 Exclusions 规则；`CASE_STRUCTURE` 字段集合与模板一致。
- Expected: 不含 `caseHash` 的合法 RESULT 可通过结构校验；designSession 缺失或会话链断裂仍报错；新设计执行不需要任何确认凭证（C3/C5 验证）。

### SR7 CASE 服务退化为 review-only

- Covers: `AC1, AC3`
- Target: `packages/core/src/service/case-service.ts#executeTaskCase`
- Checks:
  1. `ExecuteTaskCaseParams` 只保留 `action: 'review'` 与可选 `taskPath`；删除 confirm 分支、`expectedCaseHash`、`summary` 与确认结果类型。
  2. review 返回 case 内容、`structureIssues`、`blockers`/`readyForExecution`、当前 `designSession` 与既有 case 记录；不计算或返回 `caseHash`，不写 task.json。
  3. 结构问题聚合、changedFiles 传参与 prd.md 缺失处理维持原 review 语义；主会话限制留给 adapter。
- Expected: 传入 confirm 被 schema 或服务明确拒绝；review 零写盘；task.json 不出现复核时间、摘要或指纹（C3 验证）。

### SR8 执行注入不再追加确认哈希

- Covers: `AC1, AC3`
- Target: `packages/core/src/domain/executor-context.js#buildExecutorIncrementalPrompt`
- Checks:
  1. execution 轮仍先调用 `evaluateCaseExecutionGate`，缺失项时抛 `CASE execution rejected: ...`。
  2. 删除读取 `task.case.caseHash` 与 `Confirmed CASE hash:` 追加行；普通续接只返回本轮指令文本。
  3. `inlineCurrentCase` 的 execution 前置保留；首次派发、故障转移与 reinject 仍全量注入 CASE 与模板；case-design 轮不校验执行前置。
- Expected: 增量文本不含确认哈希；无确认记录但 designSession 有效时可续接（C3 验证）。

### SR9 工具面文案与参数

- Covers: `AC1, AC2`
- Target: `packages/core/src/surface.ts#PARAM_DESCRIPTIONS`
- Checks:
  1. `TOOL_DESCRIPTIONS.taskStart` 改为要求 PRD 与 PLAN 两份内容确认；`taskAlign` 改为 review 内容诊断、confirm 只传 summary 并支持 target；`taskCase` 只有 review。
  2. `TOOL_SNIPPETS` 与 `PARAM_DESCRIPTIONS` 删除 `expectedPrdHash`、`expectedCaseHash`、`caseSummary`，新增 `target` 与 PLAN 确认摘要文案；`TOOL_NAMES` 与十二个工具数量不变。
  3. `executorPurpose` 描述改为“主会话复核 CASE 后执行”，不再提 confirmed CASE 或哈希。
  4. `surface.test.js` 的键对齐与非空断言同步更新，且不通过删除断言规避。
- Expected: 工具面不存在哈希确认参数；描述与核心行为一致（C1 运行时断言）。

### SR10 core 公开导出收敛

- Covers: `AC1`
- Target: `packages/core/src/index.ts#exports`
- Checks:
  1. 删除 `computeContentHash`、`computePrdHash`、`normalizeContentEol`、`normalizePrdEol`、`computeCaseHash`、`ALIGNMENT_STALE`、`evaluateStaleAlignmentGate`、`recordCaseConfirmation` 导出。
  2. 新增 `recordPlanConfirmation` 与 `TaskPlanConfirmationRecord` 类型导出；CASE 类型收窄为 required/designSession。
  3. 其余导出保持不变；core 不 import assets，公开面不暴露内部哈希工具。
- Expected: 动态导入 dist 时被删名字均为 undefined、`recordPlanConfirmation` 为函数（C1 验证）；typecheck 通过。

### SR11 主 workflow 两次内容确认、CASE 直接执行与异常决策

- Covers: `AC1, AC2, AC4, AC6`
- Target: `packages/assets/workflow/workflow.md#1.1-1.4-2.2-2.3-norms`
- Checks:
  1. 1.1 收敛顺序改为：frontier 空 → 定稿 PRD → review 内容诊断 → 展示 PRD 内容请用户确认 → `align target=prd confirm`（只传 summary）→ 再进入 1.2 调研与 PLAN 编写；删除“不得在此确认 PRD”“唯一确认在 1.4”“author neither”“expectedPrdHash”“same-hash 幂等”等旧规则。
  2. 1.4 的唯一用户确认变为 PLAN 内容确认：展示 PLAN 内容、`align target=plan confirm`、再 `task_start`；删除单包复核、PRD hash 与 stage-wise 逃生舱描述。
  3. 2.2/2.3 删除用户 CASE 确认、caseHash 失效、批量确认包与旧结果复用；改为主会话对照 PRD、PLAN 与实际代码复核后直接续接同一 `case.designSession` 执行；CASE 失败清单改为实际 RESULT、会话链、证据与覆盖率类失败。
  4. norms 的 CASE 段与 2.2/2.3 一致；新增“用户主动提出明确变更时该消息即视为内容确认，更新受影响 PRD 或 PLAN 后继续、不要求二次确认”的决策规则；系统发现的阻塞、范围或验收基线变化仍集中提问（保留 2.1 末尾逐字句）。
  5. `version: 25`、states 与 `####` 步骤集合/顺序不变；`Load in layers...` 句与 2.1 末尾主会话处置句逐字保留。
- Expected: `contract-asset.test.js` 与 `protocol.test.js` 通过；文本测试可定位两次内容确认、无 CASE 用户确认与 R9 规则（C6 验证）。

### SR12 alignment 技能改为内容确认协议

- Covers: `AC1, AC2, AC6`
- Target: `packages/assets/skills/workloom-alignment/SKILL.md#whole-file`
- Checks:
  1. 收敛协议改为两次内容确认：PRD 定稿后确认（target=prd），PLAN 复核后确认（target=plan，要求 PRD 已确认）。
  2. 删除 SHA-256/hash/`expectedPrdHash`/同 hash 幂等/stale 重入措辞；review 只返回内容诊断，confirm 只传 summary。
  3. 用户主动提出的明确变更视为变更内容确认，更新 PRD 或 PLAN 后继续；系统发现的阻塞或歧义仍集中提问。
  4. 完成判据改为两次内容确认且 PLAN 确认后启动；英文正文无 CJK。
- Expected: 关键短语命中；无任何哈希确认语句（C4/C6 验证）。

### SR13 CASE 主技能取消用户确认与旧结果复用

- Covers: `AC1, AC3, AC4`
- Target: `packages/assets/skills/workloom-case-active/SKILL.md#whole-file`
- Checks:
  1. 边界移除用户 CASE 确认、caseHash、批量审批包与旧结果复用规则；保留 planning/in_progress full 任务与 legacy 迁移边界。
  2. 设计步骤：主会话对照 PRD、PLAN 与实际代码复核 CASE，结构诊断通过后直接续接同一 `designSession` 以 `purpose: execution` 执行；不写复核时间、摘要或内容指纹。
  3. 每次执行都生成新的实际结果与证据，不复用旧 RESULT；`codeFingerprint` 只作为当次代码证据，不作为复用或确认判据。
  4. PRD/PLAN 的两次内容确认与正常流程同构；不复制模板；英文正文无 CJK。
- Expected: 正文无 caseHash 与用户批准要求；关键短语命中（C4 验证）。

### SR14 归档重建入口与正常流程同构

- Covers: `AC1, AC4`
- Target: `packages/assets/skills/workloom-case-archived/SKILL.md#whole-file`
- Checks:
  1. 重建任务遵守同一规则：PRD 内容确认一次、PLAN 内容确认一次、CASE 主会话复核后直接执行；删除“用户批准当前 caseHash”“Phase 1.4 也需 caseHash 批准”。
  2. “不复用旧 alignment hash”改写为“不复用历史确认记录”；归档原始字节清单保留，且与文档确认语义区分。
  3. 不修改归档原任务，新任务独立生命周期。
- Expected: 入口规则与 case-active 一致；无哈希或用户 CASE 确认（C4 验证）。

### SR15 CASE 结果模板删除 caseHash

- Covers: `AC5`
- Target: `packages/assets/templates/case-result.md#frontmatter`
- Checks:
  1. front-matter 删除 `caseHash` 键，保留 `version`、`task`、`codeBaseline`、`checkSession`、`status`、`startedAt`、`completedAt`。
  2. `codeBaseline` 仍要求写入 `codeFingerprint=<64-hex>` 作为当次代码证据；正文结构与章节不变。
  3. 模板不出现复核时间、摘要或内容指纹等确认凭证字段。
- Expected: YAML 可解析且键集合恰为七项；`caseHash` 不在键集合中（C5 验证）。

### SR16 结果模板结构测试

- Covers: `AC5`
- Target: `packages/assets/test/case-templates.test.js#whole-file`
- Checks:
  1. 新增结构化断言：解析 RESULT front-matter，键集合精确等于预期且不含 `caseHash`，不用裸子串判断代替。
  2. 保留 case.md 与 case-result.md 的章节断言与结尾换行断言。
  3. 测试不依赖网络与任务目录外副作用。
- Expected: `node --test test/case-templates.test.js` 通过；模板回退加回 `caseHash` 时测试转红。

### SR17 DSH align/case 工具 schema

- Covers: `AC1, AC3`
- Target: `packages/adapter-dsh/src/tasks.ts#taskAlign-taskCase`
- Checks:
  1. align schema 增加可选 `target`（enum `prd`/`plan`），删除 `expectedPrdHash`，透传包含 target。
  2. case schema 只保留 `action=review`，删除 `expectedCaseHash`、`summary` 与 confirm 分支；工具描述不再提用户批准或哈希。
  3. 主会话限制（delegationDepth 拒绝子代理）保留；错误与成功结果透传不变。
- Expected: adapter 测试通过；schema 无哈希参数，case 无 confirm 动作（C7 验证）。

### SR18 DSH 派发删除 stale 对齐门禁

- Covers: `AC1, AC2`
- Target: `packages/adapter-dsh/src/executor.ts#stale-alignment`
- Checks:
  1. 删除 `evaluateStaleAlignmentGate` 等被移除导出的 import、派发前 stale 求值与 `stale_alignment` override 留痕。
  2. `staleMissing` 变量与相关分支删除，不留死代码；其余 force 审计（冲突、start/check/archive 等门禁）保留。
  3. 派发不再因 PRD 内容变化阻断。
- Expected: typecheck 通过、executor 测试通过；源码无 stale 引用（C7 验证）。

### SR19 DSH purpose 描述同步

- Covers: `AC1, AC3`
- Target: `packages/adapter-dsh/src/executor-schema.ts#purpose`
- Checks:
  1. purpose 描述引用 core 新文案（复核后执行），不再说明 confirmed CASE 或哈希。
  2. purpose 枚举仍为 `case-design` 与 `execution`；其余 schema 不变。
- Expected: 无自有确认文案；typecheck 与 executor 测试通过。

### SR20 Pi align/case 工具 schema

- Covers: `AC1, AC3`
- Target: `packages/adapter-pi/src/tasks.ts#TASK_ALIGN_PARAMS`
- Checks:
  1. `TASK_ALIGN_PARAMS` 增加 `target`、删除 `expectedPrdHash`，透传同步。
  2. `TASK_CASE_PARAMS` 只有 `review`，删除 `expectedCaseHash`、`summary` 与 confirm 透传。
  3. 主会话限制与错误透传保持不变。
- Expected: Pi 测试通过；schema 无哈希参数（C7 验证）。

### SR21 Pi 派发删除 stale 对齐门禁

- Covers: `AC1, AC2`
- Target: `packages/adapter-pi/src/executor.ts#stale-alignment`
- Checks:
  1. 删除 stale 求值、`staleMissing`、`recordForceOverrides` 的 stale 入参与 `GATES.STALE_ALIGN` 留痕。
  2. purpose 描述引用 core 新文案，purpose 行为不变。
  3. 其余 force 聚合（冲突、light）保持。
- Expected: Pi 测试通过；源码无 stale 引用（C7 验证）。

### SR22 Pi check 角色文案

- Covers: `AC1, AC3`
- Target: `packages/adapter-pi/src/agent-definitions.ts#check-role`
- Checks:
  1. check 角色 prompt 改为“主会话复核 CASE 后用 `purpose: execution` 执行”，不再写 confirmed CASE 或哈希。
  2. 角色名、工具白名单与其余文案不变。
- Expected: `agents.test.ts` 通过；角色文案与 workflow 2.3 的新纪律一致。

### SR23 启动工具注释与新启动条件同步

- Covers: `AC1, AC2`
- Target: `packages/core/src/service/task-ops.ts#executeStartTask`
- Checks:
  1. `executeStartTask` 的 JSDoc 硬阻断清单更新为：prd 小节未填、PLAN 结构/确认缺失、jsonl 无有效记录、PRD 内容未确认；不再出现“凭据 stale”“hash”“expectedPrdHash”等旧语义。
  2. 注释描述的条件与 `evaluateStartGate` 的实际顺序和语义一致（PRD 结构 → PLAN 结构 → PLAN 内容确认 → PRD 内容确认），并与 workflow 1.4 的启动条件一致。
  3. 该文件只有注释变更：`executeStartTask`/`executeStartInternal` 的参数、错误透传、force 行为与 callers 不变；不 import 已删除的哈希或 stale 导出。
  4. typecheck 通过；启动行为由 C2 端到端验证，注释不作为行为证据。
- Expected: 注释与新启动门禁一致、无 stale 或哈希表述；服务行为不变（C2 验证）。

## Runtime Cases

以下命令都在实施完成、主会话确认没有未完成实现派发之后执行。固定变量：

```bash
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
WT="$REPO/.workloom/worktree/11-06-simplify-document-confirmations"
TASK="$REPO/.workloom/tasks/11-06-simplify-document-confirmations"
```

所有源码、构建与测试命令在 `$WT` 执行；CASE 证据与覆盖率写入 `$TASK`。

### C1 全量门禁、产物重建与生产面哈希参数缺席扫描

- Covers: `AC1, AC2, AC5`
- Preconditions:
  1. 实施完成且没有并行构建或测试进程；`$WT` 的依赖已按 worktree 配方准备，`$TASK/coverage` 与 `$TASK/case-evidence` 可写。
  2. `node --version` 为 v24（内置 `--experimental-test-coverage` 与 lcov reporter），`pnpm` 与 `bun` 可用。
- Steps:
  1. 运行 `cd "$WT" && pnpm lint && pnpm -r typecheck && pnpm -r build`，保存完整输出与退出码。
  2. 运行 `cd "$WT/packages/core" && node --test 'test/*.test.js'`，保存通过/失败统计。
  3. 运行内联 Node 扫描脚本（剥离 `//` 与 `/* */` 注释后匹配）：扫描范围 `packages/core/src`、`packages/assets/workflow`、`packages/assets/skills`、`packages/assets/templates`、`packages/adapter-dsh/src`、`packages/adapter-pi/src`；断言 `expectedPrdHash|expectedCaseHash|computePrdHash|computeCaseHash|computeContentHash|normalizePrdEol|normalizeContentEol|ALIGNMENT_STALE|evaluateStaleAlignmentGate|recordCaseConfirmation` 命中数为 0，属性访问 `\.(prdHash|caseHash|resultHash)\b` 命中数为 0。
  4. 同一脚本断言资产文本（workflow、skills、`case-result.md`）不含 `caseHash|expectedCaseHash|expectedPrdHash`，并确认 `codeFingerprint` 仍只作为当次代码证据出现。
  5. 动态导入 `file://$WT/packages/core/dist/index.js`：断言 `computeContentHash`、`computePrdHash`、`computeCaseHash`、`evaluateStaleAlignmentGate`、`recordCaseConfirmation`、`ALIGNMENT_STALE` 均为 `undefined`，`recordPlanConfirmation` 为 `function`；断言 `PARAM_DESCRIPTIONS` 与 `TOOL_SNIPPETS` 都没有 `expectedPrdHash`/`expectedCaseHash` 键，align 速览含 `target`。
  6. 运行 Coverage 中的聚合命令，生成 `coverage/lcov-core.info`、`coverage/summary.txt`、`coverage/coverage-test.log`，并按实际 changed 文件计算 Overall lines。
- Expected:
  1. lint、typecheck、build 三条命令退出码均为 0；core 全套测试通过，没有跳过确认相关用例。
  2. 生产面哈希参数与旧导出命中数为 0；资产文本无确认哈希；公开面只剩 `recordPlanConfirmation` 等新接口。
  3. 覆盖率成功生成；变更的 core 可执行文件都在 lcov 中有记录，Overall lines 可复算。
- Evidence:
  - `case-evidence/c1-gates.txt`
  - `case-evidence/c1-absence-scan.txt`
  - `coverage/lcov-core.info`
  - `coverage/summary.txt`
  - `coverage/coverage-test.log`
- Cleanup: `none`

### C2 PRD 与 PLAN 分阶段内容确认和启动门禁

- Covers: `AC2`
- Preconditions:
  1. C1 已通过，`$WT/packages/core/dist` 为最新构建。
  2. 临时项目根由脚本 `mkdtempSync` 创建并在 finally 删除；不需要用户输入，也不读取真实任务记录。
- Steps:
  1. 内联 Node 脚本创建临时根，`initWorkloom(root)` 后写 `config.local.json` 关闭 worktree。
  2. `executeCreateTask(root, 'probe', { title: 'Staged Confirmation Probe', package: 'repo' })` 建完整任务；覆写合法 prd.md（H1、Goal、Requirements、Acceptance Criteria 含 AC1、Notes、`<!-- workloom:open-nodes=none -->`）、plan.md（H1、`## Steps`、`#### 步骤 1 探针` 与 Covers/Target/Edit/Verify 四要素且 Covers 含 AC1）和两个各含一条真实记录的 jsonl。
  3. 调用 `executeStartTask`，断言失败消息同时出现 PRD 内容未确认与 PLAN 内容未确认两类缺失。
  4. 调用 `executeAlignTask({ action: 'review' })`，断言 `readyToConfirm === true`，且结果对象的完整键集合不含 `prdHash`。
  5. 调用 `executeAlignTask({ action: 'confirm', summary: 'PRD 内容确认：…' })`，断言成功；读 task.json，断言 `alignment` 键集合恰为 `['passedAt','summary']`、`passedAt` 非空、无 `prdHash`。
  6. 再次 `executeStartTask`，断言缺失项只含 PLAN 内容未确认，不再含 PRD 项。
  7. 另建一个任务，只写合法 PRD/PLAN 且不做任何确认；调用 `executeAlignTask({ target: 'plan', action: 'confirm', summary: '…' })`，断言失败、错误提示先确认 PRD，且 task.json 没有 `planConfirmation`。
  8. 对步骤 5 的任务调用 `executeAlignTask({ target: 'plan', action: 'confirm', summary: 'PLAN 内容确认：…' })`，断言成功；读 task.json，断言 `planConfirmation` 键集合恰为 `['passedAt','summary']`、无哈希字段。
  9. 在已确认的 prd.md 与 plan.md 末尾各追加一句说明（保持结构合法），再次 `executeStartTask`，断言成功且 status 为 `in_progress`，没有 stale 或哈希类错误。
  10. 清理临时根并断言无残留。
- Expected:
  1. 确认前 start 同时报告 PRD 与 PLAN 两项内容确认缺失；PRD 确认后只报告 PLAN；PLAN 确认后 start 通过。
  2. PRD 未确认时 PLAN 确认被拒且零写入；两份确认记录只含 `passedAt` 与 `summary`。
  3. 确认后修改文档仍能启动，证明失效判断不再依赖文档哈希。
- Evidence:
  - `case-evidence/c2-staged-confirmation.txt`
- Cleanup: 脚本 finally 删除临时根；`/tmp` 无残留探针目录。

### C3 无用户确认、无复核凭证时 CASE 直接执行

- Covers: `AC3`
- Preconditions:
  1. C1 已通过，core dist 可用；临时项目根由脚本自建自删。
  2. 不写入任何 CASE 确认时间、摘要或内容指纹；不模拟用户批准消息。
- Steps:
  1. 建临时完整任务，写合法 PRD/PLAN/jsonl，确认 PRD 与 PLAN 后 start 到 in_progress。
  2. 写结构完整的最小 case.md（front-matter `version: 1` 与 `task: tasks/<probe>`，含 References/Scope/Static Review/Runtime Cases/Coverage/Traceability 六章节与至少一个 SR 和一个 C 条目）。
  3. 调用 `recordExecutorDispatch(root, rel, { kind: 'check', purpose: 'case-design', title: 'probe case design', childId: 'probe-design-session' })` 记录设计会话；读 task.json 断言 `case.designSession === 'probe-design-session'`，且首次新建的 case 记录键集合为 `['required','designSession']`、不含 `confirmedAt`/`caseHash`/`summary`/`result`。
  4. 直接把 task.json 写成 `case.required = true`（不写任何确认字段）后 `readTask`；断言 `evaluateCaseExecutionGate(root, rel, task)` 返回 `[]`。
  5. 调用 `buildExecutorIncrementalPrompt({ root, taskRelPath, kind: 'check', purpose: 'execution', userPrompt: 'run the reviewed CASE' })`，断言返回文本等于 userPrompt，且不含 `Confirmed CASE hash` 或 `caseHash`。
  6. 调用 `buildExecutorPrompt({ root, taskRelPath, kind: 'check', purpose: 'execution', userPrompt: 'probe', caseTemplates: [] })`，断言 err 为 null、文本包含 case.md 正文、不含确认哈希行。
  7. 负面对照：把 `designSession` 置空后重复 gate，断言返回项包含 designSession 缺失；恢复后删除 case.md，断言返回 case.md 缺失。
  8. 断言 `executeTaskCase(root, 'probe', { action: 'confirm' })` 被拒绝（服务错误或 schema 不接受该动作），且 dist 没有 `recordCaseConfirmation` 导出。
  9. 清理临时根。
- Expected:
  1. 没有确认记录、没有用户确认消息时执行前置通过；增量与全量注入都不含确认哈希。
  2. designSession 缺失或 case.md 缺失仍拦截；旧确认写口与凭证字段不存在。
- Evidence:
  - `case-evidence/c3-case-execution.txt`
- Cleanup: 临时根在 finally 删除。

### C4 补充 CASE 与归档重建入口规则一致

- Covers: `AC4`
- Preconditions:
  1. C1 已通过；assets 与 adapter 构建可用。
  2. 只读最终资产，不修改归档任务。
- Steps:
  1. Node 脚本读取 `workloom-case-active` 与 `workloom-case-archived` 的 SKILL.md：断言两者都不含 `caseHash`/`expectedCaseHash`、不要求用户确认或批准 CASE；case-active 含 review → 同一 design session → execution 的关键短语；case-archived 含 PRD/PLAN 两次内容确认与归档字节清单语义。
  2. 扫描 `packages/assets/skills/**` 与 `packages/assets/workflow` 的 Markdown/JSON/fixture：断言无 `caseHash|expectedCaseHash`；`workloom-continue` 与 `workloom-finish` 不再以 `case.result`/`resultHash` 作为路由或归档前置。
  3. 断言两份技能都不含“等待新用户消息批准 CASE/hash”类语句，且都写明主会话复核后直接执行。
  4. 运行 `cd "$WT/packages/adapter-pi" && pnpm build`，再运行 `cd "$WT/packages/adapter-dsh" && node --test test/skills.test.js` 与 `cd "$WT/packages/adapter-pi" && bun test test/skills.test.ts`。
- Expected: 正常流程、补充 CASE 与归档重建三个入口规则一致，无用户 CASE 或哈希确认；两个 adapter 的技能与构建副本测试通过。
- Evidence:
  - `case-evidence/c4-case-entrypoints.txt`
- Cleanup: `none`（Pi 构建副本由构建命令重建）

### C5 结果模板、结果校验与旧结果复用移除

- Covers: `AC5`
- Preconditions:
  1. C1 已通过；`yaml` 由 core 依赖提供；临时项目根由脚本自建自删。
  2. 不执行真实 CASE，只验证模板结构与结果校验对“无 caseHash 的新结果”的接受度。
- Steps:
  1. 用 `parseYaml` 解析 `case-result.md` front-matter，断言键集合精确等于 `['version','task','codeBaseline','checkSession','status','startedAt','completedAt']`，不含 `caseHash`；断言 `codeBaseline` 占位仍含 `codeFingerprint`。
  2. 运行 `cd "$WT/packages/assets" && node --test test/case-templates.test.js`。
  3. 构造临时任务：完整任务确认 PRD/PLAN 后 start，写合法 case.md（以本 CASE 的章节与字段为蓝本，改为单 SR、单 C 的最小结构，Coverage 声明一条 Exclusions 规则），记录 designSession；再写 `case-result.md`（无 caseHash，status passed，Summary 的 Coverage 与 Coverage 状态一致且 Standard verification 为 passed，checkSession 等于 designSession，SR/C 与 CASE 全集一致，标准验证 exit 0，Coverage generated、Changed Files 为空表且 Overall lines 为 `0/0 (0%)`，Exclusions 与 CASE 逐项一致，Raw reports 指向真实文件，Open issues 为 `- none`）并创建对应 `case-evidence/` 与 `coverage/` 文件。
  4. 调用 `evaluateCaseOutcomeGate(root, rel, task, { changedFiles: [] })`（临时项目不是 git 仓库，显式传空变更集合），断言没有 `result_hash`、`result_record`、`result_record_hash`、`changed_file_unreviewed` 类问题。
  5. 负面对照：清空 designSession → 出现 `case_execution`；把 checkSession 改为未知会话 → 出现 `result_session`；删除一条证据文件 → 出现 `artifact_missing`；每次对照后恢复夹具。
  6. 构造含旧字段 `confirmedAt`/`caseHash`/`summary`/`result` 的 task.json，并填入不匹配值（如 `caseHash` 为随机 hex、`result.caseHash`/`resultHash` 与当前文档不一致）：`readTask` 后断言这些旧字段原样保留、可读作历史；随后把 `required` 置 true 且 `designSession` 保持有效，断言 `evaluateCaseExecutionGate` 仍返回 `[]`、`evaluateCaseOutcomeGate(root, rel, task, { changedFiles: [] })` 也不产生哈希或结果记录类问题；调用一次确认写口（如 `recordAlignmentCredential`）后重读 task.json，断言旧字段仍在、未被读取或清理。同时断言 dist 无 `computeCaseHash`，core/src 中无 `resultHash`/`requireResultRecord` 读取，且 skills 不含“文档哈希或指纹相等即复用旧结果”的判据。
  7. 清理临时根。
- Expected:
  1. 模板键集合无 caseHash，模板结构测试通过。
  2. 无 caseHash 的 RESULT 可通过结构校验；会话链、证据与覆盖率校验仍然生效。
  3. 旧确认/结果字段原样保留、可读作历史，但新门禁、结果校验与复用逻辑都不读取它们；新设计执行不会复用旧结果。
- Evidence:
  - `case-evidence/c5-result-template.txt`
- Cleanup: 临时根在 finally 删除。

### C6 workflow 异常决策规则文本

- Covers: `AC6`
- Preconditions:
  1. C1 已通过，workflow 与技能为最终版本。
- Steps:
  1. Node 脚本读 workflow.md：断言 2.1 末尾集中提问句逐字保留、提问四规则保留、`Load in layers...` 句逐字保留。
  2. 语义断言用户主动变更规则：小写文本同时命中“用户主动/明确变更”“该消息即确认”“更新 PRD 或 PLAN”“不再二次确认”四组关键词（允许同义表达：`counts as confirmation`、`no second confirmation`、`without asking again` 等）。
  3. 按文本位置断言 PRD 内容确认语句出现在 1.2 调研与 PLAN 编写之前，PLAN 内容确认语句出现在 `task_start` 之前。
  4. 对 alignment SKILL 与 migrate-plan SKILL 做同类“用户主动变更免二次确认”断言。
  5. 运行 `cd "$WT/packages/core" && node --test test/contract-asset.test.js test/protocol.test.js`。
- Expected: 系统发现的阻塞或基线变化仍集中提问；用户主动变更免二次确认可定位；协议版本 25、states 与步骤集合不变。
- Evidence:
  - `case-evidence/c6-workflow-rules.txt`
- Cleanup: `none`

### C7 双 adapter 工具面与派发行为一致

- Covers: `AC1, AC3, AC4`
- Preconditions:
  1. C1 已通过；两个 adapter 的依赖就绪。
  2. 允许重建 dist 与 Pi skills 构建副本，不手工编辑产物。
- Steps:
  1. 运行 `cd "$WT/packages/adapter-dsh" && pnpm test`。
  2. 运行 `cd "$WT/packages/adapter-pi" && pnpm build && bun test test/*.test.ts`。
  3. Node 脚本读取两个 adapter 的 `tasks.ts`：断言不含 `expectedPrdHash|expectedCaseHash|ALIGNMENT_STALE|evaluateStaleAlignmentGate|staleMissing|stale_alignment`；align 参数含 `target`（enum prd/plan），case 参数只有 `review`；`agent-definitions.ts` 的 check 角色写明复核后执行，且不含 confirmed/hash；以两个包的 tasks/case 测试作为 schema 与透传的运行证据。
  4. 记录 `git -C "$WT" status --short` 与 `git -C "$WT" diff --stat`，确认 dist 与 Pi skills 构建副本都由命令生成，没有手改构建产物。
- Expected:
  1. 两个 adapter 全套测试通过；工具 schema 与派发行为一致。
  2. 没有任何哈希参数或 stale 对齐阻断残留。
- Evidence:
  - `case-evidence/c7-adapters.txt`
- Cleanup: `none`

## Coverage

- Tool: `Node v24.18.1 内置 --experimental-test-coverage（lcov reporter + --enable-source-maps，dist 经 source map 归因到 src）`
- Instrumentation: `在 packages/core 跑全量 node:test 套件生成 lcov；按 Coverage Exclusions 之外的变更可执行文件聚合逐文件 LH/LF 与 Overall lines。测试、d.ts、dist、assets 与双 adapter 由运行时用例和各自包测试覆盖，不混入 core 行覆盖统计。`
- Aggregate command:
  ```bash
  set -euo pipefail
  REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
  WT="$REPO/.workloom/worktree/11-06-simplify-document-confirmations"
  TASK="$REPO/.workloom/tasks/11-06-simplify-document-confirmations"
  mkdir -p "$TASK/coverage" "$TASK/case-evidence"
  cat > "$TASK/coverage/collect-core.mjs" <<'NODE'
  import { execFileSync } from 'node:child_process'
  import { readFileSync, writeFileSync } from 'node:fs'

  const [root, lcovPath, outPath, fallbackList] = process.argv.slice(2)
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const changed = [
    ...git('diff', '--name-only', 'HEAD', '--', 'packages/core/src').split('\n'),
    ...git('ls-files', '--others', '--exclude-standard', '--', 'packages/core/src').split('\n'),
  ]
    .filter(Boolean)
    .map((path) => path.replace(/^packages\/core\//, ''))
    .filter((path) => /^src\/.+\.(js|ts)$/.test(path) && !path.endsWith('.d.ts'))
  // 实现已提交时 git 变更集合为空，回退到 SR 声明的 core 文件清单。
  const fallback = (fallbackList ?? '').split(',').filter(Boolean)
  const wanted = new Set(changed.length > 0 ? changed : fallback)
  const rows = []
  for (const block of readFileSync(lcovPath, 'utf8').split('end_of_record')) {
    const file = /^SF:(.+)$/m.exec(block)?.[1]
    if (file === undefined) continue
    if (wanted.size > 0 && !wanted.has(file)) continue
    if (wanted.size === 0 && !/^src\/.+\.(js|ts)$/.test(file)) continue
    const lf = Number(/^LF:(\d+)$/m.exec(block)?.[1] ?? 0)
    const lh = Number(/^LH:(\d+)$/m.exec(block)?.[1] ?? 0)
    rows.push({ file, lf, lh })
  }
  rows.sort((left, right) => left.file.localeCompare(right.file))
  const covered = rows.reduce((sum, row) => sum + row.lh, 0)
  const total = rows.reduce((sum, row) => sum + row.lf, 0)
  const percent = total === 0 ? 0 : (covered / total) * 100
  const body = rows
    .map((row) => `${row.file}\t${row.lh}/${row.lf}\t${row.lf === 0 ? 0 : ((row.lh / row.lf) * 100).toFixed(2)}%`)
    .join('\n')
  writeFileSync(outPath, `${body}\nOverall lines: ${covered}/${total} (${percent.toFixed(2)}%)\n`)
  console.log(`Overall lines: ${covered}/${total} (${percent.toFixed(2)}%)`)
  NODE
  (cd "$WT/packages/core" && node --enable-source-maps --experimental-test-coverage \
    --test-reporter=lcov --test 'test/*.test.js') \
    > "$TASK/coverage/lcov-core.info" 2> "$TASK/coverage/coverage-test.log"
  node "$TASK/coverage/collect-core.mjs" "$WT" "$TASK/coverage/lcov-core.info" "$TASK/coverage/summary.txt" \
    'src/domain/alignment.js,src/domain/task-gates.js,src/domain/task-store.js,src/domain/case.js,src/domain/executor-context.js,src/service/alignment-service.ts,src/service/case-service.ts,src/service/task-ops.ts,src/surface.ts,src/index.ts' \
    | tee "$TASK/case-evidence/c1-coverage.txt"
  ```
- Scope: `变更的 core 可执行源码（domain 的 .js 与 service/surface/index 的 .ts，d.ts 除外）；执行时实际的变更集合以 git 变更为准，提交后回退到 SR Target 声明的 core 文件，并在 RESULT 的 Changed Files 表逐项列出。`
- Exclusions:
  - `packages/core/src/**/*.d.ts`: 手写类型锚点无运行语句，由 typecheck 与 dist-dts 测试强制与实现一致。
  - `packages/core/test/**`: 测试代码，由 C1–C7 的真实运行覆盖。
  - `packages/core/dist/**`: tsc 构建产物，经 source map 归因到 src，不重复统计。
  - `packages/adapter-dsh/src/**`: 薄适配层，由 C7 与 SR17–SR19 覆盖，不参与 core 覆盖率聚合。
  - `packages/adapter-dsh/test/**`: 测试代码，由 C7 运行覆盖。
  - `packages/adapter-dsh/dist/**`: 构建产物，由 C1/C7 重建并核对。
  - `packages/adapter-pi/src/**`: 薄适配层，由 C7 与 SR20–SR22 覆盖，不参与 core 覆盖率聚合。
  - `packages/adapter-pi/test/**`: 测试代码，由 C7 运行覆盖。
  - `packages/adapter-pi/skills/**`: gitignored 构建副本，由 C4/C7 校验。
  - `packages/assets/**`: Markdown/JSON 契约与评测夹具，无可执行生产行，由 C2–C6 文本断言与资产测试覆盖。
- Raw outputs:
  - `coverage/lcov-core.info`
  - `coverage/summary.txt`
  - `coverage/coverage-test.log`
  - `coverage/collect-core.mjs`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3, SR4, SR5, SR6, SR7, SR8, SR9, SR10, SR11, SR12, SR13, SR14, SR17, SR18, SR19, SR20, SR21, SR22, SR23 | C1, C7 |
| AC2 | SR1, SR2, SR3, SR4, SR5, SR9, SR11, SR12, SR18, SR21, SR23 | C2 |
| AC3 | SR3, SR6, SR7, SR8, SR13, SR17, SR19, SR20, SR22 | C3, C7 |
| AC4 | SR11, SR13, SR14, SR17, SR20 | C4, C7 |
| AC5 | SR6, SR15, SR16 | C1, C5 |
| AC6 | SR11, SR12 | C6 |
