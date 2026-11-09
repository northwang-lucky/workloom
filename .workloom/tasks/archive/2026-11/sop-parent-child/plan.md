# 父子任务编排 plan

## Design decisions

1. **新阶段值命名 `completed`**：与呈现状态值同名，statusOfStage 恒等映射；拒绝 `done`（与 CASE 轨道 `done` 相位混义）。completed 即"完成未归档"：目录不动、worktree 保留，raw status 经 migrateTask 的 statusOfStage 同步落 `completed`。
2. **deriveStage 顺序调整**：原始 stage 落盘值命中 STAGE_VALUES 时优先采用（提前返回），旧 `status === 'completed'` 与归档路径判定退居其后只做存量兜底——新代码 stage/status 恒成对落盘，completed-not-archived 不再被误读为 archived；无 stage 字段的旧归档记录仍走兜底正确映射。
3. **completedAt 语义**：completed 迁移即落 completedAt（migrate.ts 扩展，`completedAt === null` 时才写）；归档落盘的 completedAt 写同步改空值守卫（S7），不再覆盖完成时刻。字段名即"任务完成时刻"，与归档时刻解耦。
4. **创建期全库 slug 唯一顺带收紧现状**：现行同 slug 跨日期可建（`11-06-foo` 与 `11-07-foo` 共存），但 start 时渲染分支名撞车（task.name=slug）。新校验把拒绝提前到创建期，跨日期同名一并拦截。
5. **级联清理顺序与失败策略**：归档父任务时先深度优先递归清理子任务 worktree（子先于父），任一失败即阻断、父目录未动；cleanupTaskWorktree 幂等，重跑安全。子任务记录不可读（目录被删等数据不一致）时 fail loud，由用户清理 children 后重试。
6. **完成动作用独立工具** `workloom_task_complete`：check 是 2.3 凭据记录，完成是生命周期迁移，职责分离；迁移守卫直接复用迁移表新边（archive-ready + case-outcome-ready），工具层零新增守卫。parent 模式无 completed 边，查表自动拒绝。
7. **children 清单渲染进活跃任务上下文**（activeTaskContextFromRecord，所有 depth）：编排现场（含父任务的 executor 派发）都能看到子任务现状；8 条截断防注入膨胀，损坏记录跳过不阻塞快照。
8. **subtasks 死字段运行时剔除**：normalizeTaskRecord 展开后显式 delete——存量 task.json 的该键在下一次写回时自然消失，类型面（TaskRecord）同步删除。
9. **integration-case-passed 零行为变更**：现状桩（求值父任务自身 RESULT 门禁）即终态，只修订注释。
10. **嵌套落位常量进 DIR_NAMES**：`subtasks` 字面量收进 records.ts 冻结常量；TASK_DIR_DATE_PREFIX 从 list-archive.ts 提升为 records.ts 导出常量，create 查重与 list-archive 回退共用。
11. **task-ops.ts 超 600 行接受现状**：该文件现 934 行，本任务再加 complete 段与级联 helper 必破千；沿袭子任务三对 state-machine.ts/task-storage.ts 的同款裁定——生命周期编排各口需同单元评审，拆分单独成任务成本高，接受现状并在增补记录登记（拆分归子任务七输入），不在本任务顺手拆。

## Steps

#### 步骤 S1 ：completed 阶段值与兼容读调整

- Covers: AC3
- Target: packages/core/src/task/state/values.ts（STAGES）、packages/core/src/task/state/view.ts（statusOfStage、deriveStage）
- Edit:
  ```text
  Input: values.ts 的 STAGES（L30-38，现七值：aligning/planning/implementing/checking/orchestrating/integrating/archived）；view.ts 的 statusOfStage（L141-145：archived→completed、aligning/planning→planning、其余 in_progress）与 deriveStage（L172-197：首行 `record.status === 'completed' || isArchivePath(taskRelPath)` 直返 archived，L184 `STAGE_VALUES.has(raw)` 判定在其后）。
  Output: STAGES 增 COMPLETED: 'completed'（八值）；statusOfStage 增 completed→'completed'；deriveStage 调整判定顺序——原始 stage 命中 STAGE_VALUES 提前返回，status=completed/isArchivePath 兜底判定移至其后。
  Preconditions: none。
  Procedure: values.ts STAGES 对象内加 COMPLETED 条目（保持 Object.freeze as const 形态）。view.ts statusOfStage 首行加 completed 分支。view.ts deriveStage 重排：先取 record.stage，命中 STAGE_VALUES 即返回；未命中再执行现状的 status completed/isArchivePath 归档兜底、planning 确认推导、旧 stage 值映射与报错分支（内容不动）。同步更新两函数头注释（completed-not-archived 语义一句话）。
  Failure: 未映射 stage 值仍走原报错分支（行为不变）；旧数据（无 stage 字段 + status completed）仍读作 archived（回归由 S13 钉住）。
  ```
- Verify: `cd packages/core && node --test test/state-machine.test.ts` 现有用例全绿。

#### 步骤 S2 ：迁移表新边

- Covers: AC3
- Target: packages/core/src/task/state/transitions.ts（TRANSITIONS）
- Edit:
  ```text
  Input: transitions.ts 的 TRANSITIONS 表（L58-78）：standard 含 checking→archived（guards archive-ready + case-outcome-ready），light 含 implementing→archived，parent 无 completed 相关边。
  Output: 六条新边进表：standard checking→completed、standard completed→archived（两守卫同归档边 archive-ready + case-outcome-ready）、standard completed→implementing（无守卫）；light implementing→completed、light completed→archived（同两守卫）、light completed→implementing（无守卫）。文件头注释（L49-57）补 completed-not-archived 一段。
  Preconditions: S1 已落（STAGES.COMPLETED 存在）。
  Procedure: 按表内现有条目风格（mode/from/to/guards 冻结数组）追加六条；completed→implementing 的 guards 传空 guards()；头注释的三模式路线描述各补 completed 注记（standard：checking→completed→archived，completed↛implementing 回边无守卫）。
  Failure: 无新失败路径；parent 模式到 completed 无路径，findTransitionPath 返回 null 的既有报错自然生效。
  ```
- Verify: `node --test test/state-machine.test.ts` 现有用例全绿；S13 新用例钉六条边与回边。

#### 步骤 S3 ：completedAt 随 completed 迁移落盘

- Covers: AC3
- Target: packages/core/src/task/state/migrate.ts（migrateTask，L224-226）
- Edit:
  ```text
  Input: migrateTask 的 completedAt 分支（L224）：`if (params.to === STAGES.ARCHIVED && record.completedAt === null) { record.completedAt = ... }`。
  Output: 条件扩为 `to === STAGES.ARCHIVED || to === STAGES.COMPLETED`，completedAt === null 时才写；头注释（L197-199）补一句。
  Preconditions: S1 已落。
  Procedure: 把 completedAt 分支的条件扩展为命中 ARCHIVED 或 COMPLETED 均落时间（null 守卫不变）；注释说明 completed 即任务完成时刻、归档不覆盖。
  Failure: 无新失败路径。
  ```
- Verify: `node --test test/state-machine.test.ts` 全绿；S13 新用例钉 completedAt。

#### 步骤 S4 ：创建嵌套落位与全库 slug 唯一

- Covers: AC1
- Target: packages/core/src/task/storage/records.ts（DIR_NAMES、新增 TASK_DIR_DATE_PREFIX 导出）、packages/core/src/task/storage/list-archive.ts（TASK_DIR_DATE_PREFIX 改为导入）、packages/core/src/task/storage/create.ts（createTaskInternal、buildTaskRecord 不变）
- Edit:
  ```text
  Input: records.ts 的 DIR_NAMES（L24-27：tasks/archive 两值）与 TaskRecord.subtasks（L221）；list-archive.ts 的 TASK_DIR_DATE_PREFIX（L39：私有正则 `/^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])-/`）；create.ts 的 createTaskInternal 路径段（L356-372：`const taskRelPath = join(DIR_NAMES.tasks, `${formatMonthDay(now)}-${slug}`)`、existsSync 冲突检查）、parent 校验段（L363-368）与 node:path 导入（L13：现只导入 join）。
  Output: DIR_NAMES 增 subtasks: 'subtasks'；TASK_DIR_DATE_PREFIX 提升为 records.ts 导出常量、list-archive.ts 改导入；createTaskInternal 在 parentRelPath 非空时把 taskRelPath 改为 join(parentRelPath, DIR_NAMES.subtasks, dirName)（注意：是直接在父任务目录下挂 subtasks 层，不是 dirname(parentRelPath)——后者会把子任务建到 tasks/subtasks/ 丢失父目录段）；新增 assertSlugUniqueActiveTree 私有校验：递归扫描 tasks/ 活跃树（跳过 archive），目录名去日期前缀后与 slug 相等即抛错；校验全部前置（任何写盘前）。
  Preconditions: none。
  Procedure: ① records.ts 加 subtasks 键与导出 TASK_DIR_DATE_PREFIX（正则体原样迁移）。② list-archive.ts 删本地常量改 import。③ create.ts L13 导入补 dirname 保留（其他用途）。④ create.ts 调整顺序：slug 校验后先归一 parent（现状），再算 dirName = `${formatMonthDay(now)}-${slug}` 不变，taskRelPath = parentRelPath !== null ? join(parentRelPath, DIR_NAMES.subtasks, dirName) : join(DIR_NAMES.tasks, dirName)；接着跑 assertSlugUniqueActiveTree(projectRoot, slug)；再做 existsSync 目标冲突检查（作用于新 taskRelPath，原注释保留）；validateParent 仍在目录检查前（自引用拦截语义不变）。⑤ assertSlugUniqueActiveTree 实现：readdirSync 递归遍历 tasksDir，遇 DIR_NAMES.archive 跳过，目录名经 TASK_DIR_DATE_PREFIX 去前缀后与 slug 相等即抛 `${ERR_PREFIX}: slug already exists in active tree: <slug>`。⑥ linkChildToParent 与 buildTaskRecord 不动（children 收嵌套路径、mode 写 parent 维持）。
  Failure: 同 slug（任意层级、任意日期前缀）在写盘前拒绝；existsSync 冲突与 parent 校验失败语义不变；递归扫描 IO 失败按 toError 透传。
  ```
- Verify: `node --test test/task-store.test.ts` 现有用例全绿；S13 新用例钉落位、children 路径、跨层同名拒绝。

#### 步骤 S5 ：带 parent 创建不抢会话指针

- Covers: AC1
- Target: packages/core/src/task/task-ops.ts（executeCreateInternal，L222-228）
- Edit:
  ```text
  Input: executeCreateInternal 的指针段（L222-228）：创建成功后无条件 `setActiveTask(found.root, contextKey, result.taskRelPath)`。
  Output: parent 参数非空时跳过 setActiveTask（会话指针不动）；无 parent 维持现状。文件头注释（L11-13 的 create 入参过滤段）补一句指针分流。
  Preconditions: S4 已落（parent 语义完整）。
  Procedure: 在 setActiveTask 调用外加 parent 非空守卫（params.parent 为字符串且非串空才跳过）；found 查找逻辑共用；其余不动。
  Failure: 无新失败路径（setActiveTask 失败语义不变）。
  ```
- Verify: `node --test test/task-ops.test.ts test/active-task.test.ts` 现有用例全绿；S13 新用例钉两种创建形态的指针差异。

#### 步骤 S6 ：新工具 workloom_task_complete

- Covers: AC3
- Target: packages/core/src/injection/surface.ts（TOOL_NAMES/TOOL_DESCRIPTIONS/TOOL_SNIPPETS）、packages/core/src/task/task-ops.ts（新增 executeCompleteTask）、packages/core/src/index.ts（导出）、packages/dsh-workloom/src/tooling/tasks.ts（注册）
- Edit:
  ```text
  Input: surface.ts TOOL_NAMES（L27-40，十二键）、TOOL_DESCRIPTIONS（L43-64）、TOOL_SNIPPETS（L71-92）、PARAM_DESCRIPTIONS.taskPath（L97）；task-ops.ts 的 checkTaskInternal（L481-543，resolveTaskRelPath/evaluateTransition/migrateTask 用法样板）与 finishTask 工具壳（L572-591）；index.ts 的 execute* 导出段（L289 附近 executeAlignTask 等）；dsh tooling/tasks.ts registerTaskTools（L44-243，taskCheck 注册样板 L96-113）。
  Output: surface 三常量各增 taskComplete 条目（snippets 形态 `workloom_task_complete(taskPath?, force?, reason?) — mark the task completed without archiving`）；task-ops 新增 ExecuteCompleteTaskParams/executeCompleteTask（resolveTaskRelPath → evaluateTransition(to: STAGES.COMPLETED, forceOpts) → migrateTask 同参数 → 返回迁移后视图，模式同 startTaskInternal 的守卫干跑+迁移两段）；index.ts 导出 executeCompleteTask；dsh 注册第 11 个任务工具（name/description 引 surface 常量，参数 taskPath/force/reason 可选取样照 taskCheck）。
  Preconditions: S1-S3 已落（迁移表有 completed 边）。
  Procedure: ① surface.ts 三处常量按现有条目风格追加。② task-ops.ts 在 check 段后加 complete 段：executeCompleteTask(cwd, contextKey, params) 元组壳 + 内部实现——requireWorkloomCwd 已在壳层、resolveTaskRelPath 解析（taskTool 前缀、支持活跃任务回退）、assertTaskForceReason（force 契约）、evaluateTransition 干跑、失败抛错、migrateTask 落盘、返回 view。③ index.ts 导出追加。④ tooling/tasks.ts registerTaskTools 追加注册块与 completeTaskTool 投影函数（execute 调 core executeCompleteTask）。⑤ 工具计数注释同步（按实文锚点）：surface.ts L26"十二个工具名"改"十三个工具名"、task-ops.ts 头注释"六个任务管理工具"改七个、tooling/tasks.ts L6"八个工具的编排"改"十一个工具的编排"、L40"注册十个任务管理工具"改"注册十一个任务管理工具"（枚举串同步加 complete）。
  Failure: parent 模式无 completed 边，evaluateTransition 的 no transition path 报错透传（消息含 from/to/mode）；force 缺 reason 在 assertTaskForceReason 拦截。
  ```
- Verify: `pnpm -r typecheck` 通过；`cd packages/dsh-workloom && node --test test/tasks.test.ts` 全绿；S13 新用例钉工具编排（complete 后视图 completed、目录未动）。

#### 步骤 S7 ：父任务归档级联清理子任务

- Covers: AC4
- Target: packages/core/src/task/task-ops.ts（archiveTaskInternal，L634-706）
- Edit:
  ```text
  Input: archiveTaskInternal 现状流程（L638-705）：守卫干跑 → 归档冲突检查（L656）→ cleanupTaskWorktree（父，L664）→ moveTaskToArchive（L669）→ 归档态落盘 → clearPointersToTask（L686）→ hooks/autoCommit。clearPointersToTask 经 state/index.ts 重导出（pointers 模块）。
  Output: 冲突检查后、父 cleanup 前插入级联：深度优先递归遍历 view.children，逐子任务（含嵌套孙任务）先 readTaskRecord 当前路径、缺失时 findArchivedTaskPath 按名回退——回退命中（子任务已单独归档）跳过；两路皆不可读抛错阻断。未归档子任务 toTaskView 后逐个 cleanupTaskWorktree（结果收集）；moveTaskToArchive 之后对每个子任务路径再跑 clearPointersToTask。archiveTaskInternal 返回值增 cascadedCleanups 摘要（子任务清理计数，供回执展示）。
  Preconditions: S1-S4 已落；cleanupTaskWorktree（worktree-lifecycle.ts L346）幂等语义不变。
  Procedure: ① 新增私有 cascadeChildrenCleanup(projectRoot, view, config)：递归 helper——对每个 childRelPath 先解析记录（当前路径 → findArchivedTaskPath 回退 → 皆失败抛 `child task unreadable: <path>`）；已归档（isArchivePath 命中回退路径）跳过；未归档则递归先处理其 children，再 cleanupTaskWorktree(projectRoot, toTaskView(childRecord), config)，收集结果。② archiveTaskInternal 在 L656 冲突检查后调用 cascadeChildrenCleanup，结果存 cascadedCleanups。③ 父 cleanup、move 逻辑不动；归档态落盘段的 completedAt 写加空值守卫（L675-676 的 `record.completedAt = now.toISOString()` 改为 completedAt === null 才写，与 S3 同口径，保住完成时刻）。④ clearPointersToTask 段后对每个曾存在于当前路径的子任务路径调用（清理失效指针；已归档跳过的子任务指针在自身归档时已清）。⑤ 头注释补级联语义一段。
  Failure: 子任务记录两路不可读时 fail loud（归档阻断，提示清理父 children）；子任务 worktree 脏时 cleanupTaskWorktree 阻断（语义同父）；级联失败时父目录未动，已清理子 worktree 幂等可重跑。
  ```
- Verify: `node --test test/task-ops.test.ts test/worktree-lifecycle.test.ts` 现有用例全绿；S13 新用例钉级联清理、整树搬迁、子指针清理、已归档子任务跳过。

#### 步骤 S8 ：integration-case-passed 注释修订

- Covers: AC5
- Target: packages/core/src/task/state/guards.ts（guardIntegrationCasePassed，L235-238）
- Edit:
  ```text
  Input: guards.ts L235-238：`/** 集成 CASE 通过（parent 归档守卫；当前求值 parent 自身 RESULT 门禁，多子任务集成机制待父子编排细化）。 */ function guardIntegrationCasePassed(...) { return guardCaseOutcomeReady(view, ctx) }`。
  Output: 注释改为终态表述（集成 CASE 即父任务自身 CASE：case-design 写 case.md、复核后续同会话 execution、RESULT passed 即通过；子任务凭据由 children-archived 传递保证，不在此重复校验）；函数体一行不动。
  Preconditions: none。
  Procedure: 只改 JSDoc 注释块，函数实现零改动。
  Failure: none。
  ```
- Verify: `node --test test/state-machine.test.ts test/case.test.ts` 全绿（行为零变化）。

#### 步骤 S9 ：session-context 活跃任务行附 children 清单

- Covers: AC2
- Target: packages/core/src/injection/session-context.ts（activeTaskContextFromRecord L271-288、assembleInternal L179 的 lines.push(active.line)）
- Edit:
  ```text
  Input: session-context.ts 的 ActiveTaskContext（L259-264：line+task 两字段）、activeTaskContextFromRecord（L271-288，末行返回 { line, task }）、assembleInternal（L180 `lines.push(active.line)`）；候选节渲染样式（L309-320：两格缩进 + 截断提示行）；listTasks/storage 的 readTaskView 与 findArchivedTaskPath 已是 core 导出面。
  Output: activeTaskContextFromRecord 签名加 root 入参（私有函数，唯一调用点在 assembleInternal，传入 params.root；零额外读盘契约指活跃任务解析不走第二次解析链，子记录读取是本步新增行为，注释说明）；ActiveTaskContext 增 childrenLines: string[] 字段；view.mode === MODES.PARENT 且 children 非空时逐子 readTaskView（当前路径 → findArchivedTaskPath 回退）渲染 `  - "<title>" (<status>) at <taskRelPath>"`，8 条截断加 more 提示行；assembleInternal 在 active.line 后展开 childrenLines；损坏/缺失子记录跳过不阻塞快照。
  Preconditions: none。
  Procedure: ① 常量区增 CHILDREN_INDENT（复用 CANDIDATE_INDENT 值）与 CHILDREN_TASK_LIMIT=8。② activeTaskContextFromRecord(task, root) 内 view 求得后，mode 为 parent 且 children 非空则逐子读取视图（try/catch 跳过失败项），按上述格式组行，超过上限截断加提示行；返回 { line, task, childrenLines }。③ assembleInternal 调用点改传 params.root，接收行改 `lines.push(active.line, ...active.childrenLines)`；无任务分支 childrenLines 为空数组。④ 函数头注释补 children 行语义与 root 入参用途。
  Failure: 单个子记录损坏只跳过该条（与候选节容忍策略一致）；快照主流程不受影响。
  ```
- Verify: `node --test test/session-context.test.ts test/session-assemble.test.ts` 现有用例全绿；S13 新用例钉 children 行渲染与截断。

#### 步骤 S10 ：删除 subtasks 死字段

- Covers: AC6
- Target: packages/core/src/task/storage/records.ts（TaskRecord L221）、packages/core/src/task/storage/create.ts（buildTaskRecord L178）、packages/core/src/task/storage/read-write.ts（normalizeTaskRecord L112-158）、packages/core/resources/skills/workloom-case-active/evals/build-fixtures.mjs（L62）、packages/core/resources/skills/workloom-case-archived/evals/build-fixtures.mjs（L67）、packages/dsh-workloom/test/commands.test.ts（L76）、packages/core/test/task-store.test.ts（L113）、packages/core/test/state-machine.test.ts（L53）、packages/core/test/doctor.test.ts（L65）
- Edit:
  ```text
  Input: records.ts TaskRecord.subtasks: string[]（L221）；create.ts buildTaskRecord 的 subtasks: []（L178）；read-write.ts normalizeTaskRecord 的 `...(parsed as unknown as TaskRecord)` 展开（L131，subtasks 随展开透传）；六处测试引用——两 evals build-fixtures.mjs 与 dsh commands.test.ts 的夹具字面量、task-store.test.ts L113 的 `assert.deepEqual(task.subtasks, [])` 断言、state-machine.test.ts L53 与 doctor.test.ts L65 的夹具字面量。
  Output: 类型面删 subtasks；create 不再写；normalize 展开后显式 delete 运行时键（一次写回完成存量清理）；六处测试引用同步删除；全库 grep subtasks 生产引用零命中。
  Preconditions: none。
  Procedure: ① records.ts 删 L221。② create.ts 删 L178（buildTaskRecord 其余字段不动）。③ read-write.ts normalizeTaskRecord：展开赋值给局部变量后 `delete record['subtasks']`（返回值不含该键；注释说明死字段清理）。④ 六处测试引用删行/删断言：两 evals build-fixtures.mjs 与 dsh commands.test.ts 的夹具行、task-store.test.ts L113 整条断言、state-machine.test.ts L53 与 doctor.test.ts L65 的夹具行。⑤ 全库 grep（排除 dist 与 node_modules）核对：subtasks 只剩 S4 新增常量 DIR_NAMES.subtasks 的合法引用，无其它生产与测试引用。
  Failure: 存量 task.json 含 subtasks 键读取时自然忽略（JSON 解析 + 归一剔除），不报错。
  ```
- Verify: `grep -rn "subtasks" packages/core/src packages/dsh-workloom/src packages/core/test packages/dsh-workloom/test packages/core/resources --include="*.ts" --include="*.mjs"` 除 `DIR_NAMES.subtasks` 定义与引用外零命中；`node --test test/task-store.test.ts test/case.test.ts` 全绿。

#### 步骤 S11 ：worktree.d.ts 过期注释修复

- Covers: AC6
- Target: packages/core/src/workspace/worktree.d.ts（文件头注释 L1-4）
- Edit:
  ```text
  Input: worktree.d.ts L3："与 worktree.js 的 JSDoc 保持同步"——worktree.js 已拆分为 worktree-lifecycle.ts/worktree-integrate.ts，不复存在。
  Output: 头注释改为与 worktree-lifecycle.ts/worktree-integrate.ts 的 JSDoc 保持同步（service 层引用类型不变）。
  Preconditions: none。
  Procedure: 只改注释两行，类型声明零改动。
  Failure: none。
  ```
- Verify: 人检注释与实际模块一致；`pnpm -r build` 后 dist-dts 守卫测试绿（S13 统一跑）。

#### 步骤 S12 ：workflow.md 补 subtasks 目录约定

- Covers: AC6
- Target: packages/core/resources/workflow/workflow.md（1.4 段 L70 的 create-with-parent 句之后）
- Edit:
  ```text
  Input: workflow.md L70："...create the subtasks one by one with `workloom_task_create`, each with `parent` set to the main task; every subtask runs the full lifecycle; the main task starts, checks, and archives only after every declared subtask is archived"——末句"every declared subtask is archived"与新完成态模型（子任务只标记 completed、不单独归档）矛盾，需一并改写。
  Output: L70 末句改为 completed 语义（every declared subtask is completed），并追加两句：子任务目录落位（`<father>/subtasks/<child>`，带 parent 创建自动嵌套）与完成即标记 completed、不单独归档、父任务归档时级联随树入档。
  Preconditions: S4-S7 已落（文档与行为一致）。
  Procedure: ① 把 L70 末句 "the main task starts, checks, and archives only after every declared subtask is archived" 改为 "the main task starts, checks, and archives only after every declared subtask is completed"；② 在该句末追加两句英文（与原文风格一致）："A subtask created with `parent` set lives under the parent directory as `<father>/subtasks/<child>` and never appears in the top-level task list. A completed subtask is marked `completed` in place instead of being archived; it archives together with the parent, which cascades worktree cleanup and moves the whole tree."（`final acceptance and archives last` 短语在 norms 段 L18 仍有出处，subtask-contract 测试不受影响。）
  Failure: none。
  ```
- Verify: `node --test test/subtask-contract.test.ts` 全绿（既有短语断言不破坏）；人检措辞。

#### 步骤 S13 ：测试增补与全量验证

- Covers: AC1, AC2, AC3, AC4, AC5, AC6
- Target: packages/core/test/state-machine.test.ts、packages/core/test/task-store.test.ts、packages/core/test/task-ops.test.ts、packages/core/test/session-context.test.ts、packages/dsh-workloom/test/tasks.test.ts
- Edit:
  ```text
  Input: 上述测试文件的现有用例风格（HOME+TMPDIR 隔离块、node:test + assert/strict）；S1-S12 的全部改动面。
  Output: 新增钉住用例——① state-machine：completed 六边可达、completedAt 落盘、deriveStage 新枚举优先于 legacy status、旧数据 status completed 无 stage 仍读 archived、completed→implementing 回边无守卫。② task-store/task-ops：带 parent 创建落位嵌套目录 + children 记嵌套路径 + 指针不动、无 parent 创建指针切换、跨层同 slug 拒绝、workloom_task_complete 编排（standard 成功视图 completed 且目录未动、parent 模式拒绝、force 契约）。③ task-ops：级联归档（父子双 worktree 夹具——子先清理、整树入档、子 completed 保持、子指针清理、已归档子跳过、子记录不可读阻断）。④ session-context：parent 活跃任务 children 行渲染、8 条截断、损坏子跳过。⑤ dsh tasks.test.ts：complete 工具注册存在性。
  Preconditions: S1-S12 全部完成。
  Procedure: 按各文件现有隔离与断言风格补用例；夹具目录一律 HOME+TMPDIR 隔离（沿袭全局规则）。另落一条簿记：把"task-ops.ts 超 600 行拆分"登记追加到 .workloom/tasks/11-06-sop-refactor/requirements-addendum.md（新增"子任务五实现观察"节，格式参照该文件子任务四/八节，内容含超线事实、接受现状理由、拆分归子任务七输入），落实 Design decision 11 的登记承诺。
  Failure: 任一用例红即按失败信息修实现或修用例，全绿才算完成。
  ```
- Verify: `pnpm -r build && pnpm -r typecheck && pnpm lint && cd packages/core && pnpm test && cd ../dsh-workloom && pnpm test` 全绿；随后同 commit 重建两包 dist（deployment spec 纪律）。
