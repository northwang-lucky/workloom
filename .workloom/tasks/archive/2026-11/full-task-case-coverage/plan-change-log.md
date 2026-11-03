# PLAN 实施期变更说明

本文件记录启动后由主会话审核确认的调整。原 `plan.md` 是已确认基线；本文件只记录不改变外部设计目标的实现修正，不替代原 PLAN。

## 1. 测试夹具类型收窄

- DSH CASE 工具测试的模拟 agent 补 `options: {}`，与 `delegationDepthOf` 的真实调用前提一致；生产代码不变。
- Pi CASE 工具测试在解包 `createTask` 返回值前补 `assert.ok(created)`，与仓库既有测试惯例一致。
- `sectionBody`、checkTaskInternal 的 `caseHash` 和 `case.d.ts` 的锚点按严格类型与 copy-domain-dts 规则收窄，不改变运行语义。

这些调整属于测试与类型适配，不需要用户重新确认外部设计。

## 2. Traceability 按表格列解析

主会话在 CASE 初审中发现，`row.match(/C\d+/g)` 会把 AC 编号本身误当成 C 引用。修正为按表格列拆分后读取 Static review 和 Runtime cases 两列，同号 C 出现在其他 AC 行不能使当前行误通过。每个 AC 仍按 PRD 要求至少对应一个 SR 或 C；SR-only 与 C-only 的 AC 都合法，只有两列都为空才报 `traceability_empty`。分隔行只由 AC 列识别，SR 列的 `-` 不得导致整行被跳过。公开测试同时覆盖按列解析、SR-only、C-only 与双空列边界。

## 3. Exclusions 使用通用匹配机制

为支持目录级排除并避免 CASE 逐文件枚举，匹配规则统一为：

- 目录前缀匹配；
- `*` 匹配单层路径段；
- `**` 匹配任意层级；
- 精确路径保持原语义。

该机制用于 Coverage Scope、git 变更 SR 覆盖和 RESULT Changed Files 三处，避免三处规则不一致。它不改变 CASE 模板字段，只改变排除规则的表达能力。

## 4. CASE 草案初审调整

- 覆盖率命令中的 WT/TASK 改为绝对路径，避免 Bun coverage-dir 相对到包目录。
- LCOV 合并同时兼容绝对和相对 SF，先归一为 repo 相对路径再过滤。
- C6、C10 的 Cleanup 与实际复用目录一致。
- CASE_STRUCTURE 的字段数修正为七个。
- 使用第 3 节的通用排除规则压缩 CASE 体积，为后续修订保留注入预算。

## 5. 既有测试夹具兼容

新增 `packages/core/test/fixtures/task-artifacts.js` 统一构造 PLAN/CASE 夹具。机制类旧测试通过 `markTaskLegacy` 显式恢复 `case=null`，继续验证旧任务行为；新 CASE 行为由 `case.test.js` 独立验证，避免把新通过条件误用于旧数据。

## 6. 实施后半段的兼容处置

- 注入器在 readTask 失败时保持既有全 kind 降级行为，跳过 CASE 段；execution 的确认校验仍在可读取任务时 fail loud。该调整保留既有 S2 零 diff 不变量。
- Pi 新测试补空值断言，DSH 新测试删除未使用导入；这些属于严格类型与 lint 适配。
- session-context 的旧任务断言同步迁移提示，Pi persona 测试改为 core 纪律单一来源。
- workflow 2.1 保留既有 frontend 段与完成标准，符合原需求，无需裁剪。

## 7. Pi 真机发现的顶层 purpose 转发缺陷

- 真机派发记录显示 purpose 仍为 execution。源码核对确认 `dispatchChildPi` 内部已支持 purpose，但 `executeTool` 最外层调用漏传。
- 修复落在 executor.ts 的 dispatchChildPi 调用对象，并新增覆盖 executeTool → dispatchChildPi 参数转发的测试，避免只测内部函数。
- Pi 真机曾在验证会话中直接修改被测源码；主会话已保存原始报告并复核当前 diff，没有发现超出 PLAN 的功能改动。该过程问题不作为通过证据，最终仍由 implement/check 的正式记录与全量测试验收。
