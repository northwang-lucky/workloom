# 移除 DSH 写入硬门禁

## Goal

彻底移除 workloom DSH adapter 对主会话及子会话文件写入的运行时硬拦截，改由既有 Agent prompt 与 workflow 契约约束实现分工，避免 continuable 子会话在异常续跑时因临时身份丢失而被错误阻塞。

## Requirements

1. 删除 adapter-dsh 的写入 gate 模块、plugin 注册入口、executor 临时豁免生命周期及对应测试，不再监听 `tools/pre-execute` 拦截 `write/edit`。
2. 从 core 默认配置、配置类型、初始化模板和 doctor 检查中删除 `executor.gate`；旧项目残留该字段时按未知旧字段静默忽略。
3. 保留 Agent prompt/workflow 中“实现必须经 implement executor、主会话不得直接写实现代码”的分工提示及 check 阶段修复例外。
4. 删除 Agent 提示中关于 DSH 存在运行时写入门禁、可通过 `executor.gate: false` 关闭门禁的描述。
5. 不新增 executor session 索引，不修改 DSH continuable/followup 机制，不实现针对 429 的专用重试逻辑。
6. 按 TDD 逐个公共接缝完成红绿循环：plugin 注册、配置与初始化输出、doctor 结果、workflow Agent 提示。
7. 完成干净构建后同步 core、adapter-dsh 与 assets 到当前 DSH Web profile，但不主动重启 DSH Web。

## Acceptance Criteria

1. adapter-dsh plugin 激活后不再注册 Workloom 文件写入预执行拦截；主会话、executor 子会话和其他子会话均不会被 Workloom gate 拒绝写入。
2. gate 源码、构建产物入口、专用测试和 executor 豁免调用均已删除，不保留无效兼容层。
3. `DEFAULT_CONFIG`、类型声明和新项目初始化输出均不含 `executor.gate`；含旧字段的配置仍可正常加载，且该字段不产生作用。
4. doctor 不再产生 executor gate 相关问题或修复建议。
5. workflow 仍明确要求实现文件由 implement executor 修改，并保留 check 阶段主会话修复后重派 check 的规则；全文不再提及 `executor.gate` 或运行时文件拦截。
6. TDD 证据覆盖 plugin、配置/初始化、doctor 和 workflow 四个公共接缝，删除实现前测试先红、实现后转绿。
7. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core 与 adapter-dsh 测试全部通过，修改过的 TypeScript 文件无 LSP diagnostics。
8. 干净构建后工作区及同步后的 DSH profile 均不存在 `dist/gate.js`、`dist/gate.d.ts`、`dist/gate.js.map`；同步过程使用 `rsync --delete`，不重启服务。

## Notes

- 触发背景：DSH 主会话 `session-65175223-338b-4805-a2fd-6b865b30bb37` 的 executor 子会话第一轮因供应商 429 异常结束，临时豁免注销；原生 `send_message` 续跑后被 gate 错误阻塞。
- 删除硬门禁后，Agent 分工仅由提示词与工作流契约保证；明确接受不再由运行时强制执行的风险。
- 本任务不涉及前端 UI，不修改 DSH 实现仓库，不主动重启当前 DSH Web。