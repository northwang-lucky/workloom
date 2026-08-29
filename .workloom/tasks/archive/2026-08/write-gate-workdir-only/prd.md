# 放宽写门禁为仅拦截工作目录内的文件

## Goal

任务 in_progress 期间，主会话/非豁免子代理的 write/edit 写门禁只拦截「工作目录及其子目录」内的目标文件；工作目录之外的路径一律放行（用户已确认：拦截范围是工作目录及其子目录，除此以外都不拦）。

## Requirements

- **门禁范围收窄**：`decideTarget` 增加一条判定——目标路径不在项目根 `<root>`（`findWorkloomRoot` 解析出的 `.workloom` 所在仓库根，即"工作目录"）内时直接放行；只有位于 `<root>` 内且不在 `<root>/.workloom/` 下的目标才 deny。
- **判定基准**：相对路径仍以 agent cwd 为基准 `resolve` 归一化后判断（与现状一致）；`../` 解析后越出 `<root>` 的目标视为工作目录外，放行；不解析符号链接（保持现状）。
- **两条判定链共用**：主会话链（`decideMainSessionGate`）与非豁免子代理链（`decideSubagentGate`）共用 `decideTarget`，一处改动两边生效，不新增分叉。
- **既有行为不变**：`.workloom/` 内放行（任务自身录）、`executor.gate: false` 放行、无活动任务/非 in_progress 放行、DEFENSIVE 放行分支均保持。
- **文案与注释**：`DENY_REASON` 运行时文案不变（仍面向工作目录内的拒绝场景）；同步更新 `gate.ts` 顶部设计意图注释与判定链注释（第 6 步校验），明确"仅拦截工作目录内"的新语义。
- **测试补齐**：`packages/adapter-dsh/test/gate.test.js` 增加——root 外绝对路径放行、`../` 越出 root 的相对路径放行、root 内业务路径仍 deny；既有用例保持全绿。

## Acceptance Criteria

- 新增单测覆盖上述三条分支并通过（`cd packages/adapter-dsh && npm test` 等价命令，先 build 后 `node --test`）。
- 全量验证通过：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、受影响包测试全绿。
- 现有用例无回归：root 内业务路径 deny、`.workloom/` 放行、gate:false 放行、无 in_progress 放行等既有断言仍绿。

## Notes

- 涉及文件（仅两处）：`packages/adapter-dsh/src/gate.ts`、`packages/adapter-dsh/test/gate.test.js`；core 与其他包不动。
- adapter-dsh 测试对 `dist/` 跑 `node --test`，改动后需先 `pnpm --filter @workloom-ai/adapter-dsh build` 再跑测试。
- 提交规范：中文 message，`<type>(<scope>): <描述>`，每轮一个 commit；禁止主动 push。
