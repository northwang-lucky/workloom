# 实现计划：fallback_models 同类并发轮换

设计依据 `design.md`（同目录），需求与验收以 `prd.md` 为准。按步骤顺序实现，每步完成即跑对应测试；全部完成后跑整体验证。禁止 git commit（提交由主会话在 2.3 统一处理）；禁止手改 `dist/`（由 `pnpm -r build` 重建）。

## 步骤 1：core 配置层（design §7）

- `packages/core/src/domain/config.js`：`parseSubagentSpec` 允许字段加 `rotate_on_busy`（boolean 校验、非法值按字段路径 fail loud、仅 true 落 `rotateOnBusy`）；`resolveSubagentDefaults` 增加 profile 优先/legacy 回退的字段级合并与 `configSources.rotateOnBusy`。
- `packages/core/src/domain/config.d.ts`：内存形态与合并结果类型补 `rotateOnBusy?: boolean`。
- `packages/core/test/config.test.js`：两层合法解析、非布尔 fail loud、分层合并、未配置不落字段。

## 步骤 2：core 轮换纯函数（design §4）

- 新建 `packages/core/src/domain/executor-rotation.js` + `executor-rotation.d.ts` 锚点：`selectRotationStartIndex`、`materializeRingChain`（纯 JS + JSDoc，无 IO）。
- `packages/core/src/domain/dispatch-binding.js`：`PARENT_MODEL_LABEL` 常量上移至此并导出（单一来源）。
- `packages/core/src/index.ts`：导出新模块公开面。
- 新建 `packages/core/test/executor-rotation.test.js`：design §10 所列用例。

## 步骤 3：core 值域与文案（design §8）

- `packages/core/src/domain/task-store.js`：`DISPATCH_MODEL_SOURCES` 加 `ROTATE: 'rotate'`；`task-store.d.ts` 的 `DispatchModelSource` 联合加 `'rotate'`。
- `packages/core/src/surface.ts`：executor description 追加轮换语义一句（英文）。
- core 相关测试补 `modelSource: 'rotate'` 放行用例。

## 步骤 4：adapter 取数与 in-flight（design §5）

- `packages/adapter-dsh/src/executor-capacity.ts`：进程内 `childId → {kind, model}` 绑定登记（导出注册/消费/清空函数）；`collectRunningExecutors` 三级优先补 `model`（进程内登记 → 本任务 dispatches → 缺失）；`InFlightEntry` 与 `registerInFlightDispatch` 增加 model 参数并透出。
- `packages/adapter-dsh/src/executor-failover-chain.ts`：`PARENT_MODEL_LABEL` 改为从 core 导入并 re-export；`buildFallbackAgentOptions` 对该 label 特判（不携带 provider/model，仅 effort）。

## 步骤 5：adapter 派发编排（design §6）

- `packages/adapter-dsh/src/executor.ts`：`runCapacityGate` 一次取数两用（返回 `{ text, running }`）；容量放行后的同步段做轮换选取（`selectRotationStartIndex` + `materializeRingChain`），替换 `agentOptions`、物化 `failoverChain`、产出 rotation 标注；in-flight 登记带实际选定 model；`dispatches` 留痕 `modelSource: 'rotate'`；`registerFailoverContext` 按物化链与起点填写；绑定登记写入进程内 registry。
- `packages/adapter-dsh/src/executor-failover.ts`：`startDispatchWithFailover` 与 `runAsyncFailover` 的成功/重派路径同步维护进程内绑定登记（childId 换新时更新）。
- `packages/adapter-dsh/src/executor-receipt.ts` / `executor-continuation.ts`：`TurnMeta.rotation` 与回执 `(rotated: <model>)` 渲染。

## 步骤 6：adapter 测试（design §9 边界表逐行覆盖）

- `packages/adapter-dsh/test/executor.test.js` 新增用例组：开关关零变化、开关开无同类、轮换选取（回执 + 留痕 + agentOptions）、多同类顺延、全占用回绕、in-flight 并行不撞、环形转移（同步白名单路径）与穷尽文案顺序、结算后异步重派沿物化链、显式 model 不轮换、续用轮不受影响、绑定读不到按主模型位、继承主模型位绕回特判。

## 步骤 7：整体验证与产物重建

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build        # dist 重建，与源码一并留给 2.3 提交
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
```

- LSP 优先：改动文件过一遍 `lsp_diagnostics`；重命名走 `lsp_rename`。
- 自查对照 `prd.md` 验收 10 条逐条勾验，回报时附验证命令输出摘要。
