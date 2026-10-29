# 前端派发门禁识别 UI Design 不适用声明

## Goal

`evaluateFrontendDispatchGate`（core `domain/task-gates.js`）目前只按「prd.md 存在 `## UI Design` 小节」判定前端需求：小节内容明确声明不适用时仍要求 frontend 派发记录，check 门禁误拦（上一任务被迫 force 绕过并留痕）。改为识别小节正文的显式不适用声明——声明成立视同无 UI 需求直接放行；实质内容维持机制强制不变。

## Requirements

1. 判定规则：取 `## UI Design` 小节正文的首个非空行，去除首尾空白并按英文小写归一后，以下列常量词表之一为前缀即认定为不适用声明：`不适用`、`n/a`、`not applicable`、`none`（词表定义为具名冻结常量，禁止散落字面量）。
2. 声明成立：门禁返回空数组（无缺失项），不要求 dispatches 存在 frontend 条目。
3. 零行为变化路径：小节不存在、prdContent 为 null、小节正文为实质内容（首行不匹配词表）时，行为与现状完全一致；实质内容仍要求 frontend 派发。
4. 词表只匹配首行：声明词出现在正文中部不触发认定（防止实质内容中间夹带词组造成误放行）。
5. 纯函数边界不变：仍无 IO、只求值不读写，所有调用方（check 门禁链路）经同一入口受益；不新增配置项。

## Acceptance Criteria

1. 小节正文首行为「不适用：…」「N/A」「not applicable — …」「None」等词表前缀（含大小写变体）：无 frontend 派发也放行。
2. 小节正文为实质 UI 内容且无 frontend 派发：仍返回缺失项拦截（现状不变）。
3. 实质内容正文中部出现词表词：不认定声明，仍拦截。
4. 无 UI Design 小节 / prdContent null：放行（现状不变）。
5. 既有 task-gates 相关测试全部通过；新增用例覆盖上述 1–4。
6. 验证全绿：pnpm lint、pnpm -r typecheck、pnpm -r build、core 与 adapter-dsh 的 node --test；dist 与源码同 commit 重建。

## Notes

- 触点：`packages/core/src/domain/task-gates.js`（门禁函数与词表常量）、对应测试文件；如函数 JSDoc/描述文案涉及「小节存在即前端需求」的口径，同步修正。
- 部署：core 变更，dist 同 commit；生产生效需推送、profile 锁重钉与用户执行实例重启。
- 上一任务的 force 绕过留痕（tasks/archive/2026-10/fallback-models/task.json overrides）即本任务的动因证据。
