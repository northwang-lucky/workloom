# implement：新增前端实现 executor（frontend agent）

按步骤顺序执行；每步判据通过后进入下一步。文件路径相对仓库根。

## Step 1 core kind 管道

- `packages/core/src/legacy/executor-context.js`：`EXECUTOR_KINDS` 加 `frontend`；`JSONL_FILES` 加 `[EXECUTOR_KINDS.frontend]: 'implement.jsonl'`（`buildInternal` 的 else 分支自动覆盖，无需改分支）。
- 同步 `.d.ts` 类型（EXECUTOR_KINDS Record 键）。
- `packages/core/src/surface.ts`：TOOL_DESCRIPTIONS executor 行与 `kind` 参数说明改为含 frontend（四角色）。
- 判据：`assertKind('frontend')` 通过；surface 描述含 frontend。

## Step 2 派发记录（dispatches）

- `packages/core/src/legacy/task-store.js` + `.d.ts`：
  - `TaskRecord` 加 `dispatches: DispatchRecord[]`（`{ kind, at, title }`）；`DispatchRecord` 类型进 `.d.ts`；
  - `normalizeTaskRecord` 补 `dispatches: []` 默认（与 overrides 同位置样式）；
  - 新增 `recordExecutorDispatch(root, taskRelPath, entry)`：复用 requireTask/writeTaskJson 链路，返回 `[Error | null]` 元组（与 recordExecutorOverride 签名风格一致，放同文件同层）。
- `packages/core/src/index.ts` 导出新函数与类型。
- 判据：`node --test` 新用例绿；存量 task.json 读取后 dispatches 默认 `[]`。

## Step 3 check 门禁

- `packages/core/src/legacy/task-gates.js` + `.d.ts`：新增 `evaluateFrontendDispatchGate(root, taskRelPath): string[]`——prd.md 正文 `splitSectionBodies` 含 `UI Design` 且 task.json `dispatches` 无 `kind === 'frontend'` 条目时返回缺失项（英文文案与既有风格一致），否则 `[]`；纯求值不读写。
- `packages/core/src/legacy/task-store.js` `checkTaskInternal`：evaluateCheckLogGate 缺失项之后合并 evaluateFrontendDispatchGate 结果；force 豁免走既有 makeOverride（GATES/GATE_TOOLS 不动）。
- 判据：三态用例绿（有 UI 小节无派发 → 缺失；有派发 → 通过；无 UI 小节 → 通过）；force + reason 留痕 overrides。

## Step 4 双 adapter 接入

- `packages/adapter-dsh/src/executor.ts`：`KIND_LABELS` 加 `frontend: 'Frontend'`；派发成功点（stopReason === 'completed' 分支内、返回结果前）调用 `recordExecutorDispatch`（失败 WARNING 不阻塞，复用既有 warn 前缀风格）。
- `packages/adapter-pi/src/agent-definitions.ts`：`EXECUTOR_AGENT_DEFINITIONS` 加 frontend（description + systemPrompt 按 design 3.3 四要素，英文）。
- `packages/adapter-pi/src/executor.ts`：`dispatchChildPi` 正常返回后调用 `recordExecutorDispatch`（失败 WARNING 不阻塞）。
- 判据：dsh 两处 kind cases（executor.test.js ~:406/:465）与断言更新；pi 派发成功路径有审计断言。

## Step 5 契约与文档

- `packages/assets/workflow/workflow.md`：`version` 9→10；2.1 补 frontend 强制派发措辞（design 3.4，英文）。
- `.workloom/spec/repo/terminology/index.md`：补 frontend executor 词条（与契约 2.1 口径一致）。
- grep 全库清理「三个 kind / research/implement/check」式过期描述（含 README/注释/测试名）。
- 判据：contract-asset.test.js version=10 断言（含测试名）更新并绿；无过期 kind 枚举描述残留。

## Step 6 测试与验证

- 同步更新：`packages/core/test/executor-context.test.js`（EXECUTOR_KINDS deepEqual）、`contract-asset.test.js`（version + 2.1 措辞断言）、`adapter-pi/test/agents.test.ts`（四 kind）、`adapter-pi/test/pi-args.test.ts`、`adapter-dsh/test/executor.test.js`（两处 cases + 审计调用断言）。
- 验证（verify.md 顺序）：`pnpm -r build` → `pnpm lint` → `pnpm -r typecheck` → core `node --test` → dsh `node --test` → pi `bun test` 全绿。
- 判据：全部验证通过；构建产物（dist/、adapter-pi/skills/）重建但未提交。

## Step 7 提交拆分（主会话 2.3 执行，implement 不提交）

1. `feat(core): executor 新增 frontend kind 与派发审计、check 门禁`（executor-context、surface、task-store、task-gates、index 导出、core 测试）
2. `feat(adapter): 双 adapter 接入 frontend executor 与派发记录`（dsh executor.ts、pi agent-definitions.ts、pi executor.ts、两包测试）
3. `feat(workflow): 契约 2.1 强制 frontend 派发（version 10）`（workflow.md + contract-asset.test.js）
4. `docs(spec): 术语表补 frontend executor 词条`（.workloom/spec/repo/terminology/index.md）
5. `chore(task): 沉淀前端 executor 任务记录`（任务目录）
