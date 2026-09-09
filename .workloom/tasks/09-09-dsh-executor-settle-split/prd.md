# DSH executor settle 循环回填对齐与 executor.ts 拆分

## Goal

清偿 pi-executor-parity 容器遗留的两项 DSH 侧挂账（用户 2026-09-09 决策：2B 开任务修、3 并入同任务）：1) DSH settle 对同 childId 多条 running 的循环回填对齐 Pi 侧语义，消除 steering/催办合并轮次的永久 running 残留；2) `adapter-dsh/src/executor.ts`（787 行）拆分至 600 行线内。全程 DSH 行为零变化。

## Requirements

- R1 settle 循环回填：adapter-dsh `executor-settle.ts` 回填终态时循环调用 core `settleExecutorDispatch` 直到该 childId 无 running 条目（语义对齐 Pi 侧缺陷 6 修复 f5080a6：一次 end 事件 = 该 child 全部注入轮次工作完成）；防御同 Pi 口径——循环上限 16 + 每轮 error 即 WARNING 停止。实证场景：容器 task.json 08:30 轮（催办 steer 合并两轮、单次 end 只 settle 最近一条，前轮永久 running）。core 不动（last-match 语义保留，循环归 adapter 层，两端对称）。
- R2 executor.ts 拆分：仿 adapter-pi 既有模块边界（dispatch/settle/continuation/guard 已分立）把 787 行 executor.ts 的编排层再切内聚块（如 schema/参数装配、冲突门编排、receipt 组装），纯代码搬移、行为零变化、导出面与工具注册语义不变。
- R3 单测：循环 settle 回归用例（同 childId 两条 running 一次 end 全部回填 completed / failed 路径同理）；拆分后既有 dsh 测试全绿（import 路径随拆分调整属允许改动）。
- R4 回归与部署：三端 test/typecheck/lint/build 全绿；adapter-dsh dist 重建 + rsync 同步（dshweb 重启归用户）。

## Acceptance Criteria

- adapter-dsh 全部源文件 <600 行（executor.ts 拆分后各模块行数留档报告）。
- 循环 settle 新回归用例通过；dsh 135+/core 545/pi 158 测试全绿，typecheck/lint/LSP 干净。
- DSH 行为零变化：工具面文案、派发/续用/settle 语义与拆分前一致（既有测试为基线，diff 审查确认纯搬移）。
- dist 时间戳晚于源码、rsync 同步执行（重启留用户）。

## Alignment Decisions

- 范围与合并：用户在容器会话确认（2026-09-09，"2 B；3 并入 2"）——settle 循环对齐与 executor.ts 拆分合并为单任务两项交付。
- 修复方式沿 Pi 先例：循环放 adapter 层、core `settleExecutorDispatch` last-match 语义不动（避免影响 Pi 侧已验证行为；两端 adapter 各自循环，对称且改动面最小）。
- 拆分标准：仿 adapter-pi 模块边界，纯搬移零行为变化；具体切分方案授权 implement 按内聚性自决（报告说明边界依据）。
- UI 不适用；test-first 不强制（R3 回归用例随交付）。
- 无开放节点。

<!-- workloom:open-nodes=none -->

## Notes

- 关联：归档容器 `tasks/archive/2026-09/pi-executor-parity`（check summary 中两项挂账的清偿任务）；Pi 侧对应修复 f5080a6（循环 settle）与 M1 拆分先例（executor.ts → executor-dispatch.ts）。
- 历史残留说明：容器 task.json 中 08:30 轮的 running 条目为修复前历史数据，保留不改（审计真实性），本任务只防未来发生。
- 提交纪律：settle 修复与文件拆分分两个 commit（逻辑独立）；message 按 repo/commits。
