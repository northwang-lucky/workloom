---
version: 1
task: tasks/11-06-sop-parent-child
---

# CASE: 父子任务编排（subtasks 层、completed 终态、级联归档与集成 CASE）

## References

- PRD: `prd.md`（R1-R15 / AC1-AC6）
- Implementation: `plan.md`（11 条设计决定 / 13 步 S1-S13；plan 行号锚点以 main 基线 `5112cc7` 为准，终态以 S13 的单一 work commit 为准）
- Code target: worktree `.workloom/worktree/11-06-sop-parent-child`（分支 `workloom/11-06-sop-parent-child`，基线 `main`@`5112cc7`；下文相对路径以该 worktree 为根；`<task>` 指主检出侧任务目录 `.workloom/tasks/11-06-sop-parent-child`（本文件所在，不是 worktree 副本））
- Source task: none（容器任务 11-06-sop-refactor 的子任务五）
- Facts: 设计探针前已按子任务四纪律核对状态机合法边表与钉住测试——现行 standard 为 aligning→planning→implementing→checking→archived、light 为 aligning→planning→implementing→archived、parent 为 aligning→planning→orchestrating→integrating→archived，归档出口边为任意在档阶段→archived；钉住测试为 `test/state-machine.test.ts`（STAGES/TRANSITIONS 精确数组、parent 全程链与序列守卫）、`test/session-context.test.ts`（候选节排序/截断）、`test/case.test.ts`（会话链与结果门禁）、`test/task-ops.test.ts`（归档编排与 force 留痕）。S2 只新增六条 completed 边，既有 19 条零改动；本 CASE 的 C3/C4/C5 探针均以该边表为前置事实，不自定义迁移语义。

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7、R8、R9、R10、R11、R12、R13、R14、R15
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5、AC6
- Out of scope:
  - 既有 worktree 清理模式语义、parent 的 orchestrating/integrating/archived 既有边、children-archived 的判定行为、task-ops.ts 超 600 行拆分（设计决定 11 接受现状，只做增补记录登记）均不改。
  - 父任务集成 CASE 不重复校验子任务内部凭据（R12）：C5 只验证 integration-case-passed 求值父任务自身 RESULT 门禁与 children-archived 的传递语义，不构造子任务 CASE 凭据。
  - 生产 DSH 实例操作零接触：端口 3088 的 `dsh web` 不重启、不执行 `dsh-stop`/`dsh-start`、不改 profile 与 pnpm-lock；全部探针在 worktree 内经 node 直跑，生产目录只读。
  - 代码提交：CASE 执行轮零 commit/push；S13 的单一 work commit 由主会话执行，本 CASE 只观察变更集与 dist 新鲜度（见 Result Discipline 的预写容忍条款）。
  - 探针夹具只建在隔离 HOME 与 TMPDIR 下并自清理；CASE 产物只写主检出 `<task>`（case.md、case-result.md、case-evidence/、coverage/），worktree 保持只有代码变更。

## Static Review

### SR1 阶段值域：STAGES 增 completed

- Covers: AC3
- Target: `packages/core/src/task/state/values.ts#STAGES`
- Checks:
  1. `STAGES` 增 `COMPLETED: 'completed'`，值域为八个值（aligning/planning/implementing/checking/orchestrating/integrating/completed/archived，顺序以实现为准但既有七值逐字保留），`Object.freeze` 与 `as const` 形态不变。
  2. `STAGE_VALUES` 由 `Object.values(STAGES)` 派生，自动包含 completed（无第二处手工维护的阶段集合）。
  3. 既有七值的名称与字面量零改动；`TaskStageValue` 类型随值域自动扩展。
- Expected: completed 成为主线阶段值域成员，值域单源与冻结形态不变。

### SR2 兼容读：statusOfStage 映射与 deriveStage 判定顺序

- Covers: AC3
- Target: `packages/core/src/task/state/view.ts#statusOfStage`
- Checks:
  1. `statusOfStage(STAGES.COMPLETED)` 返回 `'completed'`；archived 仍返回 `'completed'`；aligning/planning 仍返回 `'planning'`；其余返回 `'in_progress'`。
  2. `deriveStage` 先取 `record.stage`：命中 `STAGE_VALUES` 时提前返回（新 completed 枚举值优先）；未命中才执行 `record.status === 'completed' || isArchivePath(taskRelPath)` 的归档兜底，再执行 planning 确认推导、legacy implement/check 映射与未映射报错分支（这三段内容与现状一致）。
  3. completed-not-archived 语义以注释写明：`status='completed' + stage='completed'` 的活动目录读作 completed，仅无 stage 的旧 `status=completed` 记录继续兜底为 archived。
  4. 未映射 stage 值仍走原 `unmapped stage value` 报错分支，错误文案不变。
- Expected: 新完成态不被误读为 archived，旧归档数据兜底与报错行为不变。

### SR3 迁移表：六条 completed 新边与路线注释

- Covers: AC3、AC5
- Target: `packages/core/src/task/state/transitions.ts#TRANSITIONS`
- Checks:
  1. standard 三条新边：checking→completed（guards `archive-ready`、`case-outcome-ready`）、completed→archived（同两守卫）、completed→implementing（guards 为空数组）；light 三条新边：implementing→completed（同两守卫）、completed→archived（同两守卫）、completed→implementing（guards 空）。
  2. 既有 19 条边逐条零改动（含 parent 的 orchestrating→integrating 与 integrating→archived）；parent 无任何 completed 边（parent 查表拒绝 completed 的自然语义保留）；`TRANSITIONS` 与每条 `guards` 仍冻结。
  3. 文件头注释的三模式路线各补 completed 注记：standard 为 checking→completed→archived、completed→implementing 回边无守卫；light 为 implementing→completed→archived、completed→implementing 回边无守卫；归档边守卫与 completed 边一致。
- Expected: 六条新边入表、守卫与归档边一致，parent 无 completed 路径。

### SR4 完成时刻：completedAt 随 completed 迁移写入

- Covers: AC3
- Target: `packages/core/src/task/state/migrate.ts#migrateTask`
- Checks:
  1. completedAt 写入条件扩为 `to === STAGES.ARCHIVED || to === STAGES.COMPLETED`，且仍以 `record.completedAt === null` 为前置，绝不覆盖既有完成时刻。
  2. `migrateTask` 其余语义零改动：查表、守卫求值、`record.status = statusOfStage(to)`、`record.stage = to`、patch 合并、casePhase 同写、overrides 留痕与返回形状不变。
  3. 函数头注释补充「completed 即任务完成时刻，归档不覆盖」（与 S7 的归档写空值守卫同口径，交叉 SR11）。
- Expected: 完成迁移记下完成时刻，后续归档保留原值。

### SR5 存储常量：DIR_NAMES.subtasks 与 TASK_DIR_DATE_PREFIX 单源

- Covers: AC1、AC6
- Target: `packages/core/src/task/storage/records.ts#DIR_NAMES`
- Checks:
  1. `DIR_NAMES` 增 `subtasks: 'subtasks'`（保持 `Object.freeze`），模块内无其他 subtasks 字面量定义。
  2. `TASK_DIR_DATE_PREFIX` 从 list-archive.ts 提升为本文件导出常量，正则体逐字为 `/^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])-/`；list-archive 与 create 改为导入消费（交叉 SR6、SR7）。
  3. `TaskRecord` 的 `subtasks: string[]` 字段删除；`records.ts` 中不再有该字段的类型声明或默认值。
- Expected: subtasks 只剩目录名常量，日期前缀单源，死字段类型面清除。

### SR6 顶层列表：listTasks 不递归 subtasks，归档回退改导入常量

- Covers: AC1、AC2
- Target: `packages/core/src/task/storage/list-archive.ts#listTasks`
- Checks:
  1. 本地 `TASK_DIR_DATE_PREFIX` 定义删除，改为从 records.ts 导入；`findArchivedTaskPath` 的「精确名优先、去日期前缀回退」两段语义不变。
  2. `listTasks` 仍只枚举 `tasks/` 的直接子目录（跳过 archive），不递归进入 `subtasks/`；嵌套子任务因此不出现在输出中；`includeArchived` 的月份分层枚举不变。
  3. 损坏/缺失任务目录跳过不阻塞列表的容忍语义不变。
- Expected: 顶层列表语义不变，嵌套子任务天然不暴露。

### SR7 创建落位：嵌套目录、全库 slug 唯一与零写入拒绝

- Covers: AC1、AC4
- Target: `packages/core/src/task/storage/create.ts#createTaskInternal`
- Checks:
  1. 落位按 PRD R1：`father` 是 parent 任务目录本身，`taskRelPath = join(parentRelPath, DIR_NAMES.subtasks, dirName)`（无 parent 时 `join(DIR_NAMES.tasks, dirName)`），`dirName = `${formatMonthDay(now)}-${slug}``。注意：若实现取 `dirname(parentRelPath)` 作为 fatherDir，会落到 `tasks/subtasks/<child>`，与 PRD R1/AC1 的 `tasks/<father>/subtasks/<child>` 不符，静态审查按 PRD 判失败。
  2. 新增私有 `assertSlugUniqueActiveTree(projectRoot, slug)`：递归扫描 `tasks/` 活跃树、跳过 `archive`，目录名经 `TASK_DIR_DATE_PREFIX` 去前缀后等于 slug 即抛 `${ERR_PREFIX}: slug already exists in active tree: <slug>`；调用点在 `existsSync(taskDir)` 与任何 `mkdirSync`/写文件之前。
  3. 校验顺序为 slug 校验 → parent 归一与 `validateParent`（自引用比较新 taskRelPath）→ taskRelPath 计算 → 全库 slug 校验 → 嵌套目标 `existsSync` 冲突检查 → config/package 校验 → 写盘；任一失败零目录/文件写入。
  4. `linkChildToParent` 与 `buildTaskRecord` 语义：父 children 追加子任务规范路径（`tasks/<father>/subtasks/<child>`）、父 mode 写为 parent；`buildTaskRecord` 不再写 `subtasks` 字段（R13）。
  5. 文件头注释补嵌套落位与校验前置说明。
- Expected: R1/R2/R4 的创建语义在写盘前完整成立，失败零部分状态。

### SR8 读取归一：存量 subtasks 键运行时剔除

- Covers: AC6
- Target: `packages/core/src/task/storage/read-write.ts#normalizeTaskRecord`
- Checks:
  1. `normalizeTaskRecord` 在展开 `parsed` 后对返回记录显式删除 `subtasks` 键（`delete record['subtasks']` 或等价形态），读取返回值不含该键。
  2. 其余归一语义零改动：hooks 补齐、check/alignment/planConfirmation 缺省、case 记录、dispatches 缺省 completed、parent/children 兜底、autonomyLog。
  3. 存量 task.json 含 `subtasks` 键时读取不报错、不迁移写回，下一次正常写口自然丢弃。
- Expected: 死字段读时忽略，存量数据零报错。

### SR9 创建指针分流：带 parent 不抢会话指针

- Covers: AC1
- Target: `packages/core/src/task/task-ops.ts#executeCreateInternal`
- Checks:
  1. 创建成功后的 `setActiveTask(found.root, contextKey, result.taskRelPath)` 外包 parent 非空守卫：`params.parent` 为非空字符串时跳过指针切换，无 parent（缺省/空串）维持现状抢指针。
  2. `findWorkloomRoot` 与错误语义不变（root 缺失仍抛错）；`nextStepNote` 与 mode 解析零改动。
  3. 文件头 create 入参过滤段补一句指针分流说明。
- Expected: R3 的两种创建形态指针行为分离。

### SR10 完成动作：workloom_task_complete 编排

- Covers: AC3
- Target: `packages/core/src/task/task-ops.ts#executeCompleteTask`
- Checks:
  1. 新增 `ExecuteCompleteTaskParams`（taskPath/force/reason 可选）与 `executeCompleteTask(cwd, contextKey, params)` 元组壳：`requireWorkloomCwd` → `resolveTaskRelPath`（支持活跃任务回退）→ `assertTaskForceReason`（force 契约）→ `evaluateTransition(to: STAGES.COMPLETED, forceOpts)` 干跑（失败即抛）→ `migrateTask` 同参数落状态 → 返回迁移后视图。
  2. 失败路径：parent 模式无 completed 边时查表错误透传（消息含 from/to/mode）；force 缺 reason 在写盘前拦截；迁移失败不写半状态。
  3. 文件头「六个任务管理工具」计数改「七个」；工具编排不新增守卫（守卫集合完全来自迁移表）。
- Expected: R6 的完成动作独立于 check，完成即状态迁移且目录不动。

### SR11 父归档级联：子 worktree 递归清理、整树搬迁与子指针清理

- Covers: AC4
- Target: `packages/core/src/task/task-ops.ts#archiveTaskInternal`
- Checks:
  1. 新增私有 `cascadeChildrenCleanup(projectRoot, view, config)`：对 `view.children` 逐个先取当前路径记录，缺失时 `findArchivedTaskPath` 按名回退；回退命中的已归档子任务跳过；两路皆不可读抛 `child task unreadable: <path>`（fail loud，父目录未动）。
  2. 未归档子任务递归处理其 children 后调用 `cleanupTaskWorktree`，清理顺序为子先于父；清理结果收集为 `cascadedCleanups` 摘要并从 `archiveTaskInternal` 返回。
  3. 调用位置在归档目标冲突检查之后、父 `cleanupTaskWorktree` 之前；父 cleanup 与 `moveTaskToArchive` 顺序不变；任一子清理失败即阻断归档（不改状态、不移动目录、不 autoCommit）。
  4. 归档态写入的 `record.completedAt` 改为仅 `completedAt === null` 时写（沿用 S3 口径，不覆盖完成时刻）；`stage='archived'`、`status='completed'` 写入不变。
  5. move 之后对每个子任务原当前路径调用 `clearPointersToTask`；父路径子指针清理保持；`clearPointersToTask` 幂等语义不变。
  6. 头注释补级联归档语义（子先清理、整树随父入档、失败阻断可重跑）。
- Expected: R8 的级联语义完整，失败封闭，重跑幂等。

### SR12 注册面：taskComplete 三常量与计数

- Covers: AC3
- Target: `packages/core/src/injection/surface.ts#TOOL_NAMES`
- Checks:
  1. `TOOL_NAMES` 增 `taskComplete: 'workloom_task_complete'`；`TOOL_DESCRIPTIONS` 与 `TOOL_SNIPPETS` 各增一条，snippet 形如 `workloom_task_complete(taskPath?, force?, reason?) — mark the task completed without archiving`。
  2. 注释计数更新：`十二个工具名（十个任务工具 + executor + 步骤详情）` 改为十三个工具名（十一个任务工具 + executor + step）。
  3. 既有工具名、描述、snippet 逐字不变；`PARAM_DESCRIPTIONS` 不新增无关条目。
- Expected: 新完成工具在注册面文案单源就位。

### SR13 core 导出面：executeCompleteTask

- Covers: AC3
- Target: `packages/core/src/index.ts#whole-file`
- Checks:
  1. 具名导出 `executeCompleteTask`（与 executeCheckTask/executeFinishTask/executeArchiveTask 并列），无 `export *`。
  2. 若实现引入新入参/结果类型，按现有 `export type {}` 形态从 task-ops 导出（不导出内部 helper）。
  3. 其余导出清单与顺序零无关改动。
- Expected: dsh 可经 core 包接口消费完成工具。

### SR14 dsh 工具注册：第 11 个任务工具

- Covers: AC3
- Target: `packages/dsh-workloom/src/tooling/tasks.ts#registerTaskTools`
- Checks:
  1. `registerTaskTools` 追加 workloom_task_complete 注册块：name/description 引 `TOOL_NAMES.taskComplete`/`TOOL_DESCRIPTIONS.taskComplete`，参数 taskPath/force/reason 均可选（照 taskCheck 的 schema 形态），execute 调 core `executeCompleteTask` 并投影 plain object。
  2. 头注释 L6「八个工具的编排」按实义更新为「十一个工具的编排」；L40 附近「注册十个任务管理工具」改「注册十一个任务管理工具」，枚举串加 complete。
  3. 既有 10 个任务工具注册块零行为改动；contextKey 仍由 agentId 组装。
- Expected: 工具面对齐 core，complete 工具可用。

### SR15 集成门禁：integration-case-passed 注释终态化、行为零变化

- Covers: AC4、AC5
- Target: `packages/core/src/task/state/guards.ts#guardIntegrationCasePassed`
- Checks:
  1. `guardIntegrationCasePassed` 函数体一行不动：仍为 `return guardCaseOutcomeReady(view, ctx)`；不读 `view.children`、不读任何子任务 task.json/check/case 凭据。
  2. JSDoc 改为终态表述：集成 CASE 即父任务自身 CASE（case-design 轮写 case.md、主会话复核后续同会话 execution、RESULT passed 即通过；子任务凭据由 children-archived 传递保证，不在此重复校验）；全文件无「多子任务集成机制待父子编排细化」「待细化」字样。
  3. `guardChildrenArchived`/`isChildArchived` 函数体零改动：raw `status === 'completed'`（新完成态）与归档回退路径同样判定为子任务归档完成；R9 语义保持。
  4. `GUARDS` 注册表键与映射不变；`FORCEABLE_GUARD_GATES` 未新增 `integration-case-passed`（硬守卫，force 不豁免）。
- Expected: R11/R12 注释终态化、行为零变化、children-archived 语义保持。

### SR16 上下文注入：活跃父任务的 children 清单行

- Covers: AC2
- Target: `packages/core/src/injection/session-context.ts#activeTaskContextFromRecord`
- Checks:
  1. `activeTaskContextFromRecord(task, root)` 签名加 root；`ActiveTaskContext` 增 `childrenLines: string[]`；唯一调用点 `assembleInternal` 传 `params.root`。
  2. `view.mode === MODES.PARENT` 且 `children` 非空时逐子 `readTaskView`（当前路径优先、`findArchivedTaskPath` 回退），渲染 `  - "<title>" (<status>) at <taskRelPath>`；超过 8 条（`CHILDREN_TASK_LIMIT = 8`）截断并追加含剩余数量的 more 提示行。
  3. 单条子记录缺失/损坏时 try/catch 跳过，不阻塞快照；无任务分支 `childrenLines` 为空数组。
  4. `assembleInternal` 在 `active.line` 后展开 `...active.childrenLines`；`candidateTaskLines` 不改（仍经 listTasks 只列顶层），候选节不渲染嵌套子任务。
  5. 函数头注释补 children 行语义与 root 入参用途；「零额外读盘」措辞按新增子记录读取更新，不误导。
- Expected: R5 的活跃父任务 children 渲染完整、截断与跳过策略稳定。

### SR17 类型面过期注释：worktree.d.ts 对齐实际模块

- Covers: AC6
- Target: `packages/core/src/workspace/worktree.d.ts#whole-file`
- Checks:
  1. 文件头注释改与 `worktree-lifecycle.ts` / `worktree-integrate.ts` 的 JSDoc 保持同步；不再出现 `worktree.js` 字样。
  2. 类型声明与 import 零改动（TaskRepoResolution、BranchNameContext、CleanupTaskWorktreeResult 等形状不变）。
  3. `grep -n "worktree.js" packages/core/src/workspace/worktree.d.ts` 零命中。
- Expected: R14 注释与实际模块一致。

### SR18 工作流文档：subtasks 目录约定与 completed 语义

- Covers: AC6
- Target: `packages/core/resources/workflow/workflow.md#whole-file`
- Checks:
  1. 1.4 段创建子任务的末句由 "the main task starts, checks, and archives only after every declared subtask is archived" 改为 "every declared subtask is completed"。
  2. 同句后追加两句英文：带 parent 的子任务落位于 `<father>/subtasks/<child>`、不出现在顶层任务列表；完成子任务就地标记 `completed` 不单独归档、随父归档级联清理 worktree 并整树搬迁。
  3. 结尾 "final acceptance and archives last"（norms 段既有出处）保留；`subtask-contract.test.ts` 的 subtask 字样、3+ 阈值、container 短语、final acceptance 短语断言不破坏。
- Expected: R15 文档约定与实现一致，既有契约断言不红。

### SR19 case-active 评测夹具：删 subtasks 字段

- Covers: AC6
- Target: `packages/core/resources/skills/workloom-case-active/evals/build-fixtures.mjs#whole-file`
- Checks:
  1. 夹具记录的 `subtasks: []` 行删除；文件其余逻辑零改动（可执行性由 C6 的 `node --check` 与 eval 冒烟验证）。
  2. 文件内无 `subtasks` 字段引用残留。
- Expected: R13 评测夹具同步清理。

### SR20 case-archived 评测夹具：删 subtasks 字段

- Covers: AC6
- Target: `packages/core/resources/skills/workloom-case-archived/evals/build-fixtures.mjs#whole-file`
- Checks:
  1. 夹具记录的 `subtasks: []` 行删除；文件其余逻辑零改动。
  2. 文件内无 `subtasks` 字段引用残留。
- Expected: R13 评测夹具同步清理。

### SR21 dsh commands 测试夹具：删 subtasks 字段

- Covers: AC6
- Target: `packages/dsh-workloom/test/commands.test.ts#whole-file`
- Checks:
  1. task.json 夹具字面量的 `subtasks: []` 行删除；其余断言与夹具字段零改动。
  2. 文件内无 `subtasks` 字段引用残留。
- Expected: R13 测试夹具同步清理。

### SR22 core task-store 测试：死字段断言删除与嵌套创建覆盖

- Covers: AC1、AC2、AC6
- Target: `packages/core/test/task-store.test.ts#whole-file`
- Checks:
  1. 删除 `assert.deepEqual(task.subtasks, [])`（或改为缺字段断言），文件内无 `subtasks` 字段引用。
  2. 新增钉住用例覆盖：带 parent 创建落位于 `tasks/<father>/subtasks/<MM-DD>-<slug>`（father 即 parent 任务目录，断言用 `join(parentRelPath, 'subtasks', ...)`；若夹具按 `dirname(parentRelPath)` 预测路径则与 PRD 不符，需同步修正）、父 children 记规范嵌套路径、父 mode 归一 parent；顶层与另一父 subtasks 层同名 slug 在写盘前拒绝；listTasks 只列顶层任务。
  3. 新增夹具用 HOME+TMPDIR 隔离（`process.env.HOME`/`TMPDIR` 指向 mkdtemp 目录），结束清理。
- Expected: AC1/AC2 的创建与列表单测承载。

### SR23 core state-machine 测试：completed 边表、兼容读与回边

- Covers: AC3、AC6
- Target: `packages/core/test/state-machine.test.ts#whole-file`
- Checks:
  1. 夹具字面量的 `subtasks: []` 删除；STAGES 枚举断言更新为八值；TRANSITIONS 精确数组更新为含六条 completed 新边的 25 条。
  2. 新增用例：completed 六条边可达（含守卫断言）、completedAt 在 completed 迁移写入且归档不覆盖、deriveStage 新枚举优先于 legacy status、旧数据无 stage 且 status=completed 仍读 archived、completed→implementing 回边无守卫。
  3. 既有 parent 全程链、序列守卫与非法迁移抽样用例保持通过（children 以 raw status=completed 判定不变）。
- Expected: AC3 状态机单测承载，旧数据回归不丢。

### SR24 core task-ops 测试：完成工具与级联归档

- Covers: AC3、AC4
- Target: `packages/core/test/task-ops.test.ts#whole-file`
- Checks:
  1. 新增 workloom_task_complete 编排用例：standard 成功视图 stage/status completed 且目录未动、raw stage/status/completedAt 同步；parent 模式拒绝；force 契约（缺 reason 拦截，可豁免 archive-ready 场景）。
  2. 新增级联归档用例（父子双 worktree 夹具）：子 worktree 先清理、整树搬迁到 archive 月份目录、子任务保持 completed 且 completedAt 不变、子任务会话指针清理、已归档子任务跳过、子记录不可读时阻断父归档。
  3. 夹具 HOME+TMPDIR 隔离；既有 create/check/archive 用例零改动保持通过。
- Expected: AC4 级联语义单测承载。

### SR25 core session-context 测试：children 行、截断与跳过

- Covers: AC2
- Target: `packages/core/test/session-context.test.ts#whole-file`
- Checks:
  1. 新增用例：parent 活跃任务的 children 行按 `  - "<title>" (<status>) at <taskRelPath>` 渲染、顺序与 children 一致；无活跃任务时候选节不出现嵌套子任务。
  2. 新增用例：超过 8 条时只渲染 8 条并输出 more 提示行；损坏/缺失子记录跳过且快照成功。
  3. 既有候选节排序/截断/降级用例零改动保持通过。
- Expected: AC2 注入面单测承载。

### SR26 core doctor 测试：删 subtasks 字段

- Covers: AC6
- Target: `packages/core/test/doctor.test.ts#whole-file`
- Checks:
  1. task.json 夹具的 `subtasks: []` 行删除；其余夹具与断言零改动。
  2. 文件内无 `subtasks` 字段引用。
- Expected: R13 测试夹具同步清理。

### SR27 dsh tasks 测试：complete 工具注册与投影

- Covers: AC3
- Target: `packages/dsh-workloom/test/tasks.test.ts#whole-file`
- Checks:
  1. 新增用例断言 `workloom_task_complete` 注册存在（name 与 core surface 常量一致）、参数 schema 含可选 taskPath/force/reason。
  2. 新增/扩展现有用例断言 execute 投影调用 core `executeCompleteTask`，成功后返回视图 stage/status completed。
  3. 既有任务工具注册断言零改动保持通过。
- Expected: dsh 注册面单测承载。

## Runtime Cases

### C1 带 parent 创建：嵌套落位、指针分流与全库 slug 唯一

- Covers: AC1
- Preconditions:
  1. worktree 依赖就位（Node v24 原生 TS type stripping；packages 依赖已安装）。
  2. 探针在隔离 HOME 与 TMPDIR 下运行，夹具项目用 `initWorkloom` 骨架 + `packages.repo` 配置；结束清理，不写生产目录。
- Steps:
  1. `cd packages/core && node --test test/task-store.test.ts test/task-ops.test.ts test/active-task.test.ts`，在输出中定位新增用例（嵌套落位、父 children 写回、跨层同名拒绝、指针分流），记录实际用例名。
  2. 探针 `case-evidence/probes/c1-create-probe.mjs`：
     1. 建夹具项目并 `executeCreateTask(root, 'c1_ctx', { title: 'Parent One', package: 'repo' })` 得 P1；`setActiveTask(root, 'c1_ctx', P1)` 显式把指针置 P1。
     2. 以 `parent: basename(P1)`（裸名）创建子 C1：断言 `C1.taskRelPath === join(P1, 'subtasks', '<MM-DD>-<slug>')`、目录含 task.json/prd.md/implement.jsonl/check.jsonl、子 `task.json.parent === P1`（规范路径）、父 `task.json.children` 恰含 C1 嵌套路径且父 `mode === 'parent'`。
     3. 指针断言：`.workloom/.runtime/sessions/c1_ctx.json` 的 `current_task` 仍为 P1；再用同 contextKey 无 parent 创建顶层 T1，断言指针切到 T1。
     4. 查重四形态（用独立 contextKey `c1_dup`；每次尝试前 `setActiveTask(root, 'c1_dup', P1)`，失败后断言其 current_task 仍为 P1）：
        - C1 已占 slug `dup-a`：新建父 P2，以 parent P2 创建 `dup-a` → 拒绝且消息含 `slug already exists in active tree: dup-a`；P2 children 为空、P2 下无目标目录。
        - 顶层同名：以 `c1_ctx` 建顶层 `dup-b`（指针切到 `dup-b`），再以 parent P1 创建 `dup-b` → 拒绝且无嵌套目录。
        - 跨日期前缀：手工 mkdir `tasks/02-02-dup-c` 后以 parent P1 创建 `dup-c` → 拒绝。
        - archive 不参与查重：手工 mkdir `tasks/archive/2026-01/01-01-dup-d` 后以 parent P1 创建 `dup-d` → 成功（落位与父 children 断言同步骤 2.2）。
     5. 嵌套目标冲突：再次以 parent P1 创建 `dup-a` → 拒绝；断言 P1 children 中 `dup-a` 仅一条、目标目录仅一个、`c1_dup` current_task 不变。
     6. 零写入核对：每次拒绝前后记录 `tasks/` 目录清单、相关父 task.json 的 children/mode 与对应指针 current_task，断言逐项不变。
- Expected:
  1. 嵌套落位、parent 规范字段、父 children/mode 写回、带 parent 指针不动、无 parent 指针切换全部成立。
  2. 顶层、另一父 subtasks 层、任意日期前缀目录出现同名 slug 时均在写盘前拒绝；archive 目录不参与查重；每次拒绝零写入。
  3. task-store/task-ops 新增用例全绿且可在输出中定位。
- Evidence:
  - `case-evidence/c1-targeted-tests.log`
  - `case-evidence/c1-create-probe.log`
- Cleanup: 探针在 finally 删除夹具项目与隔离 HOME/TMPDIR。

### C2 顶层列表与活跃父任务 children 快照

- Covers: AC2
- Preconditions:
  1. C1 通过（嵌套落位已成立）。
  2. 探针在隔离 HOME 与 TMPDIR 下运行，夹具项目为 `initWorkloom` 骨架；结束清理。
- Steps:
  1. `cd packages/core && node --test test/session-context.test.ts`，定位新增 children 行、截断、损坏跳过与候选节用例，记录实际用例名。
  2. 探针 `case-evidence/probes/c2-list-context-probe.mjs` 建一个项目三个父任务：
     1. 父 A 下设两个子任务：一个保持 planning，另一个直接改写 task.json 为 `status='completed'`、`stage='completed'`（新完成态）。
     2. 父 B 下设九个 planning 子任务；父 C 下设两个子任务，其中一个 task.json 写成非法 JSON。
     3. `listTasks(root)` 断言只返回 A/B/C 三个顶层摘要，无任何 `/subtasks/` 路径与子任务标题。
     4. 活跃父快照：`const [, viewA] = readTaskView(root, A)` 后 `assembleSessionContext({ root, turnTask: viewA, workflowSteps: [] })`，断言活跃行含 A 标题/状态；children 行逐字匹配 `  - "<title>" (<status>) at <taskRelPath>`，A 的两个子任务状态分别为 `planning` 与 `completed`，顺序与 children 一致。
     5. 截断断言：对父 B 的快照中 children 行恰 8 条，另有一条含剩余数量（1）与 more 的提示行；第 9 个子任务路径不出现。
     6. 损坏跳过断言：对父 C 的快照 `err === null`，仅渲染合法子任务一条，非法 JSON 子任务不出现。
     7. 无活跃任务快照：`turnTask: null` 时候选节只列 A/B/C 三个顶层任务，输出不含 `/subtasks/`、不含子任务标题。
- Expected:
  1. 嵌套子任务不出现在 listTasks 输出与候选节。
  2. 活跃父任务的 children 行含标题、状态、路径，顺序、8 条截断与损坏跳过均符合 R5；快照主流程不因坏记录失败。
  3. session-context 新增用例全绿。
- Evidence:
  - `case-evidence/c2-session-context-tests.log`
  - `case-evidence/c2-list-context-probe.log`
- Cleanup: 探针 finally 删除夹具项目与隔离 HOME/TMPDIR。

### C3 completed 新阶段：边表、完成迁移、兼容读与返工回边

- Covers: AC3
- Preconditions:
  1. S1-S4 与 S6 已实现（STAGES/TRANSITIONS/migrate/complete 工具就位）。
  2. 探针在隔离 HOME 与 TMPDIR 下运行，夹具用 `initWorkloom` 骨架；结束清理。
- Steps:
  1. `cd packages/core && node --test test/state-machine.test.ts`，定位新增边表、completedAt、deriveStage 兼容读与回边用例，记录实际用例名。
  2. 探针 `case-evidence/probes/c3-stage-probe.mjs`：
     1. 边表断言：`TRANSITIONS` 恰含六条新边（standard checking→completed、completed→archived、completed→implementing；light implementing→completed、completed→archived、completed→implementing），守卫分别为 `['archive-ready','case-outcome-ready']` 或空；parent 无 completed 边；`statusOfStage(STAGES.COMPLETED) === 'completed'`。
     2. 完成迁移：建标准任务 T（`createTask` 后直接改写 task.json 为 `status='in_progress'`、`stage='checking'`、check 凭据、无 case 的 legacy 形态），调 `executeCompleteTask(root, 'c3_ctx', { taskPath: T })`；断言视图 stage/status 均为 `completed`、raw task.json status/stage 均为 `completed`、`completedAt` 非空、目录仍在 `tasks/<T>` 且 `tasks/archive` 无同名目录。
     3. 再次 `readTaskView` 断言仍为 completed（新枚举值优先，不被 status=completed 误读为 archived）。
     4. 归档边干跑：`evaluateTransition(root, T, 'archived')` 无错（legacy case 下 case-outcome-ready 平凡通过、archive-ready 有 check 凭据）。
     5. 返工回边：`migrateTask(root, { taskRelPath: T, to: 'implementing' })` 成功且无需 force；视图 stage/status 为 implementing/in_progress；迁移表查得 completed→implementing 无守卫。
     6. 兼容读兜底：另建两个最小任务目录 D1=`{title,status:'completed'}`（无 stage）与 D2=`{title,status:'in_progress',stage:'completed'}`，`readTaskView` 分别断言 D1 为 archived、D2 为 completed。
  3. 旧数据回归：在全量 state-machine 输出中定位既有「旧归档记录读作 archived」用例，记录用例名并确认全绿。
- Expected:
  1. 六条新边与守卫、statusOfStage 映射、completed 迁移的 stage/status/completedAt 与「目录未动」全部成立。
  2. 新完成态不被误读为 archived；旧数据 `status=completed` 无 stage 仍兜底 archived；completed→implementing 可达。
  3. state-machine 全绿，新增用例可在输出中定位。
- Evidence:
  - `case-evidence/c3-state-tests.log`
  - `case-evidence/c3-stage-probe.log`
- Cleanup: 探针 finally 删除夹具项目与隔离 HOME/TMPDIR。

### C4 父级联归档全链：子完成→父集成→集成 CASE 双轮→整树搬迁

- Covers: AC4、AC5
- Preconditions:
  1. C3 通过；git 可用；探针在隔离 HOME 与 TMPDIR 下运行，夹具为真实临时 git 仓库（`initWorkloom` + `git init -b main` + 固定身份环境变量 + 首提交含 `.workloom` 与 `c.txt`），配置 `{ packages: { repo: { path: '.' } }, worktree: { enabled: true, cleanup: 'keep-branch' } }`。
  2. 探针执行 `process.env.HOME`/`TMPDIR` 重定向后再导入 core；结束删除夹具仓库与隔离目录，不写生产目录。
- Steps:
  1. 探针 `case-evidence/probes/c4-parent-chain-probe.mjs` 跑全链：
     1. 建父 P（`executeCreateTask({ mode: 'parent' })`），写满足 start 门禁的最小 prd/plan/jsonl（复用 `test/worktree-lifecycle.test.ts` 的 satisfyStartGate 口径），经 `confirmPrd` + `recordPlanReview` reviewing→clean + `confirmPlan` 落确认记录，`executeStartTask` 后断言 P 在 orchestrating、worktree 已建、`case.required === true`。
     2. 以 parent P 建子 C，写同款 start 门禁与确认记录后 `executeStartTask`，断言 C 在 implementing、worktree 已建（base 为 P 分支）。
     3. C 未完成时 `migrateTask(P, 'integrating')` 被 children-archived 拒绝（消息含 `guard "children-archived" failed` 与 C 路径），P 仍 orchestrating。
     4. 子完成：改写 C 的 task.json 删 case（legacy 形态），`recordCasePhase` designing→reviewing→approved，`executeCheckTask(C)` 后 C 在 checking，`executeCompleteTask(C)` 后 C 视图 stage/status completed；断言 C raw status/stage completed、completedAt 非空、目录仍嵌套、P children 未变。
     5. `migrateTask(P, 'integrating')` 通过（children-archived 认新完成态），P 视图 integrating。
     6. 集成 CASE 双轮（夹具版）：`recordExecutorDispatch(P, { kind: 'checker', purpose: 'case-design', childId: 'fixture-design', title })` → `case.designSession === 'fixture-design'` 且轨道 designing；`settleExecutorDispatch(P, { childId: 'fixture-design', status: 'completed' })` → 轨道 reviewing（设计产出交主会话复核）；`recordExecutorDispatch(P, { kind: 'checker', purpose: 'execution', childId: 'fixture-design', title })` → 轨道 approved→executing（续同会话）。在 P 任务目录写夹具 case.md 与 case-result.md（模板最小合法形状：CASE 六段 + RESULT 七段；front matter task=P；References Implementation 含 `<C>/plan.md` 指针；SR1 Target `c.txt`；Traceability 行 AC1→SR1/C1；Coverage 段声明 generated、Exclusions 一条、Raw outputs 指向 `coverage/fixture.lcov.info`；RESULT checkSession=fixture-design、status passed、codeBaseline 非空、SR1/C1 status passed、Changed Files 含 `c.txt`、Overall lines 形如 `2/2 (100.0%)`、Standard Verification 行退出码 0），并创建 `case-evidence/fixture.log` 与 `coverage/fixture.lcov.info`（夹具 RESULT 的 coverage 只求形状合法，验门禁可判定性，真实覆盖率归 C7）；断言 `evaluateGuard('integration-case-passed', P视图, ctx)` 通过。夹具版双轮只验机制与门禁，真实 Checker 双轮由本任务执行轮承担（见 C5 步骤 3）。
     7. `executeCheckTask(P)` 记录父 check；`evaluateTransition(P, 'archived')` 通过。
     8. 失败封闭：在 C 的 worktree 写未跟踪脏文件，`executeArchiveTask(P)` 失败（消息含 C worktree 路径与 `uncommitted changes`）；断言 P 目录仍在 `tasks/`、P worktree 仍在、C worktree 仍在、P stage 仍 integrating；删除脏文件后重跑归档成功。
     9. 归档结果断言：P 目录从 `tasks/<P-dir>` 消失并落于 `tasks/archive/<YYYY-MM>/<P slug>`；C 目录随树位于 `archivedP/subtasks/<C-dir>`；C raw status/stage 仍 completed、completedAt 与归档前逐字一致；P raw status=`completed`、stage=`archived`、completedAt 非空；P 与 C 的会话指针文件均被清理；`git worktree list` 无 P/C 注册，两个 worktree 目录不存在。
  2. 单测变体：`cd packages/core && node --test test/task-ops.test.ts test/worktree-lifecycle.test.ts`，定位并复跑级联变体用例（子先清理顺序、已归档子任务跳过、子记录不可读阻断、completedAt 不覆盖），记录实际用例名。
- Expected:
  1. 子任务 completed 后父 orchestrating→integrating 守卫通过；父集成 CASE 门禁通过后归档成功，整树落于 `tasks/archive/<YYYY-MM>/<father>`，子任务保持 completed 随树入档。
  2. 子 worktree 清理失败阻断父归档且父目录未动，清理后重跑幂等成功；子任务指针被清理。
  3. 级联单测变体全绿。
- Evidence:
  - `case-evidence/c4-parent-chain-probe.log`
  - `case-evidence/c4-cascade-tests.log`
- Cleanup: 探针 finally 删除夹具仓库、worktree 注册与隔离 HOME/TMPDIR。

### C5 集成 CASE 门禁：父自身 RESULT、会话链与负向拒绝

- Covers: AC5
- Preconditions:
  1. C3 通过（integration 边与 completed 语义就位）；探针在隔离 HOME/TMPDIR 下运行，夹具为临时 git 仓库（首提交后每次改写都提交，保持 `git diff` 为空）。
  2. 夹具父任务无 worktree，changed files 以项目根计算；`c.txt` 在首提交中。
- Steps:
  1. `cd packages/core && node --test test/case.test.ts test/state-machine.test.ts`，定位 CASE 结果门禁、会话链与 parent 归档边用例，记录实际用例名。
  2. 探针 `case-evidence/probes/c5-integration-gate-probe.mjs`：
     1. 建临时 git 项目（`initWorkloom` + `c.txt` 首提交）；`createTask` 建父 P（mode parent），把 prd.md 覆写为含 AC1 的最小结构（同 satisfyStartGate 口径）；改写 task.json：status in_progress、stage integrating、check 凭据、`case { required: true, designSession: 'fixture-design', phase: 'executing' }`、`children: [C]`；建子 C 目录与 plan.md（C 无 check/case 凭据）；写合法 case.md/case-result.md（同 C4 形状，References Implementation 含 `<C>/plan.md`）与 evidence/coverage 文件；`git add -A && git commit`。
     2. 正向：`evaluateGuard('integration-case-passed', readTaskView(P).view, ctx)` 通过——证明只求值父自身 RESULT、不校验子任务凭据（R11/R12）。
     3. 负向三形态（每次改写后 `git add -A && git commit`）：删 case-result.md → 拒绝且 reason 含 `case-result.md is missing`；status 改 `failed` → 拒绝且含 `RESULT status must be passed`；checkSession 改 `other` → 拒绝且含 `checkSession is neither`。
     4. 会话链：result `checkSession='exec-b'` 且在 task.json 增 checker 派发 `{ childId: 'exec-b', fallbackOf: 'fixture-design', purpose: 'execution' }` → guard 通过（fallbackOf 链可达）；改回 checkSession 等于 designSession → 同样通过；提交后复跑。
     5. 归档边：`evaluateTransition(P, 'archived')` 正向通过；删 result 后同调用失败，消息含 `guard "integration-case-passed" failed` 且不含 `guard "archive-ready" failed`（check 凭据仍在）。
     6. 注释检查：读 guards.ts 的 guardIntegrationCasePassed JSDoc，断言无「待父子编排细化」「待细化」，且含「父任务自身」「children-archived」终态表述。
  3. 真实任务自证：读 `<task>/task.json`，断言 `case.designSession` 非空（本任务为 case-design 派发落值）、dispatches 中存在 purpose=case-design 与 execution 两条 checker 记录，且 execution 的 childId 等于 designSession 或经 fallbackOf 链可达；执行轮写 case-result.md 时按该 designSession 填 `checkSession`（最终同链由后续 `workloom_task_check` 的结果门禁复核，本步把 task.json 事实记入 `c5-real-session-chain.md`）。
- Expected:
  1. 父任务自身 RESULT 通过时 integration-case-passed 通过，且不因缺少子任务凭据而失败；缺 RESULT、失败 RESULT、错会话均被拒绝。
  2. 同会话与 fallbackOf 链两种证法均可通过；归档边负向时 rejection 归属 integration-case-passed。
  3. 本任务真实执行轮 case-result 的 checkSession 与 designSession 同链；注释无「待细化」字样。
- Evidence:
  - `case-evidence/c5-case-tests.log`
  - `case-evidence/c5-integration-gate-probe.log`
  - `case-evidence/c5-real-session-chain.md`
- Cleanup: 探针 finally 删除夹具仓库与隔离 HOME/TMPDIR。

### C6 清理与文档：subtasks 字段、worktree.d.ts 注释、workflow.md 与簿记

- Covers: AC6
- Preconditions:
  1. S10-S12 已实现；命令在 worktree 根执行，`<task>` 为主检出任务目录。
  2. 只读检查；不修改 worktree。
- Steps:
  1. 生产面 grep：`grep -rn "subtasks" packages/core/src packages/dsh-workloom/src --include="*.ts" --include="*.mjs"`，断言命中仅有 records.ts 的 `DIR_NAMES.subtasks` 定义、create.ts 的 `DIR_NAMES.subtasks` 引用与说明性注释；不存在 `subtasks:` 字段写入，也不存在 `TaskRecord.subtasks` 类型声明。
  2. 测试/评测面 grep：`grep -rnE "subtasks:|\.subtasks" packages/core/test packages/dsh-workloom/test packages/core/resources --include="*.ts" --include="*.mjs"` 零命中；`node --check packages/core/resources/skills/workloom-case-active/evals/build-fixtures.mjs` 与 archived 同款命令退出码 0。
  3. `worktree.d.ts` 头注释人检：前 4 行含 `worktree-lifecycle.ts` 与 `worktree-integrate.ts`，不含 `worktree.js`。
  4. `workflow.md` 人检：1.4 段含 "every declared subtask is completed"，含 `<father>/subtasks/<child>` 与 completed 不单独归档/随父归档的表述，不含 "every declared subtask is archived"。
  5. `node --test test/subtask-contract.test.ts`（core）全绿。
  6. 簿记：读主检出 `.workloom/tasks/11-06-sop-refactor/requirements-addendum.md`，断言存在「子任务五实现观察」节，内容含 task-ops.ts 超 600 行事实、接受现状理由与拆分归子任务七输入。
- Expected:
  1. subtasks 只剩目录名常量，生产与测试夹具零字段引用；task.json 存量键读取忽略（SR8 静态 + C3 读取路径）。
  2. worktree.d.ts 注释与实际模块一致；workflow.md 约定就位且契约测试全绿。
  3. 超线拆分簿记已登记。
- Evidence:
  - `case-evidence/c6-grep.log`
  - `case-evidence/c6-docs-checks.md`
  - `case-evidence/c6-subtask-contract.log`
- Cleanup: none。

### C7 标准验证、覆盖率与代码指纹

- Covers: AC6
- Preconditions:
  1. C1 至 C6 完成；执行轮 work commit 可以未落（2.3 CASE 先于 2.4 提交）。
  2. 命令在 worktree 根执行，build 先行（dsh 经 core 的 dist 解析）。
- Steps:
  1. `pnpm -r build`
  2. `pnpm -r typecheck`
  3. `pnpm lint`
  4. `cd packages/core && pnpm test`
  5. `cd packages/dsh-workloom && pnpm test`
  6. `git status --porcelain packages/core/dist packages/dsh-workloom/dist` 与 `git status --porcelain`
  7. `git diff --stat`、`git diff --name-only --no-renames --diff-filter=d HEAD --` 与 `git ls-files --others --exclude-standard`（相对 HEAD 的变更集，供 Changed Files 判定）
  8. 覆盖率聚合：按 Coverage 的 Aggregate command 生成两份 lcov 到 `<task>/coverage/`，按 Changed Files 汇总 Overall lines。
  9. 代码指纹：按 workloom-case-active skill 资源目录解析 `scripts/task-fingerprint.mjs`，运行 `node <skill>/scripts/task-fingerprint.mjs <worktree>`，记录 `codeFingerprint=<64-hex>`。
- Expected:
  1. 步骤 1-3 退出码 0，lint 无 error 与 warning。
  2. 步骤 4-5 退出码 0、0 fail；两包 dist 镜像守卫与 core dist-dts 守卫在同一输出中通过。
  3. 步骤 6：build 后 dist 与 src 镜像一致；work commit 未落时 dist 的 staged/unstaged 变更属预期状态，照实记录并注明「待主会话 2.4 单一 work commit 落地」，不据此判失败；「dist 与 src 同 commit」由主会话提交时复核。
  4. 步骤 7：变更集完整；非豁免现存可执行文件与 Coverage 的 Changed Files 一一对应。
  5. 步骤 8-9：两份 lcov 存在、Overall lines 为 `covered/total (百分比)`，指纹为 64 位十六进制并写入结果 codeBaseline。
- Evidence:
  - `case-evidence/c7-build.log`
  - `case-evidence/c7-typecheck.log`
  - `case-evidence/c7-lint.log`
  - `case-evidence/c7-core-tests.log`
  - `case-evidence/c7-dsh-tests.log`
  - `case-evidence/c7-dist-status.log`
  - `case-evidence/c7-change-set.log`
  - `case-evidence/c7-fingerprint.log`
- Cleanup: none。

## Coverage

- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Instrumentation: 两包先经 C7 步骤 1 的 `pnpm -r build`；测试以 coverage 模式各跑一遍，`--test-coverage-include` 同时含 `src/**` 与 `dist/**`（core 测试直接 import src 的 TS 模块；dsh 测试另经 `@workloom-ai/core` 加载 core 的 dist，一并纳入防漏），lcov 原始报告写入 `<task>/coverage/`。聚合时把 `SF:dist/...` 映射回 `SF:src/...`，同名源文件取 src 记录；未覆盖行取 lcov 中 hits=0 的 DA 行号区间。
- Aggregate command:
  ```bash
  MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-06-sop-parent-child"
  mkdir -p "$TASK/coverage"
  cd packages/core
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/core.lcov.info" \
    'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'
  cd ../dsh-workloom
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/dsh-workloom.lcov.info" \
    'test/*.test.ts'
  ```
- Scope: 本轮变更的现存可执行模块，即 `packages/core/src/task/state/values.ts`、`packages/core/src/task/state/view.ts`、`packages/core/src/task/state/transitions.ts`、`packages/core/src/task/state/migrate.ts`、`packages/core/src/task/storage/records.ts`、`packages/core/src/task/storage/list-archive.ts`、`packages/core/src/task/storage/create.ts`、`packages/core/src/task/storage/read-write.ts`、`packages/core/src/task/task-ops.ts`、`packages/core/src/task/state/guards.ts`、`packages/core/src/injection/session-context.ts`、`packages/core/src/injection/surface.ts`、`packages/dsh-workloom/src/tooling/tasks.ts`；若实施另抽模块或新增文件，执行轮按实际 `git diff --name-only` 补入本清单并在结果注明（超出 SR 目标清单时需先回主会话复评 CASE）。
- Exclusions:
  - packages/core/dist/: 构建产物，C7 验 build 后与 src 镜像一致，同 commit 由主会话提交时复核
  - packages/dsh-workloom/dist/: 构建产物，C7 验 build 后与 src 镜像一致，同 commit 由主会话提交时复核
  - packages/core/test/: 测试夹具与新增钉住用例自身，C2/C3/C4/C5/C7 验全绿
  - packages/dsh-workloom/test/: dsh 测试夹具与 complete 注册用例自身，C5/C7 验全绿
  - packages/core/resources/skills/workloom-case-active/evals/build-fixtures.mjs: 评测夹具（删 subtasks 字段），C6 以 node --check 验语法
  - packages/core/resources/skills/workloom-case-archived/evals/build-fixtures.mjs: 评测夹具（删 subtasks 字段），C6 以 node --check 验语法
  - packages/core/resources/workflow/workflow.md: 静态文档资源，C6 人检与 subtask-contract 测试
  - packages/core/src/workspace/worktree.d.ts: 类型声明面（仅头注释），无运行时行，C6 人检
  - packages/core/src/index.ts: 导出面改线（executeCompleteTask 具名导出），无独立运行时逻辑，由 build/typecheck 与 SR13 验证
  - **/*.js.map: 构建映射产物，无运行时行
- Raw outputs:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

## Standard Verification

时序纪律：build 先行，`pnpm -r typecheck` 与两包测试排在 `pnpm -r build` 之后（dsh 经 core 的 dist 解析）；core 测试直跑 src TS，仍统一按 build 先行执行。退出码单元格只写裸 `0`，补充说明放 Evidence 列。

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | `0` | `case-evidence/c7-build.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/c7-typecheck.log` |
| `pnpm lint` | `0` | `case-evidence/c7-lint.log`（无 error 与 warning） |
| `cd packages/core && pnpm test` | `0` | `case-evidence/c7-core-tests.log`（0 fail，含 dist-mirror 与 dist-dts 守卫） |
| `cd packages/dsh-workloom && pnpm test` | `0` | `case-evidence/c7-dsh-tests.log`（0 fail，含 dist-mirror 守卫） |

## Result Discipline

1. Standard Verification 表：列为 Command、Exit code、Evidence；退出码单元格只写裸 `0`，任何附注（0 fail、守卫、lint 清洁度、commit 状态）一律放 Evidence 列，不写入退出码单元格。
2. Coverage 的 Overall lines 只写 `covered/total (百分比)` 形态（如 `123/456 (27.0%)`），不附加其他文字；Uncovered lines 取 lcov 中 hits=0 的 DA 行号区间。
3. Exclusions 格式统一为 `- <模式>: <原因>`：目录以尾斜杠结尾、精确文件路径不带星号、跨层声明用独立段（`**/*.js.map`）；case-result 的 Exclusions 表 Path 与 Reason 两列均反引号包裹，且与本节逐条同路径同原因（不多不少、不改写）。
4. Changed Files 只列非豁免的现存变更文件（新建文件在执行轮存在且非豁免则列入；豁免路径不入表）；以 C7 步骤 7 的实际 git 变更集为准，若实际变更超出 Coverage Scope，按实际补入并在结果注明。
5. 预写容忍条款（前两个子任务口径）：执行轮 work commit 尚未落地（2.3 CASE 先于 2.4 提交），Changed Files 以 worktree 相对 HEAD 的 diff 加未跟踪文件计，允许其非空并在结果说明；C7 步骤 6 观察到 dist 的 staged/unstaged 变更属预期状态，照实记录并注明「待主会话 2.4 单一 work commit 落地」，不得据此判失败；「dist 与 src 同 commit」由主会话提交时复核。
6. 结果末节约定：`## Open issues` 必须是最后一节且正文只写 `- none`（门禁硬校验）；发现的 P0/P1 按执行契约写入回报正文，不写进 RESULT；`## Resolved Findings` 无条目时写 `- none`。
7. 证据完整性：每条 SR 的 Evidence 写实际读取的文件与观察（含行号锚点），不复述本 CASE 的预期文案；每条 C 的 Evidence 必须实际生成且内容非空，探针源码存 `<task>/case-evidence/probes/`，探针在隔离 HOME 与 TMPDIR 下运行并自清理，不写生产目录。

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR5、SR6、SR7、SR9、SR22 | C1 |
| AC2 | SR16、SR25 | C2 |
| AC3 | SR1、SR2、SR3、SR4、SR10、SR12、SR13、SR14、SR23、SR27 | C3 |
| AC4 | SR7、SR11、SR15、SR22、SR24 | C4 |
| AC5 | SR3、SR15 | C5 |
| AC6 | SR5、SR8、SR17、SR18、SR19、SR20、SR21、SR22、SR23、SR26 | C6、C7 |
