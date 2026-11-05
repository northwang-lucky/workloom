# workloom-case-archived 实施期变更说明

## 1. 清理未使用标识符

实现落盘后，eslint 报告 `resolve` 导入与 `FULL_MODE` 常量未使用。implement 删除这两个死标识符，导出行为与测试不变，lint/typecheck/build 全绿。

## 2. 夹具 worktree 配置只保留 enabled

真实运行发现 `worktree.base_dir` 与 `copy_node_modules` 不是 core 支持的字段，导致规范注入跳过。build-fixtures.mjs 已改为 `worktree: { enabled: true }`，并用真实 loadConfig 验证五类夹具。当前运行若自行修补配置，其证据保留；后续运行使用修正后的配置。

## 3. 验收输出改为只报告通过结论

用户后续明确要求不生成评分、benchmark 或静态审阅页。PRD 已重新确认，hash 为 `e5ebd19942555a0b65b4991ec8a24af594b25272f0db92989fff0b962fb883fb`。最终只使用 `evals/skill-eval/iteration-1/acceptance-summary.md` 汇总五个场景的结果与证据；不启动 live-server。既有 eval_metadata 与研究材料仅作记录，不作为额外交付要求。

## 4. 补齐语言边界

CASE 设计发现 SKILL.md 缺少 R12/AC9 的显式语言约束。Boundaries 已补充：技能资产和评测断言使用英文，生成的任务文档遵循项目语言。DSH 内容测试同步增加保护并完成红绿验证。
