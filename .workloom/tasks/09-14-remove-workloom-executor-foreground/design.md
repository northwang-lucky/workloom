# 设计：移除 workloom executor foreground 参数支持

## 目标行为

`workloom_execute` 只有后台派发语义：调用立即返回 child session id 与 receipt，executor 完成后通过既有异步报告链路回投主会话。`foreground` 不再是公开参数，也不保留 executor 专属前台结算入口。

## 改动范围

1. core surface
   - 删除 `PARAM_DESCRIPTIONS.foregroundExecutor`。
   - 更新 `TOOL_SNIPPETS.executor`，只列保留参数。
2. assets workflow
   - Phase 2.1、2.2 与 workflow norms 删除“传 `foreground: true`”指导。
   - 保留“后台默认、完成报告异步到达、不要阻塞/轮询、`continue_executor` 只追加工作”的语义。
3. adapter-dsh
   - `buildExecutorSchema` 删除 `foreground` 属性。
   - `ExecutorArgs` 删除 `foreground`。
   - `execute` 删除前台分支，统一返回后台结果；删除仅服务前台的调用路径和测试断言。
4. adapter-pi
   - `EXECUTOR_PARAMS` 删除 `foreground` 属性。
   - 顶层 executor 删除 `params.foreground` 生效逻辑。
   - `dispatchChildPi` 与 `registerChildSettle` 删除前台参数和前台结果类型，统一后台报告。
5. 测试
   - 删除/改写前台阻塞用例。
   - 增加或保留 schema 不含 `foreground`、后台派发、续用、settle 回填和报告路径的覆盖。

## 边界与非目标

1. 不改 `continue_executor`、`reinject`、model/effort 绑定、并发门禁等语义。
2. 不清理 `docs/research` 等历史研究记录中的旧描述。
3. 非 executor 工具中通用的 `foreground` 结果类型不属于本任务。
4. 不改 task.json 数据模型字段，避免历史任务迁移。

## 风险与应对

1. 风险：旧测试依赖前台返回终文。
   - 应对：替换为后台 receipt 与异步 settle 断言。
2. 风险：Pi adapter 进程级行为变化需要真机证据。
   - 应对：按 `adapter-pi/verify` 产出并执行最小真机 checklist。
3. 风险：core/assets/adapters 文案不一致。
   - 应对：以 core surface 和 workflow asset 为单一入口，最后用 `foreground` 搜索排除发布面残留。

## 拆分判断

本任务虽触及 core、assets、DSH adapter、Pi adapter，但它们共同服务同一个公开参数删除，不能独立验收和发布；不建议拆成子任务。
