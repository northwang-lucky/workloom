# dispatch-audit：core 侧派发审计与门禁扩展点

> 只读调研。目标：为新增 `frontend` executor 派发审计（`task.json.dispatches` 数组）与
> check 门禁核验定位 core 侧接入点。函数名 + `文件:行号` + 一句话说明。不做修改。

## 1. recordExecutorOverride（派发审计记录函数的现成先例）

- 定义：`packages/core/src/legacy/task-store.js:564` — `export function recordExecutorOverride(root, taskRelPath, reason)`，返回 `[Error | null]` 命名元组。
- 内部实现：`task-store.js:579` `recordExecutorOverrideInternal` — `requireTask`（`task-store.js:242`，readTask + normalizeTaskRecord）→ `task.overrides.push(makeOverride(GATES.EXECUTOR_MODEL_EFFORT, reason))` → `writeTaskJson`（`task-store.js:254`，`JSON.stringify(record, null, 2) + '\n'`）。
- 类型：`task-store.d.ts:165`；导出：`core/src/index.ts:57`。
- 谁调用（双 adapter 派发成功后/force 放行后）：
  - DSH：`adapter-dsh/src/executor.ts:272` — `forced` 分支调用 `recordExecutorOverride(root, taskRelPath, params.reason)`（仅覆盖冲突 force 放行时）。
  - Pi：`adapter-pi/src/executor.ts:164` — 经 `recordForcedOverride`（`executor.ts:159`）包装调用。
- 如何写 task.json：读写链路为 `requireTask`(= `readTask` `task-store.js:206` → `normalizeTaskRecord` `task-store.js:176`) → 内存对象改 `overrides` 数组 → `writeTaskJson` `task-store.js:254`。`normalizeTaskRecord` 在 `task-store.js:195` 把缺失的 `overrides` 补齐为 `[]`（旧数据安全）。新增 `dispatches` 数组需在同一处补齐缺省空数组，且 `TaskRecord` 类型（`task-store.d.ts:44`）需增 `dispatches` 字段。
- 写失败策略：仅 WARNING 不阻塞。`recordExecutorOverride` 内部 try/catch 返回 `[err]`；调用方 `console.warn`（DSH `OVERRIDE_WARN_PREFIX` `executor.ts:74`、Pi `RECORD_WARN_PREFIX` `executor.ts:79`）。新派发审计记录函数应复刻同一「元组 + WARNING」口径。
- 注意：现有 `recordExecutorOverride` 语义是「覆盖冲突」审计（gate=`executor_model_effort`），task.json 落点在 `overrides`。本任务新增的是「每次派发成功」审计，落点是新增 `dispatches` 数组，宜新增独立 core 公共函数（如 `recordDispatch`），而非复用 overrides，避免污染 gate 语义。

## 2. workloom_task_check 编排链（新增 check 缺失项的消费点）

链：adapter 工具入口 → core `executeCheckTask` → legacy `checkTask` → `evaluateCheckLogGate`。

- DSH 工具入口：`adapter-dsh/src/tasks.ts:234` — `workloom_task_check` 的 execute 调 `executeCheckTask(cwd, contextKeyOf(exec), params)`。
- Pi 工具入口：`adapter-pi/src/tasks.ts:197` — 同签名调 `executeCheckTask`。
- core 编排：`service/task-ops.ts:202` `executeCheckTask` → `executeCheckInternal`（`task-ops.ts:221`）：`requireWorkloomCwd` → `resolveTaskRelPath`（`task-ops.ts:227`）→ `checkTask(cwd, { taskRelPath, summary, ...forceOverride(params) })`（`task-ops.ts:228`）。`forceOverride`（`task-ops.ts:240`）空串 reason 不传。
- legacy 门禁：`legacy/task-store.js:511` `checkTask` → `checkTaskInternal`（`task-store.js:527`）：
  - 状态须 `IN_PROGRESS`（`:530`）、summary 非空（`:535`）。
  - force 分支：`task.overrides.push(makeOverride(GATES.CHECK, params.reason))`（`:540`）后放行。
  - 非 force：`evaluateCheckLogGate(projectRoot, params.taskRelPath)`（`:542`）；`missing.length > 0` 抛错 `check gate failed: ...`（`:544`）。
  - 通过后写 `task.check = { passedAt, summary }`（`:550`）+ `writeTaskJson`（`:551`）。
- `evaluateCheckLogGate` 定义：`legacy/task-gates.js:158` — 调 `evaluateJsonlGate(taskDir, GATE_FILES.checkLog)`（`:170`），返回 `[]` 或 `[item]`，item 文案 `check.jsonl has no effective records`。
- force 豁免留痕：`task-gates.js:182` `makeOverride(gate, reason)` — 组装 `{ gate, tool: GATE_TOOLS[gate], at: ISO, ...(reason非空? {reason}) }`。check 门禁 force 用例断言见 `core/test/task-ops.test.js:743`（saved.overrides[0].gate==='check'）。

**新增 check 缺失项的接入位置与分层约束（设计要点，非改动）：**

- `task-gates.js:12` 明示「本模块只做求值与记录组装，任务读写仍在 task-store」——`evaluateCheckLogGate` 不读 task.json。要核验「prd 含 `## UI Design` 且 task.json 无 `frontend` 派发」，前端信号（prd.md）在 task-gates 有 `GATE_FILES.prd`（`task-gates.js:23`）可读；`dispatches` 数组在 task.json，属 task-store 数据域。
- 因此新增缺失项的求值宜拆成两层：a) 纯函数放 `task-gates.js`，入参为「prd 内容 + 派发记录数组」，返回缺失项（保持「无 IO」分层，可单测）；b) 在 `checkTaskInternal`（`task-store.js:527`）拿到内存 `task`（`requireTask`）后，从 task 目录读 prd.md（或复用 path）把两输入喂给 a），并把返回的缺失项并入 `missing` 数组，统一走 `:544` 的抛错路径。force 豁免路径（`:540`）天然覆盖新增缺失项（force 放行即写 overrides 留痕）。
- 影响函数：`task-gates.js`（新增纯求值函数 + 若需 const）、`task-store.js` `checkTaskInternal`（调新增求值）、`task-gates.d.ts`（类型）、`task-store.d.ts`（TaskRecord 增 `dispatches: DispatchRecord[]`）。
- 相关测试文件：`core/test/task-gates.test.js`（新增缺失项求值）、`core/test/task-store.test.js`（:616 start 门禁 force、:743 check 门禁 force 先例）、`core/test/task-ops.test.js`（:138 `executeCheckTask` 无记录拒绝 / force 放行、:152 overrides 断言）。

## 3. task-gates.js 的 GATES / GATE_TOOLS 枚举（新增 gate 项不动这两者的确认）

- `GATES`：`task-gates.js:33` — `{ START:'start', CHECK:'check', ARCHIVE:'archive', EXECUTOR_MODEL_EFFORT:'executor_model_effort' }`。
- `GATE_TOOLS`：`task-gates.js:46` — `{ start:'workloom_task_start', check:'workloom_task_check', archive:'workloom_task_archive', executor_model_effort:'workloom_execute' }`。
- 类型：`task-gates.d.ts:6`（GateKey）、`:9`（GateValue）、`:12`（GATES）、`:15`（GATE_TOOLS）；`GateOverride` 在 `task-store.d.ts:36`（`{gate, tool, at, reason?}`）。
- 派发审计是「每次派发成功」的独立记录，不属于 overrides 的 gate 枚举体系——它落点是 `dispatches` 数组，不新增 `GATES`/`GATE_TOOLS` 项（gates 枚举只管 force 豁免留痕）。check 门禁的「前端必须经 frontend 派发」是新增缺失项进 `evaluateCheckLogGate` 的返回列表，也不新增 gate 值。
- 若实现上想把派发审计也归入 gate 语义（不推荐，会破坏 `Record<GateKey, GateValue>` 完备性），才需要动 `GATES`/`GATE_TOOLS`/`GateKey`/`GateValue` 三处类型；默认方案下这三者保持不动。

## 4. 小结（对照 prd 验收项）

- 派发审计记录函数：仿 `recordExecutorOverride`（`task-store.js:564`），新增独立函数写 `dispatches`，双 adapter 派发成功点调用；写失败 WARNING 不阻塞（口径同 `OVERRIDE_WARN_PREFIX`/`RECORD_WARN_PREFIX`）。
- check 门禁核验：在 `checkTaskInternal`（`task-store.js:527`）把「prd 含 UI Design && 无 frontend 派发」并入 `missing`，force 豁免留痕走既有 `makeOverride` + overrides 路径。
- 门禁相关测试落点：`task-gates.test.js` / `task-store.test.js` / `task-ops.test.js`。
