# 实现计划：移除 workloom executor foreground 参数支持

## 步骤

1. 更新共享 surface 与 workflow asset。
   - 删除 executor `foreground` 参数描述。
   - 改写工具速览、Phase 2.1、Phase 2.2 和 workflow norms 的派发描述。
2. 更新 DSH adapter。
   - 从 executor schema 和参数类型移除 `foreground`。
   - 删除 `execute` 的前台分支，统一构造后台返回。
   - 清理只服务前台阻塞语义的单测，补强 schema/后台语义断言。
3. 更新 Pi adapter。
   - 从 TypeBox schema 和参数类型移除 `foreground`。
   - 删除 dispatch 与 settle 的 foreground 入参、前台结果类型和“不回投报告”分支。
   - 确保后台派发、续用和完成报告仍复用现有链路。
4. 更新测试期望。
   - core contract/surface 测试同步新文案。
   - adapter-dsh 与 adapter-pi executor 测试同步新接口面。
5. 验证。
   - 运行 LSP diagnostics 覆盖改动 TS 文件。
   - 运行 `pnpm lint`。
   - 运行 `pnpm -r typecheck`。
   - 运行 `cd packages/core && node --test test/*.test.js`。
   - 运行 `cd packages/adapter-dsh && node --test test/*.test.js`。
   - 运行 `cd packages/adapter-pi && bun test test/*.test.ts`。
   - 若 Pi executor 行为确认被修改，按 `adapter-pi/verify` 执行真机 checklist 并记录结果。
6. 复核与提交。
   - 用内容搜索确认发布面不再出现 executor `foreground` 支持描述。
   - 由 check executor 完整复核；处理问题后记录 `workloom_task_check`。
   - 创建一个非空 commit，不主动 push。

## 实现约束

1. implement 阶段由 implement executor 修改实现文件，主会话不直接写实现代码。
2. 运行时/agent-facing 英文文案必须保持英文且语义明确。
3. 源码注释用简洁中文说明设计意图。
4. 删除未被消费的入参和类型分支，不保留死代码。
