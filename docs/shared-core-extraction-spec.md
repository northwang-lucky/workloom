# 下沉共享逻辑到 core 的行为规格

> 背景：adapter-dsh 与 adapter-pi 存在逐字重复的纯函数（parseInitArgs/migrationSummaryLines/readExistingDeveloper）、逐行对应的业务序列（三命令 handler、五任务操作、workloom_step 查找、executor 前四步）与契约面常量（命令/工具名、描述文案、错误前缀）。本规格把 runtime 无关部分下沉 core，两个 adapter 退化为薄投影层。
> 现状依据：主 agent 已逐文件比对（见对话分析报告）；core 目前零 workspace 依赖（仅 yaml），assets 未被打包 index.js，故**core 不依赖 assets，资产文本一律参数注入**。

## 1. 目标与原则

1. core 新增模块全部 TS（ADR-0002：新增抽象用 TS），放 `src/` 或 `src/service/`。
2. core 保持零 workspace 依赖：命令资产/契约文本由 adapter 读取后传入。
3. 中性返回：含 Error 用命名元组 `[Error | null, value | null]`（err 放首位）；纯校验函数抛错（现有 core 惯例）。
4. 运行时文案（错误消息、描述文案）英文，随 core 版本走；adapter 不再自带重复文案。
5. 行为零变化：下沉后两个 adapter 的可观察行为（命令结果文本、工具返回、错误消息）与现状逐字一致。
6. 测试随代码迁移：core 新增用例覆盖下沉逻辑，adapter 用例删除已迁移部分。

## 2. 类型声明修复（消除 WorkflowStepLike 重复的根因）

现状：`src/legacy/workflow-contract.d.ts` 是手写声明；core 的 tsc 构建（allowJs+declaration）从 .js 重新生成 dist 声明，手写 .d.ts 不进 dist，导致 dist 里 `WorkflowContract`/`WorkflowStep` 丢失，两个 adapter 被迫各写 `WorkflowStepLike` 局部接口。

修复：
1. 新增 `src/workflow-contract-types.ts`：把 `WorkflowStep`、`WorkflowContract` 两个接口移入（字段不变：WorkflowStep={id,title,body}；WorkflowContract={version,states,breadcrumbs,steps,warnings}）。
2. `src/legacy/workflow-contract.js`：全部 JSDoc `import('./workflow-contract.d.ts')` 改为 `import('../workflow-contract-types.js')`。
3. 删除 `src/legacy/workflow-contract.d.ts`。
4. `src/index.ts`：`export type { WorkflowContract, WorkflowStep }` 改为从 `./workflow-contract-types.js` 导出。
5. 验证：`pnpm -r typecheck`（两 adapter 依赖 dist 声明）与 `grep WorkflowStep packages/core/dist/workflow-contract-types.d.ts` 确认产物含类型。

## 3. core 新增 surface.ts（契约面常量）

`src/surface.ts` 导出（全部英文文案，均从两个 adapter 现状逐字提取）：

- `COMMAND_NAMES`：{init:'workloom-init', continue:'workloom-continue', finish:'workloom-finish'}
- `COMMAND_DESCRIPTIONS`：三命令的 register 描述文案（现状逐字相同）
- `TOOL_NAMES`：{taskCreate/taskStart/taskFinish/taskArchive/taskList（workloom_task_* 五名）、executor:'workloom_execute'、step:'workloom_step'}
- `TOOL_DESCRIPTIONS`：七个工具的 register 描述文案（现状逐字相同）
- `PARAM_DESCRIPTIONS`：参数描述文案（taskPath 通用描述、taskPathExecutor（executor 变体，多「of this session」）、slug/priority/description/autoCommit/status/kind/model/effort/prompt/stepId，现状逐字相同）
- `ERR_PREFIX`：{command:'workloom command', taskTool:'workloom task tool', executor:'workloom executor', stepTool:'workloom step tool'}
- `EMPTY_OUTPUT_TEXT`：'The executor subagent produced no text output.'
- `PURGE_FLAG`：'--purge'；`DEVELOPER_FILE`：'.developer'
- `ASSET_COMMAND_CONTINUE`：'commands/workloom-continue.md'；`ASSET_COMMAND_FINISH`：'commands/workloom-finish.md'
- `TASK_ARCHIVE_NOTE`：archive 收尾提示文案（含 /workloom-finish，用模板或函数拼 COMMAND_NAMES.finish）

约束：键名小驼峰；全部 `as const`；文件内注释说明各常量语义与出处。

## 4. core 新增 service/command-ops.ts

```ts
export function parseInitArgs(rawInput: string): { purge: boolean; developer: string }
export function migrationSummaryLines(result: MigrateLegacyTrellisResult): string[]  // 内部用 COMMAND_NAMES.init
export function readExistingDeveloper(cwd: string): string | undefined
export function executeInitCommand(cwd: string, args: string): [Error | null, string | null]
export function buildContinueGuidance(cwd: string, contextKey: string, body: string): [Error | null, string | null]
export function buildFinishGuidance(cwd: string, contextKey: string, body: string): Promise<[Error | null, string | null]>
```

行为（= 现状两个 adapter 的公共序列，错误前缀统一 ERR_PREFIX.command）：
- executeInitCommand：cwd 判空→parseInitArgs→developer 判定（purge 读 readExistingDeveloper / 空串 undefined）→purge 无旧项目先报错→initWorkloom(cwd,{developer,force:purge})→结果行组装（Workloom initialized/Created/nothing to purge 语义同现状）→legacyTrellisRoot 非空时 migrateLegacyTrellis(cwd,{deleteLegacy:purge})（失败附 WARNING 不阻塞）→migrationSummaryLines。
- buildContinueGuidance：cwd 判空→findWorkloomRoot→resolveActiveTask(root,contextKey)→readTask→routeNextStep→拼 `Active task/Title/Status/Next step\n\n<body>`。
- buildFinishGuidance：cwd 判空→gitStatus+countDirtyLines（脏>0 报错，文案同现状）→findWorkloomRoot→resolveActiveTask→readTask→拼 `Active task/Title/Status\n\n<body>`。
- 资产缺失检查**不在** core：adapter 先 readAssetText（路径用 core 的 ASSET_COMMAND_*），null 时按现状文案报错后直接 return。注意顺序变化：旧实现资产读取在业务检查之后，下沉后移到之前——当「资产缺失」与其他错误（无 .workloom/无活跃任务/脏文件）同时出现时，报错优先级变为资产缺失；单错误场景文案不变，属可接受偏离。

## 5. core 新增 service/task-ops.ts

```ts
export function requireWorkloomCwd(cwd: string): string                       // 空串抛 Error（ERR_PREFIX.taskTool）
export function resolveTaskRelPath(cwd: string, contextKey: string, taskPath: string | undefined): string
export async function executeCreateTask(cwd, contextKey, params: {title, slug?, priority?, description?}): Promise<[Error|null, {taskRelPath, task}|null]>
export async function executeStartTask(cwd, contextKey, taskPath?): Promise<[Error|null, TaskRecord|null]>
export async function executeFinishTask(cwd, contextKey, taskPath?): Promise<[Error|null, {taskRelPath, finished:boolean}|null]>
export async function executeArchiveTask(cwd, contextKey, taskPath?, autoCommit?): Promise<[Error|null, {taskRelPath, task, note}|null]>  // note 用 TASK_ARCHIVE_NOTE；内层 archiveTask 不需要 contextKey，但包裹层的 taskPath fallback 需要
export async function executeListTasks(cwd, status?): Promise<[Error|null, {tasks}|null]>
```

行为 = 现状两 adapter 五操作的公共序列（显式 taskPath 优先→活跃任务 fallback→core 调用→null 结果兜底报错）。create 的入参过滤（空串 slug/priority/description 不传）照 DSH 现状（Pi 侧空串字段由「报错」收敛为「回落默认」，与 DSH 对齐，属可接受的 Pi 行为收敛）。resolveTaskRelPath 的「no active task and no taskPath given」错误接受 errPrefix 参数：任务工具传 taskTool、executor 传 executor（保持下沉前各消费方文案）。

## 6. core 新增 service/step-lookup.ts

```ts
export function lookupWorkflowStep(stepId: string, contractText: string): [Error | null, WorkflowStep | null]
```

行为 = 现状两处 executeStepTool/executeStep 的公共部分：parseContract（err 转发）→ find(stepId)（未找到报错，ERR_PREFIX.stepTool）→ 返回 step。contractText 由 adapter 经 loadWorkflowContractText 读取；契约资产缺失的检查与文案（'workflow contract asset is missing'）留在 adapter。返回类型直接用修复后的 WorkflowStep（第 2 节），两个 adapter 的 WorkflowStepLike 局部接口随之删除。

## 7. adapter-dsh 改造（薄投影）

| 文件 | 改动 |
| --- | --- |
| constants.ts | 删除下沉常量（命令名/工具名/错误前缀/EMPTY_OUTPUT_TEXT/PURGE_FLAG/DEVELOPER_FILE/资产路径）；保留 CONTEXT_KEY_PREFIX='dsh'、PLUGIN_NAME、SOURCE_PLUGIN、SECTION/CONTEXT 名与 order |
| commands.ts | 删除 parseInitArgs/migrationSummaryLines/readExistingDeveloper；handleInit/handleContinue/handleFinish 改薄投影：handleInit = cwdOf + executeInitCommand + errorResult/成功文本；continue/finish = cwdOf + contextKey 组装 + readAssetText(ASSET_COMMAND_*)（null 报 missing asset，文案同现状）+ buildXxxGuidance + followup + 成功文本。错误前缀文案由 core 函数内置 |
| tasks.ts | 删除 requireCwd/resolveTaskRelPath/五个 execute 业务；注册 schema 的 description 改引用 core 的 PARAM_DESCRIPTIONS/TOOL_DESCRIPTIONS；execute 改调 core task-ops（agentId→contextKey 组装保留） |
| skills.ts | executeStepTool 改调 core lookupWorkflowStep（contractText 读取保留）；删除 WorkflowStepLike；STEPS_TOOL/描述改 core 常量 |
| executor.ts | resolveTaskRelPath 改调 core（contextKey 组装保留）；EXECUTOR_TOOL/描述/EMPTY_OUTPUT_TEXT/错误前缀改 core 常量 |
| plugin.ts | 无改动（注入胶水是 DSH 特有） |
| test/commands.test.js | 删除 parseInitArgs/migrationSummaryLines 用例（已迁移 core）；保留剩余 |

## 8. adapter-pi 改造（薄投影）

| 文件 | 改动 |
| --- | --- |
| constants.ts | 删除命令名/工具名/错误前缀/EMPTY_OUTPUT_TEXT；保留 CONTEXT_KEY_PREFIX='pi'、CONTEXT_KEY_FALLBACK、OWNER_RUN_ID_FALLBACK、NODE_ID_PREFIX、SESSION_CONTEXT_CUSTOM_TYPE |
| commands.ts | 同 DSH：删除三个重复函数；handler 改薄投影（notify 出口保留；PURGE_FLAG/资产路径改 core 常量） |
| tasks.ts | 同 DSH：execute 改调 core task-ops；schema 描述文案改 core 常量 |
| skills-tool.ts | 改调 core lookupWorkflowStep；删除 WorkflowStepLike |
| executor.ts | resolveTaskRelPath 改调 core；常量改 core 引用 |
| delegation.ts | EMPTY_OUTPUT_TEXT/EXECUTOR_ERR_PREFIX 改 core 引用；effortToThinking/buildDelegationRequest/responseToText 保留（pi-subagents 协议投影，Pi 特有） |
| agents.ts / agent-definitions.ts / inject.ts / index.ts | 常量引用随 constants 变化微调；其余不动 |
| test/ | parseInitArgs/migrationSummaryLines 用例迁 core；constants/delegation 用例按新常量来源更新 |

## 9. core 测试新增（test/*.test.js，从 dist 导入，沿用现有临时目录 setup 先例）

1. command-ops.test.js：
   - parseInitArgs：--purge 精确/带参前缀/类似前缀不误判/普通身份（迁移原 adapter-dsh 5 例 + adapter-pi 例，约 6 例）；
   - migrationSummaryLines：空 migrated 措辞、各字段组合（约 3 例）；
   - executeInitCommand：临时目录干净 init、二次 init（nothing was created）、purge 无旧项目报错、带旧 .trellis 迁移摘要、迁移失败 WARNING（约 5 例）；
   - buildContinueGuidance：无 .workloom 报错、无活跃任务报错、正常拼文本（含 Next step 行与 body）（约 3 例）；
   - buildFinishGuidance：脏文件报错、干净拼文本（约 2 例）。
2. task-ops.test.js：临时 .workloom 项目内 create→start→finish→archive→list 全链 + 无活跃任务且无 taskPath 报错 + archive note 文案（约 6 例）。
3. step-lookup.test.js：正常查找、未找到报错、坏契约报错、空 stepId（约 4 例）。
4. surface.test.js：命令/工具名非空且互不重复、描述文案非空（约 2 例）。

## 10. 验证与提交

1. `pnpm -r build`（core 先构建出新 dist）→ `pnpm lint` → `pnpm format:check` → `pnpm -r typecheck` → `cd packages/core && pnpm test` → `cd packages/adapter-dsh && pnpm test` → `cd packages/adapter-pi && pnpm test`。
2. 产物核验：`packages/core/dist/workflow-contract-types.d.ts` 存在且含 WorkflowContract/WorkflowStep；`packages/core/dist/index.d.ts` 的 re-export 指向该文件。
3. 全绿后 commit（中文 message，本轮一个）。
