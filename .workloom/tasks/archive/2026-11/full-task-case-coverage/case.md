---
version: 1
task: tasks/11-03-full-task-case-coverage
---

# CASE: 完整任务增加 CASE 设计、执行与覆盖率

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `workloom/11-03-full-task-case-coverage @ .workloom/worktree/11-03-full-task-case-coverage（base main）`
- Source task: `none`

## Scope

- Requirements: `R1–R27`
- Acceptance criteria: `AC1–AC24`
- Out of scope:
  - `workloom-case-active 与 workloom-case-archived 两个补写技能的正文、对比页面与行为验收（后续子任务）`
  - `DSH profile 依赖锁更新、用户授权后的宿主部署与重启（本任务只核对源码与 dist 同步）`
  - `Pi 自动 failover 建设（本期保持现状，只校验无链时的同会话要求）`

## Static Review

### SR1 CASE 领域校验与生命周期

- Covers: `AC4, AC5, AC8, AC9, AC10, AC15, AC16, AC18, AC21`
- Target: `packages/core/src/domain/case.js#whole-file`
- Checks:
  1. `computeCaseHash` 先按 CRLF/CR→LF 归一，再取 SHA-256 小写 hex；CASE 与 RESULT 共用同一规则。
  2. `inspectCaseStructure` 校验 YAML、固定章节与字段、SR/C 连号、AC 溯源、父任务 PLAN 顺序，以及 git 变更文件中每个未被排除的文件都有 SR Target。
  3. `evaluateCaseExecutionGate` 拒绝未确认、摘要过期和缺 designSession；`evaluateCaseOutcomeGate` 拒绝 RESULT 元数据不符、条目未 passed、覆盖率无效、标准验证失败、Open issues 非 none、会话链断裂和证据路径缺失。
- Expected: 有效材料返回空问题数组；每类缺陷返回稳定问题码；`case-evidence/` 与 `coverage/` 路径都被限制在任务目录内。

### SR2 CASE 公共类型

- Covers: `AC4, AC5, AC8, AC10, AC16, AC21`
- Target: `packages/core/src/domain/case.d.ts#whole-file`
- Checks:
  1. `TaskCaseRecord`、`TaskCaseResultRecord`、`CasePurpose`、`CaseStructureIssue`、`CaseStructureOptions`、`CaseOutcomeOptions` 与实现返回值逐项一致。
  2. 导出七个契约数组与 `CASE_FILES`、`CASE_PURPOSES`、`CASE_MISSING` 的取值。
- Expected: `pnpm -r typecheck` 通过，两个 adapter 都只从包入口解析这些类型，无 `any` 或忽略声明。

### SR3 通用内容摘要

- Covers: `AC5, AC7, AC16, AC21`
- Target: `packages/core/src/domain/alignment.js#computeContentHash`
- Checks:
  1. 新增 `normalizeContentEol` 与 `computeContentHash`，`normalizePrdEol`、`computePrdHash` 改为共享实现的兼容包装。
  2. 同一文本 CRLF、CR、LF 三种形态摘要相同，且为 64 位小写 hex。
- Expected: 既有 alignment 测试保持通过，旧 PRD 凭据语义不变。

### SR4 摘要类型声明

- Covers: `AC5, AC16`
- Target: `packages/core/src/domain/alignment.d.ts#computeContentHash`
- Checks:
  1. 声明 `normalizeContentEol(content: string): string` 与 `computeContentHash(content: string): string`。
  2. 手写声明是 tsc 生成声明的超集，可被 `copy-domain-dts` 校验。
- Expected: `dist-dts` 测试通过，手写声明与 dist 字节一致。

### SR5 git 变更文件读取

- Covers: `AC21`
- Target: `packages/core/src/domain/git.js#gitChangedFilesSync`
- Checks:
  1. 使用 `diff --name-only --no-renames --diff-filter=d HEAD` 读取已跟踪修改并排除删除。
  2. 使用 `ls-files --others --exclude-standard` 读取未跟踪文件，合并后排序去重。
  3. git 失败返回 `[Error, null]`，不让异常穿透调用方。
- Expected: tracked、untracked、deleted 三类夹具结果确定；非 git 目录返回 Error 而不是空数组。

### SR6 PLAN 结构校验与开始条件

- Covers: `AC1`
- Target: `packages/core/src/domain/task-gates.js#inspectPlanStructure`
- Checks:
  1. `GATE_FILES` 增加 `plan`，完整实施任务在 start 前读取 `plan.md` 并执行结构校验。
  2. `children` 非空的父任务豁免 PLAN；light 任务不读取 PLAN。
  3. 每个 `#### 步骤` 块必须含 `Covers`、`Target`、`Edit`、`Verify`，且 PRD 的每个 AC 至少被一个步骤 Covers。
- Expected: 无 PLAN 的完整任务报 `plan.md is missing`；父任务与 light 放行；缺字段和漏 AC 返回 `plan_step_field`、`plan_ac_missing`。

### SR7 任务记录、purpose 与硬门禁

- Covers: `AC3, AC5, AC10, AC14, AC16, AC18, AC23`
- Target: `packages/core/src/domain/task-store.js#whole-file`
- Checks:
  1. `case` 读取归一为 `null` 或完整键对象；start 完整任务写 `required:true`，light 保持 `null`。
  2. dispatch 的 `purpose` 只接受 `case-design`、`execution`，缺省 execution；`computeTaskStage` 对 case-design 返回当前 stage。
  3. 首次 case-design 写 `designSession`，只允许同 child 续用或 fallbackOf 链替换。
  4. `recordCaseConfirmation` 校验 summary 与 caseHash、拒绝 completed、同 hash 幂等，写入确认字段并清空 result。
  5. check 与 archive 在 force 分支前调用 `evaluateCaseOutcomeGate`；check 成功写 `case.result` 三字段。
- Expected: 旧任务 `case=null` 保持原检查与归档行为；核心 CASE 问题用 force 仍被拒绝且不新增 override。

### SR8 任务记录类型

- Covers: `AC3, AC14, AC16, AC23`
- Target: `packages/core/src/domain/task-store.d.ts#whole-file`
- Checks:
  1. `DispatchPurpose`、`TaskCaseRecordCarrier`、`CaseConfirmationInput` 与实现一致。
  2. `TaskRecord.case`、`DispatchRecord.purpose`、`DispatchRecordInput` 的 Pick 键清单同步。
- Expected: typecheck 通过，`recordExecutorDispatch` 调用方无需断言即可传 purpose。

### SR9 协议版本

- Covers: `AC2`
- Target: `packages/core/src/domain/protocol.js#WORKFLOW_PROTOCOL_VERSION`
- Checks:
  1. `WORKFLOW_PROTOCOL_VERSION` 从 24 升到 25，与完整流程 front-matter 一致。
  2. 协议握手字段与容错逻辑不变，light 流程 version 保持 1。
- Expected: protocol 测试全绿，旧版本的兼容行为不变。

### SR10 CASE 注入器

- Covers: `AC3, AC5, AC23, AC24`
- Target: `packages/core/src/domain/executor-context.js#whole-file`
- Checks:
  1. check 全量注入在 PRD 块之后依次放当前 CASE 与两份模板，再进入 Pointer list；其他 kind 不注入。
  2. execution 注入前校验确认态；CASE 字节数超过 `maxArtifactBytes` 直接抛错，不截断。
  3. 新增 `buildExecutorIncrementalPrompt`，普通增量续用只追加 `Confirmed CASE hash: <hash>`。
- Expected: 首次派发、reinject、failover 共用同一全量函数；增量文本不含 CASE 全文。

### SR11 注入器类型

- Covers: `AC23, AC24`
- Target: `packages/core/src/domain/executor-context.d.ts#whole-file`
- Checks:
  1. `BuildExecutorPromptParams` 增加 `purpose` 与 `caseTemplates`，新增 `ExecutorArtifactContent`。
  2. 声明 `buildExecutorIncrementalPrompt` 的入参与返回类型。
- Expected: typecheck 通过，adapter 无需本地类型断言。

### SR12 CASE review/confirm 服务

- Covers: `AC4, AC5, AC14, AC15`
- Target: `packages/core/src/service/case-service.ts#whole-file`
- Checks:
  1. review 每次重读 PRD、CASE 与 git 变更，父任务逐个校验 children 的 PLAN 存在与顺序，只读不写。
  2. confirm 依次校验 expectedCaseHash、结构阻断项、当前 hash、summary，再经 `recordCaseConfirmation` 窄写入。
  3. 返回结构包含快照、hash、结构问题、confirmBlockers、readyToConfirm 与当前 caseRecord。
- Expected: 有效 CASE 的 review 返回 `readyToConfirm:true`；失败路径零写入；修改后旧 hash 的 confirm 被拒绝。

### SR13 旧任务迁移提示

- Covers: `AC14, AC22`
- Target: `packages/core/src/service/session-context.ts#activeTaskContext`
- Checks:
  1. 仅 `in_progress` + `full` + `case === null` 追加 `CASE migration` 提示，指向 `workloom-case-active`。
  2. 其他 status、light、已有 case 的任务不追加提示。
- Expected: 活跃旧任务快照出现迁移提示；doctor 检查类别数量不变。

### SR14 包入口导出

- Covers: `AC14, AC19, AC23, AC24`
- Target: `packages/core/src/index.ts#whole-file`
- Checks:
  1. 导出 case、alignment、git、task-store、executor-context、case-service 的新增值与类型。
  2. 值导出与类型导出分组，`verbatimModuleSyntax` 下无类型误导出。
- Expected: 两个 adapter 只从 `@workloom-ai/core` 入口即可解析全部消费符号；dist-dts 测试通过。

### SR15 工具面文案与参数

- Covers: `AC2, AC4, AC5, AC23`
- Target: `packages/core/src/surface.ts#whole-file`
- Checks:
  1. `TOOL_NAMES` 增加 `taskCase`，共 11 个工具；`TOOL_DESCRIPTIONS`、`TOOL_SNIPPETS` 增加 CASE 工具并把 taskCheck 文案改为 2.3。
  2. `PARAM_DESCRIPTIONS` 增加 caseAction、expectedCaseHash、caseSummary、executorPurpose，并保持既有参数文案不变。
- Expected: surface 测试通过，双 adapter 注册的名称、描述、参数文案与常量一致。

### SR16 DSH CASE 工具注册

- Covers: `AC4, AC5, AC15`
- Target: `packages/adapter-dsh/src/tasks.ts#caseTaskTool`
- Checks:
  1. 注册 `workloom_task_case`，参数含 action 枚举、taskPath、expectedCaseHash、summary，required 为 action。
  2. 仅主会话可调用（delegationDepth 为 0），子会话报错。
  3. 调用 `executeTaskCase` 并原样投影 review/confirm 结果。
- Expected: 工具 schema 与描述命中 surface 常量；子会话调用被拒绝。

### SR17 DSH purpose schema

- Covers: `AC3, AC23, AC24`
- Target: `packages/adapter-dsh/src/executor-schema.ts#purpose`
- Checks:
  1. `purpose` 为可选枚举 `case-design`、`execution`，描述引用 `executorPurpose`。
  2. 缺省值语义为 execution，不改变既有调用。
- Expected: schema 校验接受两种枚举与缺省，拒绝其他值。

### SR18 DSH executor 接线

- Covers: `AC3, AC16, AC23, AC24`
- Target: `packages/adapter-dsh/src/executor.ts#whole-file`
- Checks:
  1. 首次派发把 purpose 传给全量注入与 dispatch 记录；增量分支改用 `buildExecutorIncrementalPrompt`。
  2. failover context 保存首次 purpose，后续调用透传。
- Expected: case-design 保持 stage 并记录 purpose；execution 进入 check；无 purpose 时行为与旧版一致。

### SR19 DSH 模板注入

- Covers: `AC19, AC24`
- Target: `packages/adapter-dsh/src/executor-injection.ts#caseTemplates`
- Checks:
  1. 模板正文从 `@workloom-ai/assets` 的两个 loader 读取，路径固定为 `packages/assets/templates/*.md`，不复制正文到 adapter。
  2. 仅 check kind 传 `caseTemplates`；loader 返回 null 时抛错。
- Expected: check 全量注入包含两份模板全文，其他 kind 不含；模板缺失立即失败。

### SR20 DSH failover purpose

- Covers: `AC16, AC23, AC24`
- Target: `packages/adapter-dsh/src/executor-failover.ts#whole-file`
- Checks:
  1. `FailoverContext` 与失败尝试记录增加 purpose，并在注册、失败、转移路径透传。
  2. 模型故障切换仍按既有机制生成 fallbackOf 链，不复制 CASE 设计会话。
- Expected: failover 记录保留 purpose；RESULT 能据链通过公共会话校验。

### SR21 DSH failover 链记录

- Covers: `AC16, AC23`
- Target: `packages/adapter-dsh/src/executor-failover-chain.ts#whole-file`
- Checks:
  1. 每条 fallback 记录写入 `fallbackOf` 与 purpose。
  2. 链记录只追加不覆盖既有 dispatch 记录。
- Expected: `sessionChainReaches` 能沿链到达 designSession；无链的不同会话被拒绝。

### SR22 Pi CASE 工具注册

- Covers: `AC4, AC5, AC15`
- Target: `packages/adapter-pi/src/tasks.ts#executeCase`
- Checks:
  1. 新增 `TASK_CASE_PARAMS`（action/taskPath/expectedCaseHash/summary）与 `workloom_task_case` 注册。
  2. 调用 `executeTaskCase`，错误统一 `case returned no result`，返回投影与 DSH 一致。
- Expected: Pi 测试命中 schema 与 review details；参数面不出现 `fallback_models`。

### SR23 Pi executor 接线

- Covers: `AC3, AC6, AC19, AC20, AC23, AC24`
- Target: `packages/adapter-pi/src/executor.ts#whole-file`
- Checks:
  1. `EXECUTOR_PARAMS` 增加 purpose 枚举；全量注入下传 purpose 与两个模板。
  2. 增量续用使用 `buildExecutorIncrementalPrompt`，并把 purpose 写入 dispatch/续用记录。
  3. 不新增 `fallback_models` 参数或自动 failover 逻辑。
- Expected: Pi 的 case-design 保持 stage、写 designSession；execution 进入 check；模板全文只来自 assets。

### SR24 Pi 续用记录

- Covers: `AC6, AC23`
- Target: `packages/adapter-pi/src/executor-continuation.ts#whole-file`
- Checks:
  1. `RecordContinuationParams` 增加 purpose 并写入续用记录。
  2. 进程恢复后的续用保持同一 durable child session id。
- Expected: 恢复前后 childId 相同；记录保留 purpose，不伪造 fallbackOf。

### SR25 Pi dispatch 记录

- Covers: `AC3, AC6, AC23`
- Target: `packages/adapter-pi/src/executor-dispatch.ts#whole-file`
- Checks:
  1. `DispatchChildPiParams` 增加 purpose，成功与失败记录都透传。
  2. 首次 case-design 派发写 designSession，stage 不前进。
- Expected: 派发记录包含 purpose；失败记录同样保留，供恢复路由判断。

### SR26 Pi check persona

- Covers: `AC20, AC24`
- Target: `packages/adapter-pi/src/agent-definitions.ts#whole-file`
- Checks:
  1. check persona 删除与 core 重复的 P0/P1/P2 全文，只保留验证工程师身份与遵循 core 两阶段 CASE 纪律的互补句。
  2. core executor 纪律段仍是唯一规则来源。
- Expected: agents 测试通过，persona 不再复制分级规则。

### SR27 资产 loader

- Covers: `AC19`
- Target: `packages/assets/index.js#loadCaseTemplateText`
- Checks:
  1. 新增 `loadCaseTemplateText`、`loadCaseResultTemplateText`，统一走 `readAssetText`。
  2. 文件缺失返回 null，不抛错。
- Expected: assets 测试通过；两个 loader 返回以 YAML front matter 开头的完整文本。

### SR28 资产 loader 类型

- Covers: `AC19`
- Target: `packages/assets/index.d.ts#loadCaseTemplateText`
- Checks:
  1. 声明两个 loader 返回 `string | null`。
  2. 与 index.js 导出面逐项对齐。
- Expected: typecheck 通过，adapter 导入无需断言。

### SR29 CASE 模板资产

- Covers: `AC4, AC7, AC19`
- Target: `packages/assets/templates/case.md#whole-file`
- Checks:
  1. 含固定 YAML（version、task）、H1 标题与六个固定章节。
  2. SR/C 字段名与状态无关，文档不写执行状态；Traceability 表头与示例行完整。
- Expected: 模板可被 `inspectCaseStructure` 直接解析；与 core 的 `CASE_STRUCTURE.caseSections/srFields/cFields/coverageFields` 逐项一致。

### SR30 RESULT 模板资产

- Covers: `AC7, AC8, AC10, AC19`
- Target: `packages/assets/templates/case-result.md#whole-file`
- Checks:
  1. 含固定 YAML（version、task、caseHash、codeBaseline、checkSession、status、startedAt、completedAt）。
  2. 七个固定章节齐全，状态值域与 `resultStatuses`、`coverageStatuses` 一致，Open issues 在末尾。
- Expected: 与 core 常量契约测试一致，可被 `evaluateCaseOutcomeGate` 解析。

### SR31 完整流程 version 25

- Covers: `AC2, AC3, AC5, AC11, AC12, AC14, AC17, AC18`
- Target: `packages/assets/workflow/workflow.md#2.1-2.4`
- Checks:
  1. front-matter version 升到 25，完整步骤为 2.1 Implement、2.2 Design CASE、2.3 Check、2.4 Commit。
  2. 2.2 写明并行派发、purpose、designSession、审核与用户确认；2.3 保留 P0/P1/P2 定义与 force 语义，新增 CASE 硬门禁与完整重跑要求。
  3. planning/in_progress breadcrumb、principle 4 与 norms 的步骤编号同步；light 契约不改。
- Expected: contract-asset 测试命中步骤列表与正文关键句；light 流程 version 与步骤不变。

### SR32 continue 路由

- Covers: `AC2, AC5, AC14, AC22`
- Target: `packages/assets/skills/workloom-continue/SKILL.md#routing`
- Checks:
  1. 路由表区分 full 与 light，覆盖 2.1/2.2、CASE review/confirm、2.3 continuation、2.4 Commit。
  2. 旧 `in_progress` 且 `case: null` 的 full 任务指向 `workloom-case-active`。
- Expected: 技能测试与文本断言通过；迁移提示路径唯一。

### SR33 finish 路由

- Covers: `AC2, AC5, AC14`
- Target: `packages/assets/skills/workloom-finish/SKILL.md#routing`
- Checks:
  1. full 回退到 2.4 Commit，light 回退到 2.3 Commit。
  2. 归档步骤要求 CASE required 时具备有效 RESULT 与确认摘要值。
- Expected: 双轨文本各自命中，Pi 构建同步副本与 assets 一致。

### SR34 PLAN 校验类型声明

- Covers: `AC1`
- Target: `packages/core/src/domain/task-gates.d.ts#whole-file`
- Checks:
  1. 声明 `inspectPlanStructure` 的入参、返回与 `PLAN_MISSING` 常量。
  2. 与 task-gates.js 的实际导出、JSDoc 生成的 dist 声明一致。
- Expected: typecheck 与 dist-dts 测试通过，手写声明不缺失生成版导出。

## Runtime Cases

以下命令均在主仓根执行，先执行 `WT=.workloom/worktree/11-03-full-task-case-coverage`，命令中的 `$WT` 使用该变量。

### C1 PLAN 开始条件与父任务、light 豁免

- Covers: `AC1`
- Preconditions:
  1. 实施完成且 `packages/core/dist` 已重建；在仓库根执行。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test test/task-gates.test.js test/case.test.js`。
  2. 用 core 公开 API 在 `/tmp/wl-c1` 建临时项目并写合法 PRD 与 alignment 凭据：先不写 `plan.md` 调 `startTask`，记录报错；补写含 `## Steps` 和四要素步骤且覆盖全部 AC 的 `plan.md` 后再次调用。
  3. 对 `children` 非空的父任务不写 PLAN 调用；对 `mode:light` 任务不写 PLAN 调用。
- Expected:
  1. 完整实施任务无 PLAN 被拒绝，错误含 `plan.md is missing`；补 PLAN 后 start 成功。
  2. 父任务与 light 任务均成功。
  3. 测试命令 exit 0，四组结果与上述一致。
- Evidence:
  - `case-evidence/c1-start-gate.txt`
- Cleanup: 删除 `/tmp/wl-c1`

### C2 流程版本与步骤集合

- Covers: `AC2`
- Preconditions:
  1. 完整流程与协议常量已更新；assets 与 core 无未提交的生成差异。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test test/contract-asset.test.js test/protocol.test.js`。
  2. 读取 worktree 内 `packages/assets/workflow/workflow.md` 的 front-matter 与 2.x 标题。
  3. 运行 `git -C $WT diff HEAD -- packages/assets/workflow/workflow-light.md`。
- Expected:
  1. 完整步骤恰为 `2.1 Implement`、`2.2 Design CASE`、`2.3 Check`、`2.4 Commit`；front-matter version 为 25，等于 `WORKFLOW_PROTOCOL_VERSION` 且大于 24。
  2. light 流程 version 仍为 1、步骤文本无差异。
  3. 两个测试文件全绿。
- Evidence:
  - `case-evidence/c2-workflow.txt`
- Cleanup: `none`

### C3 CASE 设计 purpose 与 stage

- Covers: `AC3, AC23`
- Preconditions:
  1. task-store 的 purpose 与 `computeTaskStage` 已实现；双 adapter 已接线。
  2. 若当前 profile 尚未加载 version 25，旧派发记录没有 purpose，以源码测试与 Pi 真机结果为准，不用旧记录冒充。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test test/case.test.js test/task-store.test.js`。
  2. 运行 `cd $WT/packages/adapter-dsh && node --test test/executor.test.js test/case-executor.test.js`。
  3. 运行 `cd $WT/packages/adapter-pi && bun test test/executor.test.ts test/case-executor.test.ts`。
- Expected:
  1. `computeTaskStage('implement','check','case-design')` 返回 `implement`；execution 与缺省返回 `check`。
  2. 两个 adapter 的派发记录都保留 purpose，首次 case-design 写 designSession 且不切 stage；execution 才进入 check。
  3. 三条命令 exit 0。
- Evidence:
  - `case-evidence/c3-purpose-stage.txt`
- Cleanup: `none`

### C4 同一 check 会话续用与 fallbackOf 链

- Covers: `AC6, AC16`
- Preconditions:
  1. executor 续用与 failover 记录已实现。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test test/case.test.js`。
  2. 运行 `cd $WT/packages/adapter-dsh && node --test test/executor.test.js test/case-executor.test.js`。
  3. 运行 `cd $WT/packages/adapter-pi && bun test test/executor-continuation.test.ts test/case-executor.test.ts`。
  4. 在 `/tmp/wl-c4` 构造 task.json：设计会话 `child-design`、执行会话 `child-exec`，分有 `fallbackOf` 链与无链调用 `evaluateCaseOutcomeGate`。
- Expected:
  1. 正常续用与进程恢复后执行 childId 与 designSession 相同；Pi 无链时报错而非伪造链。
  2. 有链时接受，无链的不同会话报 `result_session`。
  3. 三条测试命令 exit 0。
- Evidence:
  - `case-evidence/c4-session-chain.txt`
- Cleanup: 删除 `/tmp/wl-c4`

### C5 CASE review 对有效与缺漏材料的判定

- Covers: `AC4, AC15`
- Preconditions:
  1. `workloom_task_case` 的 review 服务与 DSH、Pi 注册已实现；在 `/tmp/wl-c5` 建 git 仓库任务夹具。
- Steps:
  1. 写入符合模板的 CASE，调用 review，记录 `readyToConfirm`、`caseHash`、`structureIssues`。
  2. 分别删除 YAML 的 `task`、`## Coverage`、SR1 的 `Checks`、Traceability 的 AC 行、SR Target 中的变更文件，各调用一次 review。
  3. 用缺章节的 CASE 调 confirm，记录错误。
- Expected:
  1. 完整 CASE 的 `readyToConfirm` 为 true 且结构问题为空。
  2. 五种缺漏分别报告 `field_missing`、`section_missing`、`item` 字段缺失、`traceability_missing`、`changed_file_unreviewed`，`readyToConfirm` 均为 false。
  3. 缺章节材料的 confirm 被拒绝且不写 task.json。
- Evidence:
  - `case-evidence/c5-review.txt`
- Cleanup: 删除 `/tmp/wl-c5`

### C6 用户确认与摘要失效

- Covers: `AC5, AC7`
- Preconditions:
  1. 在 `/tmp/wl-c6` 复制 C5 的夹具（C5 已清理时按相同结构重建）；`workloom_task_case` confirm 已实现。
- Steps:
  1. review 取得 caseHash 后调 confirm（expectedCaseHash 为该值，summary 非空），读取 task.json 的 `case`。
  2. 在 case.md 末尾追加一个空行，再次 review 取得新 hash；用旧 hash 调 confirm；调用 `evaluateCaseExecutionGate`。
  3. 用新 hash 再确认一次。
- Expected:
  1. 首次确认写入 `required:true`、`confirmedAt`、`caseHash`、`summary`，并清空 result。
  2. 追加内容后 hash 变化；旧 hash 确认被拒绝；执行门报 `changed after confirmation`。
  3. 新 hash 确认成功。
- Evidence:
  - `case-evidence/c6-confirm.txt`
- Cleanup: 删除 `/tmp/wl-c6`

### C7 模拟执行的 RESULT 结构与摘要稳定

- Covers: `AC7`
- Preconditions:
  1. 在 `/tmp/wl-c7` 的 git 仓库任务中已有确认 CASE 与 `case-evidence/`、`coverage/`。
- Steps:
  1. 按模板写 `case-result.md`：元数据齐全、SR/C 逐项 passed、证据为任务内相对路径、`coverage/lcov.info` 存在、Open issues 末尾为 `- none`。
  2. 记录执行前后 CASE 的 SHA-256，调用 `evaluateCaseOutcomeGate`，并人工核对 Summary 与各分节。
- Expected:
  1. 结果门返回空问题数组；RESULT 元数据、逐项状态、证据相对路径、覆盖率与末尾 Open issues 全部符合模板。
  2. CASE 摘要执行前后相同，`case-result.md` 未改写 `case.md`。
- Evidence:
  - `case-evidence/c7-result-format.txt`
- Cleanup: 删除 `/tmp/wl-c7`

### C8 覆盖率三态判定

- Covers: `AC8`
- Preconditions:
  1. `evaluateCaseOutcomeGate` 已实现覆盖率三态校验。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test --test-name-pattern='覆盖率|not_applicable' test/case.test.js`。
  2. 阅读测试断言与输出，记录 generated、not_applicable、failed 三种判定。
- Expected:
  1. generated 且 Overall lines 合格式时通过。
  2. not_applicable 仅在没有可统计文件、Changed Files 为空且给出排除理由时通过；否则报 `coverage_not_applicable` 或 `coverage_files`。
  3. failed 报 `coverage_status` 并阻止 check 通过。
- Evidence:
  - `case-evidence/c8-coverage-states.txt`
- Cleanup: `none`

### C9 blocked 阻止后续用例并通过条件

- Covers: `AC9`
- Preconditions:
  1. 在 `/tmp/wl-c9` 的 git 仓库任务中构造含 C1、C2、C3 的 CASE 与确认记录。
- Steps:
  1. 写 RESULT：C1 passed、C2 blocked、C3 pending，且 `status: failed`、Summary 记录 blocked 数。
  2. 调用 `evaluateCaseOutcomeGate`、`checkTask`（含 force）与 `archiveTask`（含 force）。
- Expected:
  1. 结果门同时报告未 passed 的 C2、C3 与 `result_status`，总体不得为 passed。
  2. `checkTask` 与 `archiveTask` 均拒绝，task.json 与任务目录不变。
  3. force 不产生 override 记录。
- Evidence:
  - `case-evidence/c9-blocked.txt`
- Cleanup: 删除 `/tmp/wl-c9`

### C10 其余核心问题逐项拒绝

- Covers: `AC10, AC15`
- Preconditions:
  1. 把 C7 的合法夹具复制到 `/tmp/wl-c10`，逐项构造单点缺陷。
- Steps:
  1. 依次构造：CASE 未确认、确认后修改 CASE、RESULT `caseHash` 与确认值不符、C2 标为 failed、Standard Verification 行退出码非 0、Coverage 标为 failed、Open issues 含未解决问题、证据指向不存在的 `case-evidence/` 文件、Coverage 引用不存在的 `coverage/` 报告、删除 Raw reports 行。
  2. 每种调用 `evaluateCaseOutcomeGate` 与 `checkTask(force:true)`，记录问题码与拒绝信息。
- Expected:
  1. 十种情况全部拒绝，分别命中 `case_execution`、`result_hash`、`result_item`、`verification_summary` 或 `verification_exit`、`coverage_status`、`open_issues`、`artifact_missing`、`coverage_raw`。
  2. 不产生 check 通过记录与 override；修正后正常路径恢复通过。
- Evidence:
  - `case-evidence/c10-invalid-results.txt`
- Cleanup: 删除 `/tmp/wl-c10`

### C11 真实 LCOV 与适用文件集合

- Covers: `AC8, AC21`
- Preconditions:
  1. 实施完成且测试全绿；Node 24 与 Bun 可用。
- Steps:
  1. 执行 Coverage 小节的聚合命令，生成四份包级 LCOV、合并 `coverage/lcov.info` 与 `coverage/summary.txt`。
  2. 核对合并报告中出现 Scope 声明的 23 个文件；从 summary 读取总体与逐文件数字。
  3. 核对每个适用文件的未覆盖行与明细路径，确认 Raw outputs 均存在且非空。
- Expected:
  1. 23 个适用文件全部有 SF 记录；总体行覆盖率为 `covered/total (pct%)`。
  2. 每个文件给出 Covered/Total、百分比、未覆盖行区间与明细路径。
  3. 报告非空；失败用例会让对应 lcov 命令 exit 非 0。
- Evidence:
  - `case-evidence/c11-coverage.txt`
- Cleanup: `none`

### C12 git 变更 SR 覆盖与 SR 声明范围回退

- Covers: `AC21`
- Preconditions:
  1. 当前任务 CASE 已确认；另在 `/tmp/wl-c12` 建干净 git 仓库任务。
- Steps:
  1. 对当前任务调用 review，确认结构问题为空且无 `changed_file_unreviewed`。
  2. 在干净仓库任务中让 CASE 声明 SR 文件 `src/a.js`，RESULT 的 Changed Files 只列该文件，调用结果门。
  3. 删除该行后再调用；再追加一行未声明文件调用。
- Expected:
  1. 当前任务的每个 git 变更文件都命中 SR Target 或被 Exclusions 排除。
  2. 干净仓库无 git 变更时以 SR 文件为适用集合；缺行和多行都报 `coverage_files`。
- Evidence:
  - `case-evidence/c12-changed-files.txt`
- Cleanup: 删除 `/tmp/wl-c12`

### C13 无 PLAN 父任务的三份子 PLAN

- Covers: `AC17`
- Preconditions:
  1. 在 `/tmp/wl-c13` 建父任务，children 依次为 `tasks/a`、`tasks/b`、`tasks/c` 且三份 plan.md 存在。
- Steps:
  1. 写 CASE：Implementation 按 children 顺序列三份 PLAN；Scope 覆盖整体集成与子任务衔接 AC。
  2. 调用 review；再交换前两份 PLAN 顺序调用；删除第三份 PLAN 调用。
- Expected:
  1. 顺序正确时 `readyToConfirm` 为 true；Implementation 不标记实施文档缺失。
  2. 乱序报 `parent_plan_order`；缺失报 `parent_plan_missing`。
  3. 集成与衔接 AC 都有 SR 或 C 对应。
- Evidence:
  - `case-evidence/c13-parent.txt`
- Cleanup: 删除 `/tmp/wl-c13`

### C14 force 不能绕过核心 CASE 问题

- Covers: `AC18`
- Preconditions:
  1. check 与 archive 的 CASE 硬门禁已实现。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test test/case.test.js`。
  2. 在 `/tmp/wl-c14` 用 failed 覆盖率 RESULT 分别调 `checkTask(force:true)` 与 `archiveTask(force:true)`。
  3. 修正 CASE 与 RESULT、重新确认后，走一次不带 force 的 check。
- Expected:
  1. 两次 force 均被拒绝，消息含 `cannot be bypassed with force` 或 `CASE archive gate failed`，overrides 不新增。
  2. 重新确认后正常 check 通过，正常路径可恢复。
- Evidence:
  - `case-evidence/c14-force.txt`
- Cleanup: 删除 `/tmp/wl-c14`

### C15 模板单一来源与注入

- Covers: `AC19`
- Preconditions:
  1. 两份模板在 `packages/assets/templates/`，双 adapter 已读取。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test test/contract-asset.test.js`。
  2. 运行 `cd $WT/packages/adapter-dsh && node --test test/case-executor.test.js`。
  3. 运行 `cd $WT/packages/adapter-pi && bun test test/case-executor.test.ts`。
  4. 对比注入文本中的模板正文与 `packages/assets/templates/*.md` 字节。
- Expected:
  1. core 契约测试证明模板正文命中 `CASE_STRUCTURE` 常量，且 core 未从父任务 PRD 读取运行模板。
  2. 两个 runtime 的 check 全量注入包含两份模板全文与当前 CASE；模板正文与 assets 一致。
- Evidence:
  - `case-evidence/c15-templates.txt`
- Cleanup: `none`

### C16 双 runtime 会话链与 Pi 参数面

- Covers: `AC16, AC20`
- Preconditions:
  1. 公共会话链校验、DSH failover、Pi 参数面已实现。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test test/case.test.js`。
  2. 运行 `cd $WT/packages/adapter-dsh && node --test test/executor.test.js test/case-executor.test.js`。
  3. 运行 `cd $WT/packages/adapter-pi && bun test test/case-executor.test.ts`。
  4. 读取 Pi `EXECUTOR_PARAMS` 序列化结果与检查会话链校验分支。
- Expected:
  1. DSH 有效 fallbackOf 链被接受；无链的不同会话被拒绝。
  2. Pi 参数与行为不含 `fallback_models`；Pi 无链时要求执行会话等于设计会话。
- Evidence:
  - `case-evidence/c16-runtime-chain.txt`
- Cleanup: `none`

### C17 旧任务迁移与恢复路由

- Covers: `AC14, AC22`
- Preconditions:
  1. task 记录归一、会话上下文提示、continue 技能文本已更新。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test test/session-context.test.js test/doctor.test.js test/task-store.test.js test/case.test.js`。
  2. 读取旧 `in_progress` full 任务快照、新 full、light 三种快照文本；读取 `packages/assets/skills/workloom-continue/SKILL.md` 路由表。
  3. 对旧任务执行 confirm，读取 task.json 的 `case.required`。
- Expected:
  1. 旧 full 任务显示 `CASE migration` 并指向 `workloom-case-active`；planning、新 full、light 不显示。
  2. continue 路由存在同一迁移分支；doctor 检查类别数量不变。
  3. confirm 后 `case.required` 为 true，生命周期状态可被后续技能读取。
- Evidence:
  - `case-evidence/c17-migration.txt`
- Cleanup: `none`

### C18 基线红、实现绿

- Covers: `AC12`
- Preconditions:
  1. 任务 worktree 的 HEAD 为实施前基线，node_modules 可复用。
- Steps:
  1. 运行 `git -C $WT worktree add --detach /tmp/wl-c18-red HEAD`。
  2. 把新增测试 `packages/core/test/case.test.js`、`packages/adapter-dsh/test/case.test.js`、`packages/adapter-dsh/test/case-executor.test.js`、`packages/adapter-pi/test/case.test.ts`、`packages/adapter-pi/test/case-executor.test.ts`、`packages/assets/test/case-templates.test.js` 复制到基线树，并分别链接任务 worktree 的根 `node_modules` 与 `packages/core`、`packages/adapter-dsh`、`packages/adapter-pi` 的 `node_modules`。
  3. 在基线树逐包运行这些测试；在任务 worktree 运行同一组测试。
- Expected:
  1. 基线树全部失败，原因是缺 `case.js`、`case-service`、`executeTaskCase`、`workloom_task_case` 或模板 loader，而不是环境错误。
  2. 任务 worktree 同一组测试全部通过。
  3. 记录两轮命令、退出码与关键报错。
- Evidence:
  - `case-evidence/c18-red-green.txt`
- Cleanup: `git -C $WT worktree remove --force /tmp/wl-c18-red`

### C19 标准验证与 dist 同步

- Covers: `AC13`
- Preconditions:
  1. 实施与所有 CASE 修复已停止，代码进入最终状态。
- Steps:
  1. 在 `$WT` 根依次运行 `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`，再分别在 `$WT/packages/core`、`$WT/packages/adapter-dsh` 运行 `node --test test/*.test.js`，在 `$WT/packages/adapter-pi` 运行 `bun test test/*.test.ts`，在 `$WT/packages/assets` 运行 `node --test test/*.test.js`。
  2. 记录 core 与 adapter-dsh 的 `dist` 文件 SHA-256 清单，再次运行 `pnpm -r build` 后重新计算并比对。
  3. 在 core 包运行 `node --test test/dist-dts.test.js`。
- Expected:
  1. 所有命令 exit 0，`dist` 与 `src` 同步且第二次构建无新增差异。
  2. `dist-dts` 通过，手写 d.ts 与 dist 字节一致。
- Evidence:
  - `case-evidence/c19-verification.txt`
- Cleanup: `none`

### C20 全量注入、增量摘要与超预算失败

- Covers: `AC24`
- Preconditions:
  1. core 注入器与双 adapter purpose 已实现。
- Steps:
  1. 运行 `cd $WT/packages/core && node --test test/executor-context.test.js`。
  2. 运行 `cd $WT/packages/adapter-dsh && node --test test/case-executor.test.js`。
  3. 运行 `cd $WT/packages/adapter-pi && bun test test/case-executor.test.ts`。
  4. 在 `/tmp/wl-c20` 构造超过 `maxArtifactBytes` 的 CASE，调用派发入口并记录错误与现有 child 数。
- Expected:
  1. 首次派发、reinject、failover 注入包含当前 CASE 全文与两份模板；普通增量续用只含新指令与 `Confirmed CASE hash`。
  2. 超预算派发明确失败，错误含字节数与 `maxArtifactBytes`，不创建新会话、不写 dispatch 记录；注入文本不出现截断版 CASE。
- Evidence:
  - `case-evidence/c20-injection.txt`
- Cleanup: 删除 `/tmp/wl-c20`

### C21 修复后的完整重跑纪律

- Covers: `AC11`
- Preconditions:
  1. 所有 SR 与 C 已完成，覆盖率已生成。
- Steps:
  1. 记录当前代码快照：`git -C $WT diff | sha256sum`。
  2. 若执行期间修复过任何代码，丢弃修复前结果，重新完成全部 SR、全部 C 与 Coverage 聚合，并记录每步命令与时间；若无修复，明确记录“本次 check 未修改代码”。
  3. 记录最终代码快照，与 RESULT/证据时间比对。
- Expected:
  1. RESULT 的证据与时间都对应最终代码快照。
  2. 修复过代码时看不到修复前的旧结果被复用；未修复时结论与快照一致。
- Evidence:
  - `case-evidence/c21-rerun.txt`
- Cleanup: `none`

### C22 CASE 生命周期状态完整可读

- Covers: `AC14, AC16`
- Preconditions:
  1. 任务记录归一与 confirm 已实现；使用临时任务夹具。
- Steps:
  1. 新建完整任务后读取 task.json，记录 `case` 值。
  2. 首次 case-design 派发后读取 `case.required`、`designSession`、`confirmedAt`、`caseHash`。
  3. 确认后读取 `case.required`、`confirmedAt`、`caseHash`、`summary`、`result`。
  4. 执行并记录 check 后读取 `case.result` 并核对摘要。
- Expected:
  1. 新建任务为 `case: null`；首次设计后 `required` 为 false 且 designSession 非空。
  2. 确认后 `required` 为 true 且确认字段非空、result 为空；check 后 result 三字段与 RESULT 摘要一致。
  3. 后续补写技能只读这些字段即可判断生命周期。
- Evidence:
  - `case-evidence/c22-lifecycle.txt`
- Cleanup: `none`

### C23 CASE 工具对外限制

- Covers: `AC4, AC15`
- Preconditions:
  1. 双 adapter 已注册 `workloom_task_case`，且存在可 review 的任务。
- Steps:
  1. 在 DSH 以子会话上下文调用 `workloom_task_case`，记录错误。
  2. 在 Pi 调用 review，核对返回 action、case、caseHash、structureIssues、readyToConfirm 投影。
  3. 依次以缺 expectedCaseHash、缺 summary、expectedCaseHash 与当前内容不符三种参数调用 confirm。
- Expected:
  1. 子会话调用被拒绝，确认只能由主会话发起。
  2. review 只读返回当前快照与 hash，不写 task.json。
  3. 三种 confirm 全部拒绝且不写入确认字段。
- Evidence:
  - `case-evidence/c23-tool-surface.txt`
- Cleanup: `none`

### C24 Pi 真机清单

- Covers: `AC3, AC6, AC20, AC23, AC24`
- Preconditions:
  1. 主会话已按 `.workloom/tasks/11-03-full-task-case-coverage/verify/pi-case.md` 的 9 项清单完成 Pi 真机验证，并保存 pane 文本或 task.json 摘录。
- Steps:
  1. 读取 `verify/pi-case.md` 的 Results 表与证据。
  2. 把每项结论与证据位置摘录到 `case-evidence/pi-case-checklist.md`。
  3. 核对工具面、开始条件、CASE 设计、确认、执行续用、进程恢复、全文注入、超预算失败、通过条件九项。
- Expected:
  1. 9 项全部 PASS 且有证据引用；不存在 PENDING。
  2. 进程恢复前后 child id 相同；Pi 参数不含 `fallback_models`。
  3. 若真机环境缺失或存在安全风险，本节标记 blocked、后续用例保持 pending 并报告主会话。
- Evidence:
  - `case-evidence/pi-case-checklist.md`
- Cleanup: 主会话结束专用 tmux 会话

## Coverage

- Tool: `Node v24.18.1 内置覆盖率（--experimental-test-coverage --test-reporter=lcov --enable-source-maps）与 Bun 1.3.14（--coverage-reporter=lcov）`
- Instrumentation: `按包运行全部真实测试并输出 LCOV：Node 侧以 source map 归因到 src，Bun 侧保留 adapter-pi 的 src；合并时先把绝对与相对 SF 统一解析为仓库相对路径，再过滤 dist、node_modules、.d.ts 与测试文件，最后按文件合并同一行命中并集。`
- Aggregate command:
```bash
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
WT="$REPO/.workloom/worktree/11-03-full-task-case-coverage"
TASK="$REPO/.workloom/tasks/11-03-full-task-case-coverage"
mkdir -p "$TASK/coverage/pi-raw"
(cd "$WT/packages/core" && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'test/*.test.js') > "$TASK/coverage/lcov-core.info" 2> "$TASK/coverage/core-test.log"
(cd "$WT/packages/adapter-dsh" && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'test/*.test.js') > "$TASK/coverage/lcov-adapter-dsh.info" 2> "$TASK/coverage/adapter-dsh-test.log"
(cd "$WT/packages/adapter-pi" && bun test --coverage --coverage-reporter=lcov --coverage-dir="$TASK/coverage/pi-raw" 'test/*.test.ts') > "$TASK/coverage/adapter-pi-test.log" 2>&1
(cd "$WT/packages/assets" && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'test/*.test.js') > "$TASK/coverage/lcov-assets.info" 2> "$TASK/coverage/assets-test.log"
cat > "$TASK/coverage/merge-lcov.mjs" <<'MERGE'
import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const [dir, repo] = process.argv.slice(2)
const reports = [
  ['lcov-core.info', 'packages/core'],
  ['lcov-adapter-dsh.info', 'packages/adapter-dsh'],
  ['pi-raw/lcov.info', 'packages/adapter-pi'],
  ['lcov-assets.info', 'packages/assets'],
]
const files = new Map()
for (const [name, base] of reports) {
  let current = null
  for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      const source = line.slice(3).trim()
      const rel = relative(repo, isAbsolute(source) ? source : resolve(repo, base, source))
      current =
        rel.startsWith('..') || isAbsolute(rel) || rel.includes('/dist/') || rel.includes('node_modules/') || rel.endsWith('.d.ts')
          ? null
          : rel
      continue
    }
    if (line.startsWith('DA:') && current !== null) {
      const [lineNo, hits] = line.slice(3).split(',')
      const bucket = files.get(current) ?? new Map()
      const key = Number(lineNo)
      bucket.set(key, Math.max(Number(hits), bucket.get(key) ?? 0))
      files.set(current, bucket)
    }
  }
}
const paths = [...files.keys()].sort()
let total = 0
let covered = 0
const out = ['TN:']
const summary = []
for (const path of paths) {
  const bucket = files.get(path)
  const lines = [...bucket.keys()].sort((a, b) => a - b)
  let hit = 0
  out.push(`SF:${path}`)
  for (const line of lines) {
    hit += bucket.get(line) > 0 ? 1 : 0
    out.push(`DA:${line},${bucket.get(line)}`)
  }
  out.push(`LF:${lines.length}`, `LH:${hit}`, 'end_of_record')
  total += lines.length
  covered += hit
  summary.push(`${path} ${hit}/${lines.length} ${((hit / lines.length) * 100).toFixed(1)}%`)
}
summary.push(`TOTAL ${covered}/${total} (${((covered / total) * 100).toFixed(1)}%)`)
writeFileSync(join(dir, 'lcov.info'), `${out.join('\n')}\n`)
writeFileSync(join(dir, 'summary.txt'), `${summary.join('\n')}\n`)
console.log(summary.at(-1))
MERGE
node "$TASK/coverage/merge-lcov.mjs" "$TASK/coverage" "$REPO"
```
- Scope:
  - `packages/core/src/domain/{alignment,git,case,task-gates,task-store,protocol,executor-context}.js`
  - `packages/core/src/service/{case-service.ts,session-context.ts}`
  - `packages/core/src/{index.ts,surface.ts}`
  - `packages/adapter-dsh/src/{tasks.ts,executor-schema.ts,executor.ts,executor-injection.ts,executor-failover.ts,executor-failover-chain.ts}`
  - `packages/adapter-pi/src/{tasks.ts,executor.ts,executor-continuation.ts,executor-dispatch.ts,agent-definitions.ts}`
  - `packages/assets/index.js`
- Exclusions:
  - `packages/core/dist/`: tsc 构建产物，由对应 src 的 SR 与 dist 一致性检查覆盖
  - `packages/adapter-dsh/dist/`: tsc 构建产物，由对应 src 的 SR 与 dist 一致性检查覆盖
  - `packages/core/test/`: 测试代码，由自身断言与标准验证覆盖
  - `packages/adapter-dsh/test/`: 测试代码，由自身断言与标准验证覆盖
  - `packages/adapter-pi/test/`: 测试代码，由自身断言与标准验证覆盖
  - `packages/assets/test/`: 测试代码，由自身断言与标准验证覆盖
  - `packages/core/src/domain/*.d.ts`: 手写类型声明，无可执行行，由 typecheck 与 dist-dts 测试校验
  - `packages/assets/*.d.ts`: 手写类型声明，无可执行行，由 typecheck 校验
  - `packages/assets/templates/`: 模板文本资产，由 SR 与资产契约测试覆盖
  - `packages/assets/workflow/`: 流程契约文本资产，由 SR 与契约测试覆盖
  - `packages/assets/skills/`: 技能文本资产，由 SR 与技能测试覆盖
  - `packages/assets/package.json`: 包脚本配置，无运行时逻辑
- Raw outputs:
  - `coverage/lcov-core.info`
  - `coverage/lcov-adapter-dsh.info`
  - `coverage/pi-raw/lcov.info`
  - `coverage/lcov-assets.info`
  - `coverage/lcov.info`
  - `coverage/summary.txt`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR6, SR34 | C1 |
| AC2 | SR9, SR15, SR31 | C2 |
| AC3 | SR7, SR17, SR25, SR31 | C3, C24 |
| AC4 | SR1, SR12, SR16, SR22, SR29 | C5, C23 |
| AC5 | SR1, SR7, SR12, SR32 | C6 |
| AC6 | SR23, SR24, SR25 | C4, C24 |
| AC7 | SR3, SR30 | C6, C7 |
| AC8 | SR1, SR30 | C8, C11 |
| AC9 | SR1 | C9 |
| AC10 | SR1, SR7, SR30 | C10 |
| AC11 | SR31 | C21 |
| AC12 | SR31 | C18 |
| AC13 | - | C19 |
| AC14 | SR7, SR12, SR13, SR32 | C17, C22 |
| AC15 | SR1, SR12, SR16, SR22 | C5, C10, C23 |
| AC16 | SR7, SR18, SR20, SR21 | C4, C16, C22 |
| AC17 | SR31 | C13 |
| AC18 | SR1, SR7, SR31 | C14 |
| AC19 | SR19, SR23, SR27, SR29 | C15 |
| AC20 | SR23, SR26 | C16, C24 |
| AC21 | SR1, SR3, SR5 | C11, C12 |
| AC22 | SR13, SR32 | C17 |
| AC23 | SR7, SR10, SR17, SR23 | C3, C24 |
| AC24 | SR10, SR18, SR19, SR23, SR26 | C20, C24 |
