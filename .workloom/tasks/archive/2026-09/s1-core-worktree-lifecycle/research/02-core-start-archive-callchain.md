tasks/09-30-s1-core-worktree-lifecycle:muniiwh72l54e073

# 课题 B 一手事实：本仓 start/archive 调用链与扩展点精读

Research report for task `09-30-s1-core-worktree-lifecycle`（Phase 1.2 research，设计树议题 B）。
全部结论为**代码事实**，锚点为 `path:line`（相对本任务仓库根）。

> Scope: `packages/core/src/legacy/{task-store,task-gates,config,init,git}.js`、`packages/core/src/service/{task-ops,doctor-check-rules,doctor-checks,doctor-fixes,doctor-types}.ts`、`packages/core/src/{index,surface}.ts`、`packages/core/test/*`、两个 adapter 的 create 调用面。只读，未改任何 src 文件。
> Format: `##` 标题即结论；每条事实带 `path:line`；存疑项显式标「未验证」。
> 配套：外部命令语义见同目录 `01-git-worktree-submodule-semantics.md`（该文件的锚点形态是「命令 + 输出摘要」）。

## B0 结论速览：现有链路是「纯状态机 + hooks + 可选 git 提交」，worktree 生命周期没有任何现有落点

| Topic | Fact |
| --- | --- |
| worktree 相关代码总量 | 全仓 src 只有两处，且都是**空占位字段**：`packages/core/src/legacy/task-store.js:346`（`worktree_path: ''`）与 `packages/core/src/legacy/task-store.d.ts:148`。`branch`/`base_branch` 字段同样只落空串（`packages/core/src/legacy/task-store.js:336-337`） |
| `package` 字段 | 已在 schema 中（`packages/core/src/legacy/task-store.d.ts:137`），但 `buildTaskRecord` 恒写 `package: null`（`packages/core/src/legacy/task-store.js:335`），且 `executeCreateTask` 不接收该参数（`packages/core/src/service/task-ops.ts:95-102`） |
| git 原语 | 只有 4 个：`gitAddCommit` / `gitStatusSync` / `gitCurrentBranchSync` / `countDirtyLines`（`packages/core/src/legacy/git.js:41,54,100,118`；导出面 `packages/core/src/index.ts:109-114`）。**没有任何 worktree / merge / rev-parse / branch 原语** |
| 状态写入点 | start 只有一个 `writeTaskJson`（`packages/core/src/legacy/task-store.js:642`）；archive 只有一个（`packages/core/src/legacy/task-store.js:1193`，在 rename 之后） |
| 门禁模块 | `task-gates.js` 是**纯求值**（无写盘、无副作用），门禁失败由 `task-store.js` 抛错；worktree 创建不能放在 gates（见 §B3） |
| 任务目录命名 | `tasks/{MM-DD}-{slug}`（`packages/core/src/legacy/task-store.js:538`），**任务目录名 ≠ slug**：目录名带 `MM-DD-` 前缀。PRD 的 `<task-id>`=任务目录名、`<task-slug>`=slug 与此一致 |

## B1 `createTask` 参数流与 task.json 字段落点：`package` 需从 `task-ops` 一路穿到 `buildTaskRecord`

调用链（三层）：

```
executeCreateTask(cwd, contextKey, params)          task-ops.ts:118-128
  └─ executeCreateInternal(...)                     task-ops.ts:137-160
       └─ createTask(cwd, {...})                    task-ops.ts:143-154
            └─ createTaskInternal(root, params)     task-store.js:528-582
                 └─ buildTaskRecord({params, ...})  task-store.js:324-366
```

`ExecuteCreateTaskParams`（`packages/core/src/service/task-ops.ts:95-102`）当前只有 `title/slug/priority/description/parent`——**没有 `package`**：

```ts
/** executeCreateTask 入参（title 必填；slug/priority/description/parent 可选）。 */
export interface ExecuteCreateTaskParams {
  title: string
  slug?: string
  priority?: string
  description?: string
  /** 父任务相对路径（tasks/<id> 或 <id>）；空串视同未传。 */
  parent?: string
}
```

透传实现（`packages/core/src/service/task-ops.ts:143-154`）用「空串不传」的展开写法，`package` 需要照此模式加一条：

```ts
const [err, result] = await createTask(cwd, {
  title: params.title,
  ...(typeof params.slug === 'string' && params.slug !== '' ? { slug: params.slug } : {}),
  ...
  contextKey,
})
```

`createTaskInternal` 的落盘序列（`packages/core/src/legacy/task-store.js:528-582`）：slug 推导 `530` → `now` 单次取时间 `537` → taskRelPath `538` → priority 校验 `540` → parent 校验 `543-546` → 目录冲突检查 `548-550` → `loadConfig` `552` → `buildTaskRecord` `555-561` → `mkdirSync` `562` → 写 task.json/prd/两个 jsonl `563-566` → 可选 `setActiveTask` `567-570` → `linkChildToParent` `572-574` → `after_create` hooks `575-579`。

**关键扩展点**：`loadConfig(projectRoot)` 在 **552 行**、且只在所有前置校验之后调用一次。`package ∈ config.packages` 的校验需要 `config`，因此**必须插在 552 之后、`buildTaskRecord`（555）之前**，才能满足「未知值 fail loud 且不产生任何写盘」（与 562 行的 `mkdirSync` 之前的纪律一致）。

`buildTaskRecord` 的字段落点（`packages/core/src/legacy/task-store.js:324-366`）：`package: null` 硬编码在 **335**、`branch: ''` **336**、`base_branch: ''` **337**、`worktree_path: ''` **346**。没有一处消费 `input.params.*` 之外的 package 值。

```js
    package: null,          // task-store.js:335  <-- 需改为 input.params.package ?? null
    branch: '',             // task-store.js:336
    base_branch: '',        // task-store.js:337
```

`CreateTaskParams` 类型（`packages/core/src/legacy/task-store.d.ts:179-186`）同样无 `package`，需补齐。

> 兼容性风险：`createTask`（legacy 直调）也被大量测试直接使用——实测 `grep -c "createTask(" packages/core/test/task-store.test.js` = **83**，`packages/core/test/command-ops.test.js` = **3**（采样行号：`task-store.test.js:68,130,133,137,149,161,171,...`、`command-ops.test.js:195,251,270`）。PRD 需求 2 说的是 **`executeCreateTask` 参数新增必填 `package`**；若把校验下沉到 `createTask` 的 `CreateTaskParams`（使其也必填），上述 86 处调用会全部红。**design 必须显式决定校验层级**：
> - 方案 A（推荐，锚点支持）：校验放在 `executeCreateInternal`（`task-ops.ts:137-160`），`createTask`/`CreateTaskParams` 的 `package` 保持可选，`buildTaskRecord` 落 `params.package ?? null`。这样仅改 `task-ops.test.js` + `worktree-compat.test.js` 的 `executeCreateTask` 调用面，`task-store.test.js` 不受影响。
> - 方案 B：`createTask` 也强制必填 → 需同步改 `task-store.test.js`/`command-ops.test.js` 全部调用点。
> 本报告不替 design 决策，但把影响面量化如上。

## B2 `startTask` 的写入点唯一且靠后，worktree 创建必须插在「门禁通过」与「status 写盘」之间

`startTaskInternal`（`packages/core/src/legacy/task-store.js:614-651`）完整序列：

| 行 | 动作 |
| --- | --- |
| `615` | `requireProjectRoot(root)`（向上找 `.workloom`，`task-store.js:137-143`） |
| `616` | `requireTask` 读 task.json |
| `617-621` | 状态前置：非 `planning` 拒绝 |
| `622-629` | `force===true` 分支：`assertTaskForceReason` + 求值门禁 + 按实际绕过 push `overrides` |
| `630-640` | 非 force：`evaluateStartGate` 有 missing 即抛错（**这就是「门禁通过」的判定点**） |
| `641` | `task.status = TaskStatus.IN_PROGRESS`（**唯一改内存状态处**） |
| `642` | `writeTaskJson(...)`（**唯一落盘处**） |
| `643-646` | 可选 `setActiveTask`（失败 `throw ptrErr`） |
| `647-648` | `runTaskHooks(projectRoot, taskJsonPath, task.hooks.after_start)` |
| `650` | `return task` |

```js
  task.status = TaskStatus.IN_PROGRESS                                  // 641
  writeTaskJson(insideWorkloom(projectRoot, params.taskRelPath), stripTaskPath(task))  // 642
```

**推荐插入点（锚点支持）**：`641` 之前、`622-640` 门禁块之后。理由：

1. PRD 需求 4 要求「任一失败不留部分状态（start 不落 in_progress）」——只要 worktree 创建抛错发生在 `641` 之前，**内存状态与磁盘都未被触碰**，天然零部分状态，无需事务回滚。
2. 回调 `task.branch`/`task.base_branch`/`task.worktree_path` 后再走 `641-642`，可让三字段与 `in_progress` **在同一次 `writeTaskJson` 原子落盘**，避免二次写 task.json 造成「状态已变、worktree 字段还在写」的中间态。
3. `after_start` hooks（`648`）在 `642` 之后执行，若 worktree 创建早于 `642`，hooks 观察到的 `TASK_JSON_PATH` 会已含 worktree 字段（符合直觉，无额外代价）。
4. 门禁通过但 `force=true` 时同样应建 worktree——插入点位于两者的合流之后，`force` 与非 force 共用一条路径，无需分支。

**package 缺失/为 null 的拒绝**（PRD 需求 2 后半）：`requireTask`（`task-store.js:616`）返回的 `task` 已归一化（`normalizeTaskRecord`，`task-store.js:203-234`），但 `package` 不在归一化兜底字段里，存量 task.json 缺字段时读作 `undefined`（`...parsed` 透传），显式 `null` 则读作 `null`。所以判定要写成 `!task.package`（覆盖 `null`/`undefined`/`''`），且必须在 `641` 之前 fail loud。

> 存量影响面：本任务自身的 task.json 就是 `"package": null`（`.workloom/tasks/09-30-s1-core-worktree-lifecycle/task.json:10`）——新逻辑上线后，本任务若走 start 会被自身门禁拒绝（元数据由 `workloom_task_create` 之外的路径写就，属预期；PRD 要求 fail loud + 提示手工编辑）。

## B3 `task-gates.js` 是纯求值模块，**不是** worktree 的插入点；archive 的阻断点在 `renameSync` 之前

`task-gates.js` 全模块无写盘、无 `child_process`、无 git 依赖（import 面 `packages/core/src/legacy/task-gates.js:15-25`：`node:fs` 只读 `readFileSync`、`alignment.js`、`locate.js`、`executor-context.js`）。其导出中与 start 相关的是 `evaluateStartGate`（`packages/core/src/legacy/task-gates.js:265-283`）与 `makeOverride`（`334-341`）。

> 结论：PRD「start 门禁通过后」这一措辞指的是 **`task-store.js` 里的调用点**，不是 `evaluateStartGate` 内部。若把 worktree 创建塞进 `evaluateStartGate`，会破坏「只读求值」契约（`task-gates.js:12` 注释明写「本模块只做求值与记录组装，任务读写仍在 task-store」）且被 `doctor`/`confirm` 等只读消费方意外触发。

force 留痕结构（供 worktree 失败是否留痕的决策参考）：`GATES`（`task-gates.js:39-47`）与 `GATE_TOOLS`（`54-62`）是完备映射；`makeOverride(gate, reason)` 产出 `{gate, tool, at, reason?}`（`task-gates.js:334-341`）。现有 5 个 gate：`start/check/archive/executor_model_effort/stale_alignment`。**新增 worktree 相关失败是否要留痕，PRD 未要求**（worktree 失败是硬阻断而非 force 豁免项，按现有纪律不应 push override）。未验证：是否存在 `overrides[].gate` 的封闭枚举校验（`task-store.d.ts` 的 `GateValue` 为字符串联合，未见运行时白名单）。

`archiveTaskInternal`（`packages/core/src/legacy/task-store.js:1150-1213`）完整序列：

| 行 | 动作 |
| --- | --- |
| `1152` | `requireTask` |
| `1156-1169` | check 凭据门禁（force 留痕 / 非 force 抛错） |
| `1170-1180` | stale alignment 门禁 |
| `1182-1187` | 计算 `archiveRel = tasks/archive/{YYYY-MM}/{task.name}`（`1183`）并**先查冲突**（`1185-1187`） |
| `1189-1190` | `mkdirSync(dirname(archiveDir))` + `renameSync(原目录 → archiveDir)`（**破坏性移动，archive 的不可逆点**） |
| `1191-1193` | `status=completed` / `completedAt` / `writeTaskJson(archiveDir, ...)` |
| `1194-1195` | `clearPointersToTask` |
| `1196-1200` | `after_archive` hooks |
| `1201-1208` | `autoCommitIfEnabled(..., [tasks/<old>, tasks/archive/<new>])` |
| `1211-1212` | `task.taskRelPath = archiveRel`，return |

**推荐插入点（锚点支持）**：worktree 清理必须放在 `1185-1187`（archive 目标冲突检查）之后、`1189`（`mkdirSync`/`renameSync`）之前。

理由：
1. PRD 需求 5「清理失败即阻断 archive（不落归档移动/自动提交）」——`renameSync`（`1190`）是唯一不可逆动作，任何 worktree 失败在其之前抛出即满足「archive 不落档」；`1193` 的 `writeTaskJson` 也就不会把状态改成 completed。
2. `1185-1187` 之后插入可保持现有「先查冲突再动手」的注释纪律（`task-store.js:1181`）不被削弱。
3. `manual` 策略与「无 worktree 任务 no-op」应在此处直接跳过清理（不抛错），让 archive 走原路径。
4. gitlink 提交（PRD 需求 6）**不能**复用 `autoCommitIfEnabled`（`task-store.js:1224-1232`）——它是「失败只 WARNING 不阻塞」（`1230`），而 PRD 要求 gitlink 提交失败 fail loud。gitlink 提交需要独立的、失败即抛的调用点，位置在 merge 成功之后、`1189` 之前（或紧随 worktree 清理）。
5. `autoCommitIfEnabled` 的 `paths` 是相对项目根的字符串数组（`task-store.js:1201-1207`：`join(WORKLOOM_DIR, params.taskRelPath)` 与 `join(WORKLOOM_DIR, archiveRel)`），**与 worktree 路径无关**；gitlink 路径需要用 `<package.path>` 本身（相对根仓）而不是 `.workloom/...`。

> 风险提示：archive 的 worktree 清理发生在 `renameSync` 之前，而 `after_archive` hooks 与 autoCommit 在其后；若 worktree 清理成功后 `renameSync` 失败，会出现「worktree 已删、任务未归档」的中间态。PRD 未要求此处回滚（未验证 design 是否需处理）。建议 design 显式声明「worktree 清理成功 + 归档移动失败」为可接受的中间态（重跑 archive 时 worktree 已不存在 → no-op），否则需要补偿逻辑。

## B4 `config.js` 的 worktree 节扩展点是三处：DEFAULT_CONFIG、GLOBAL_PROJECT_ONLY_FIELDS、mergeWithDefaults

| 扩展点 | 位置 | 现状 |
| --- | --- | --- |
| 默认值 | `packages/core/src/legacy/config.js:29-55`（`DEFAULT_CONFIG`） | `packages: {}` 在 `52`；`worktree` 节不存在。类型面 `packages/core/src/legacy/config.d.ts:2-35` 的 `WorkloomConfig` 也无该字段 |
| 全局层禁止字段 | `packages/core/src/legacy/config.js:81` | `const GLOBAL_PROJECT_ONLY_FIELDS = new Set(['packages', 'hooks'])` —— 加 `'worktree'` 即得 PRD 要求的「项目字段专属错误」 |
| 白名单 | `packages/core/src/legacy/config.js:70-78`（`GLOBAL_ALLOWED_TOP_FIELDS`） | 含 `executor` 等 7 项；**不需要**加 worktree（它应落在 GLOBAL_PROJECT_ONLY_FIELDS，在 `310` 的分支先命中） |
| 合并/校验 | `packages/core/src/legacy/config.js:333-409`（`mergeWithDefaults`） | `hooks` 在 `383-389`、`packages` 在 `390-392`、`executor` 在 `399-407`；`worktree` 需新增一个同形态的 `if (doc.worktree !== undefined) {...}` 块 |
| 布尔口径 | `packages/core/src/legacy/config.js:84-93`（`BOOLEAN_WORDS`）+ `1009-1019`（`requireBoolean`） | `requireBoolean` 已实现「boolean / 'true'|'yes'|'1'|'on' 等字面量 / 数字 1|0」的 BOOLEAN_WORDS 口径——`enabled` 直接复用即可 |
| 字符串校验 | `packages/core/src/legacy/config.js:988-991`（`requireString`） | 只校验类型，**不校验非空**；PRD 要求的「空模板 fail loud」需要额外判定（`branch_template.trim() === ''`） |
| 错误类型 | `packages/core/src/legacy/config.js:98-108`（`WorkloomConfigError`） | `super(\`workloom config: ${field}: ${reason}\`)`，带 `field` 属性；新增校验应抛这个类型（而非裸 `Error`），否则 `doctor` 的 `checkConfig`（`packages/core/src/service/doctor-check-rules.ts:485-500`）虽然仍会捕获（catch-all），但失去字段路径 |

全局层报错口径原文（`packages/core/src/legacy/config.js:308-326`）：

```js
function applyGlobalWhitelist(doc) {
  for (const key of Object.keys(doc)) {
    if (GLOBAL_PROJECT_ONLY_FIELDS.has(key)) {
      throw new WorkloomConfigError(
        'global config',
        `${key} is a project-level field; keep it in the project config, not in $HOME/.workloom`,
      )
    }
    ...
```

> 注意：`GLOBAL_PROJECT_ONLY_FIELDS` 的检查**先于**白名单检查，所以只要把 `worktree` 加进该 Set，就自动获得与 `packages`/`hooks` 逐字同口径的错误文案，无需改 `applyGlobalWhitelist`。

测试影响：`packages/core/test/config.test.js:65` 与 `:580` 用 `assert.deepEqual(config, DEFAULT_CONFIG)`（两边同源，加字段不会红）；但任何「硬编码全量对象」的断言需要核对（本轮 grep 到 `config.test.js` 中 deepEqual 的目标均为子字段或 `DEFAULT_CONFIG` 本身，**未发现全量字面量断言**）。`packages/core/test/doctor.test.js:383-427` 的 config 检查用例依赖 `checkConfig` 的 issue 数量为 0/1，新增 worktree 检查若挂在 `config` code 下需复核这些断言。

## B5 `init.js` 的两个模板常量及其既有断言面（改模板必然红两条测试）

| 常量 | 位置 | 现状 |
| --- | --- | --- |
| `CONFIG_TEMPLATE` | `packages/core/src/legacy/init.js:71` | `const CONFIG_TEMPLATE = '{}'` —— 需改为 `{\n  "packages": {\n    "repo": {\n      "path": "."\n    }\n  }\n}`（PRD 需求 3 的种子根包条目） |
| `GITIGNORE_TEMPLATE` | `packages/core/src/legacy/init.js:183-200` | 数组 join；已有 `.runtime/`、`sessions/`、`.developer`、`config.local.json`、`config.local.js`、`prompts.local/` 六条；**无 `worktree/`** —— 需新增一条 |
| 写入点（幂等：存在即不覆盖） | `config.json` `init.js:252-256`；`.gitignore` `init.js:272-276` | 均以 `existsSync` 守卫，`force` 也不覆盖 |
| 文档注释也需同步 | `init.js:7-9`（描述 config.json 为 `{}` 占位）、`init.js:182`（描述 gitignore 模板） | 注释与实际不符会成为新的不一致（legacy-module 约定要求 JSDoc 与实现同步） |
| `CONFIG_EXAMPLE_JSON_TEMPLATE` | `init.js:74-122` | 已含 `packages: { cli: { path: 'packages/cli' } }`（`93-95`）；**worktree 节如需示例也应同步加在这里**（PRD 未强制） |

既有断言面（改模板后会红的用例）：

- `packages/core/test/init.test.js:111-125`：`assert.equal(config.trim(), '{}', 'config.json 应为空对象占位')` —— **必红**。
- `packages/core/test/init.test.js:97-110`：`initWorkloom` 后 `loadConfig` 的 `assert.deepEqual(config, DEFAULT_CONFIG)` —— 若种子根包写进 config.json，`config.packages` 变为 `{repo:{path:'.'}}` 而 `DEFAULT_CONFIG.packages` 为 `{}` → **必红**。
- `packages/core/test/init.test.js:81-95`：断言 `.gitignore` 含 5 个既有条目（未断言「不含其他」），**加 `worktree/` 不会红**；但按惯例应补一条 `assert.ok(content.includes('worktree/'))`。
- `packages/core/test/init.test.js:222-236`（force 不覆盖已有 config.json，断言原样保留）与 `:282-309`（force 不覆盖/补建 `.gitignore`）—— 与模板内容无关，**不会红**。

> 附带风险：`initWorkloom` 的 `result.created` 只记录实际创建的文件（`init.js:233,255,275`），模板内容变化不影响该列表，故 `packages/core/test/init.test.js:22-26` 的文件清单断言不受影响。

## B6 `git.js` 原语清单与新增原语的落点：`resolveStageablePaths` 可复用于 gitlink，但 cwd 语义需扩展

现有导出（`packages/core/src/legacy/git.js`）：

| 原语 | 行 | 语义 |
| --- | --- | --- |
| `countDirtyLines(status)` | `41-43` | porcelain 行数 |
| `gitAddCommit(root, message, paths)` | `54-67` | 窄暂存 + `commit -m`；`paths` 为空**先报错**（`55-57`） |
| `resolveStageablePaths(root, paths)`（内部，未导出） | `78-90` | 剔除「磁盘不存在且索引未命中」的 pathspec |
| `gitStatusSync(root)` | `100-109` | `status --porcelain`，非 git 目录静默 |
| `gitCurrentBranchSync(root)` | `118-127` | `branch --show-current`，非 git 目录静默 |
| `runGit(root, args)`（内部） | `135-145` | `execFile`，`[err, stdout]` 元组 |

纪律（`packages/core/src/legacy/git.js:11-12`）：每一步失败显式返回 err；`execFile` 无 shell 解释。

新增原语需要的形态（`root` 参数即 cwd，`-C` 等价）：

| PRD 需要的动作 | 建议原语 | 形态要点 |
| --- | --- | --- |
| worktree 增删 | `gitWorktreeAdd(root, path, branch)` / `gitWorktreeRemove(root, path)` | 需保留 stderr 文案。**已验证**：Node `execFile` 回调的 `error.code` 是数字退出码（实测 `git merge --abort` 在非仓库目录 → `code=128`），`error.message` 形如 `Command failed: git merge --abort\n<stderr>`（拼接 stderr，实测），`stderr` 单独可取；而 `git.js:137-142` 只 `resolve([error, null])`，**未透出 `code`/`stderr` 结构化字段** |
| prune | `gitWorktreePrune(root)` | 需 `-v` 才能区分「清了几条」（A3 实测 `prune -n -v` 输出 `Removing worktrees/<name>: ...`） |
| merge | `gitMerge(root, branch)` | 需返回 exit code 以区分冲突（1）/脏拒绝（2）；**现有 `runGit` 丢弃了 `error.code`**（`git.js:138-141` 只 `resolve([error, null])`）——Node 的 `execFile` 错误对象带 `code` 属性（退出码）与 `stderr`，但 `git.js` 未透出任何结构化字段，新增原语需要返回 `[err, stdout, status]` 或让 err 携带 `code`。**这是 `git.js` 第一个需要破坏既有返回约定的地方** |
| 已合并判定 | `gitIsAncestor(root, maybeAncestor, ref)` | `merge-base --is-ancestor`，纯 exit code（0/1），**不能复用「失败即 err」的现有约定**——exit 1 是正常业务结果，需返回 boolean |
| 仓库/分支查询 | `gitRevParse(root, args)` 或域专用（`gitToplevel` / `gitCurrentHead` / `gitListWorktrees`） | 现有 `gitCurrentBranchSync` 只覆盖 `branch --show-current` |
| `MERGE_HEAD` 探测 | 建议独立原语 | A7.2 实测 `git rev-parse -q --verify MERGE_HEAD`（exit 0/1）是唯一可靠判据 |
| 子仓操作 | 上述原语的 `root` 传 submodule 路径即可（`git -C <submodule>` 等价） | A5 实测 submodule 内 worktree 命令全部可用 |
| gitlink 暂存 | **可复用 `gitAddCommit(根仓, message, [package.path])`** | `resolveStageablePaths`（`git.js:78-90`）的剔除逻辑对 gitlink 是安全的：submodule 路径磁盘存在 → 走 `existsSync` 分支保留；但**幂等前置判定仍不可省**——A6 实测「gitlink 无 diff 时 `git commit` exit 1」，`gitAddCommit` 会把该 exit 1 变成 `[err]`（`git.js:64-65`），因此必须在调用前判定无变化并跳过。权威判据是 `git rev-parse HEAD:<package.path>` 与 `git -C <package.path> rev-parse HEAD` 比对（见 `01-git-worktree-submodule-semantics.md` §A6 的探针表；注意 `git rev-parse <path>` 只回显路径字符串，不可用） |

`git.js` 当前 export 面在 `packages/core/src/index.ts:109-114`：

```ts
export {
  countDirtyLines,
  gitAddCommit,
  gitStatusSync,
  gitCurrentBranchSync,
} from './legacy/git.js'
```

> 新增原语需在此处同步导出（PRD 验收要求「core 公开导出」作为接缝）。另：`task-store.js:33` 目前只 import `gitAddCommit`。

## B7 doctor 的规则形状：新增检查要么复用 `config` code（零类型改动），要么新增第 12 个 code（改 4 处 + 1 条测试）

现有检查注册结构：

| 层 | 位置 | 作用 |
| --- | --- | --- |
| code 联合类型 | `packages/core/src/service/doctor-types.ts:13-24`（`DoctorIssueCode`，11 个字面量） | 新增 code 需在此加字面量 |
| 检查元信息 | `doctor-types.ts:100-117`（`CHECK_META`，11 项，`{code,title,severity}`，顺序即输出顺序） | 新增检查需加一项 |
| 规则实现 | `packages/core/src/service/doctor-check-rules.ts`（`checkTaskLifecycle:37` … `checkWorkflowOverlay:542`） | 新增规则函数 |
| 收集注册 | `doctor-checks.ts:73-85`（`pushIssues(issueMap, code, fn(...))` 逐行注册） | 新增一行 |
| issue 构造 | `doctor-tasks.ts:101-112`（`makeIssue`），字段 `{code,title,severity,task,message,path,fixable,hint}`（`doctor-types.ts:30-41`） | `fixable:false` + `hint` 是「人工处理指引」的呈现方式 |
| 修复器 | `doctor-fixes.ts:41-45`（`applyFixes` 只调 3 个 fixer） | PRD 要求 worktree 检查**不自动破坏性修复** → 不做 fixer，`fixable:false` |

两个可选方案（design 需裁决）：

- **方案 1（复用 `config` code）**：把三条新检查（packages 空配置、`.workloom/.gitignore` 缺 `worktree/`、worktree 目录与 git 注册不一致）都挂到 `checkConfig`（`doctor-check-rules.ts:465-503`）返回的数组里。优点：**零类型/元信息改动**，`doctor.test.js:579` 的 `checks.length === 11` 不红。缺点：三类语义混杂在一个 code 下，`severity` 只能在 issue 级别区分（`config` 的 check severity 为 `warn`，`doctor-types.ts:114`），且「worktree 目录不一致」偏结构而非配置。
- **方案 2（新增第 12 个 code，如 `worktree`）**：需改 `doctor-types.ts:13-24`、`doctor-types.ts:100-117`、`doctor-checks.ts:69-90`（注册行）、新增规则函数；并**必须改** `packages/core/test/doctor.test.js:579`（`assert.equal(report.checks.length, 11, 'all 11 checks always present')`）→ `12`。`doctor.test.js:2` 的注释「11 类检查」也需同步。

现状 `checkConfig` 的形态（`doctor-check-rules.ts:465-503`）是「先判文件存在、再 `loadConfig` 捕获异常」，分两个 `makeIssue`：

```ts
export function checkConfig(root: string): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  const workloomDir = join(root, WORKLOOM_DIR)
  const hasConfig = ['config.json', 'config.js'].some((name) =>
    existsSync(join(workloomDir, name)),
  )
  ...
      issues.push(
        makeIssue({
          code: 'config',
          title: 'Invalid config file',
          severity: 'error',
          task: null,
          message: `config is invalid: ${messageOf(error)}`,
          path: join(WORKLOOM_DIR, 'config.json'),
          fixable: false,
          hint: 'Fix the config error in .workloom/config.json or config.js.',
        }),
      )
```

「prune 指引」的呈现：现有同类形态是 `hint` 承载人工操作指引（`doctor-check-rules.ts:481-482`、`497-498`、`563-564` 均有 `hint`），且「不自动破坏性修复」的先例是 `fixable: false`（`doctor-check-rules.ts:496`、`562`）。PRD 需求 7「worktree 目录与 git 注册不一致 → prune 指引（不自动破坏性修复）」应完全照此形态。

## B8 受影响的调用面/测试清单（改动落地时必须同步的文件）

| 文件 | 影响点 | 依据 |
| --- | --- | --- |
| `packages/core/src/service/task-ops.ts:95-102,137-160` | `ExecuteCreateTaskParams` 加 `package`；透传 | §B1 |
| `packages/core/src/legacy/task-store.js:324-366,528-582,614-651,1150-1213` | 落 package / start 建 worktree / archive 清理 | §B1-B3 |
| `packages/core/src/legacy/task-store.d.ts:137-148,179-186,195-202,222-229` | 类型面（`CreateTaskParams.package`，必要时新增 `StartTaskResult`/`ArchiveTaskParams` 扩展） | §B1 |
| `packages/core/src/legacy/config.js:29-55,70-93,333-409` + `config.d.ts:2-35` | worktree 节 | §B4 |
| `packages/core/src/legacy/init.js:71,183-200`（+ 注释 `7-9,182`） | 模板 | §B5 |
| `packages/core/src/legacy/git.js`（新增原语）+ `packages/core/src/index.ts:109-114` | 原语与导出 | §B6 |
| `packages/core/src/service/doctor-*.ts`（+ 可能的 `doctor-types.ts`） | 三条检查 | §B7 |
| `packages/core/test/worktree-compat.test.js:148,174,226,255` | **4 处 `executeCreateTask` 未传 package，必红** | 实测 grep |
| `packages/core/test/task-ops.test.js:69,118,160,205,222,232` | 6 处 `executeCreateTask` 未传 package，必红 | 实测 grep |
| `packages/core/test/init.test.js:111-125`（+ `97-110`） | 模板断言必红 | §B5 |
| `packages/core/test/doctor.test.js:579`（方案 2 才红） | `checks.length === 11` | §B7 |
| `packages/adapter-dsh/src/tasks.ts:51-58` | create schema `required: ['title']` + `properties` 无 `package` | 实测 |
| `packages/adapter-pi/src/tasks.ts:35-41,187-193` | `TASK_CREATE_PARAMS` 无 `package`；`executeCreateTask` 透传处无 `package` | 实测 |
| `packages/core/src/surface.ts:82-140`（`PARAM_DESCRIPTIONS`，起于 `:82`）+ `:63-80`（`TOOL_SNIPPETS`，起于 `:63`） | create 的参数描述与 snippet（`taskCreate: '...task_create(title, slug?, priority?, description?, parent?)...'`）未含 package | 实测 `grep -n` |

> 范围提示：S1 的 PRD 描述限定「core 侧」。但 `packages/adapter-dsh/src/tasks.ts:58` 的 `required: ['title']` 与 `packages/adapter-pi/src/tasks.ts:35-41` 是**模型可见的 schema**——若不在 schema 层把 `package` 设为必填，模型不会传，`executeCreateTask` 的 fail loud 会在真实使用中每次都触发。**这是 S1/S2 的范围灰区，需 design 显式裁定**（PRD 需求 2「create schema 必填」的措辞倾向要求 adapter 同步改）。

## B9 与 PRD 假设冲突/需补设计的事实清单

1. **`createTask` 的校验层级未定**（§B1）：PRD 只写「`executeCreateTask` 参数新增必填 `package`」。若顺手把 `CreateTaskParams.package` 也设必填，会连带打红 `task-store.test.js`/`command-ops.test.js` 约 40 处 legacy 直调用例。design 必须选层。
2. **`git.js` 的 err 元组不透出 exit code**（§B6）：PRD 需求 5 需要区分 merge 冲突（应 abort）与脏拒绝（不应 abort）。现有 `runGit`（`git.js:135-145`）只返回 `Error`，无法判别。design 必须定义新增原语的返回约定（例如 `[err, stdout, code]` 或让 err 携带 `code`），并保持既有 4 个原语的返回形状不变（它们是兼容面）。
3. **`merge-base --is-ancestor` 与现有「失败即 err」约定冲突**（§B6）：exit 1 是正常结果（未合并），不能当错误。需要专用布尔原语。
4. **gitlink 提交不能复用 `autoCommitIfEnabled`**（§B3）：后者设计为「失败只 WARNING 不阻塞」（`task-store.js:1230`），PRD 要求 gitlink 提交失败 **fail loud**。且其 `paths` 是 `.workloom/...` 命名空间，gitlink 路径是 package 的仓内相对路径。
5. **doctor 新增检查的 code 归属是设计决策**（§B7）：复用 `config` code 零改动但语义混杂；新增第 12 个 code 必须同步 `doctor-types.ts` 两处 + `doctor-checks.ts` 注册 + `doctor.test.js:579` 的 `11 → 12`。
6. **`.workloom/.gitignore` 的 `worktree/` 生效前提是文件已入库**（§A5 实测）：模板加条目只对**新 init 的项目**有效；存量项目未迁移时 `.workloom/worktree/` 会被 git 视为未跟踪，从而让主仓 `git status` 变脏——这可能影响 `autoCommitIfEnabled` 之外的其他脏文件消费方（`gitStatusSync` 在 `packages/core/src/legacy/git.js:100` 被 `session-context` 的 breadcrumb 消费）。PRD 已声明「存量项目不自动迁移、由 doctor 提示」，但**未声明「不迁移期间主仓脏计数上升」这一副作用**。
7. **本任务自身 `package: null`**（`.workloom/tasks/09-30-s1-core-worktree-lifecycle/task.json:10`）：新逻辑上线后本任务无法再 start（预期行为，但会影响后续自举流程）。
8. **start 的 worktree 创建时机早于 `after_start` hooks**（§B2）：若某项目用 `after_start` hook 做 worktree 相关动作，语义会变化。本项目实测无此风险：`.workloom/config.json` 只有 `packages` 节、**没有 `hooks` 键**（`cat .workloom/config.json`），任务级 `hooks` 四键均为空数组（`.workloom/tasks/09-30-s1-core-worktree-lifecycle/task.json:45-50`），故 `after_start` 恒为空。附带事实：本项目 `.workloom/config.json` 已含种子根包 `"repo": { "path": "." }`（连同 core/assets/adapter-dsh/adapter-pi 共 5 个 package）——PRD 需求 3 的 init 模板种子与本仓现状一致。

## B10 开放问题（无法在本任务内闭环，交主会话批处理）

1. **S1 是否包含两个 adapter 的 create schema 改动**（§B8/§B9-1 的范围灰区）？PRD 需求 2 说「create schema 必填」，但 S1 描述限定 core 侧、把 runtime 集成面划给 S2。二选一需要用户裁决；选「不改 adapter」会导致新逻辑在真实使用中每次都 fail loud。
2. **worktree 生命周期代码的模块归属**：新建 `packages/core/src/legacy/worktree.js`（纯 JS + JSDoc，复用 git.js）还是内联进 `task-store.js`？本报告倾向新模块（`task-store.js` 已 1301 行，且 archive/start 两处逻辑共享 package→仓解析与分支渲染），但 `packages/core/src/legacy/` 是否允许新增模块需按 `.workloom/spec/repo/architecture` 裁定——**未验证**（本轮未读该 spec）。
3. **archive 清理成功但 `renameSync` 失败时的中间态是否需要补偿**（§B3 风险提示）：PRD 未表态。
4. **`<date>` 占位符的「创建日」语义**：PRD 写「创建日 YYYYMMDD」，但 start 时才渲染分支名。若任务创建于 09-30、start 于 10-01，用哪个日期？按字面「创建日」应取 `task.createdAt`（现成字段，`task-store.d.ts:140`），而 start 时的 `new Date()` 是另一回事——**PRD 未澄清，设计必须裁决**。
5. **分支模板渲染的作用域**：模板可能渲染出含 `/` 的分支名（缺省 `workloom/<task-id>`）；是否需要校验渲染结果对 git 合法（如禁止 `..`、尾随 `.lock`、空白）？PRD 只要求校验占位符，未要求校验结果字符集——**未验证**。
