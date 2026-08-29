# 实施计划：executor gate 堵住 fork 子代理绕行（test-first）

## 总原则

1. 先写测试（红）→ 实现（绿）→ 全量回归；禁止先实现补测试。
2. 一个阶段 = 一个 implement subagent；不 commit（2.3 主会话控制），验证命令：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、adapter-dsh `node --test test/*.test.js`（先 build）。

## Phase 0：gate 判定链（test-first）

1. 先写测试（红）：gate.test.js 追加 6 个用例（depth=1 非豁免 in_progress 外写 → deny；无 in_progress → allow；豁免 → allow；gate off → allow；`.workloom/` 内 → allow；depth=0 既有路径不回归）。
2. 再实现：gate.ts 豁免注册表 + 判定链改造（design.md §2）。
3. 回归：既有 gate 用例全绿 + 新增绿。

## Phase 1：executor 豁免注册（test-first）

1. 先写测试（红）：executor.test.js 断言派发期间注册（start 成功后、run 结算前可用 `registerWriteGateExemption`/`unregister` 组合模拟时序）与 finally 注销。
2. 再实现：executor.ts 注册/注销接入（design.md §3）。
3. 回归：executor 集成测试全绿。

## Phase 2：全量回归

`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、adapter-dsh `node --test test/*.test.js` 全绿；产出验证记录。
