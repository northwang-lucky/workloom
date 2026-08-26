## 仓库迁移至 workloom 工作流并去 Trellis 化

- Time: 2026-08-26T11:03:54.954Z
- Commit: 1d746be
- Summary: dogfooding：初始化 .workloom、8 主题 spec 沉淀、AGENTS.md 重写为项目指南、删除 docs 与 .agents/skills、AGENTS.local.md 承载个人红线、core 注释去历史溯源表述（迁移功能保留）；spec 索引注入与会话收尾链路全程实证。

## init 生成 .workloom/.gitignore 并收敛忽略策略

- Time: 2026-08-26T12:21:48.706Z
- Commit: 1d529da
- Summary: init 幂等生成 .workloom/.gitignore（.runtime/ + .developer 两条目），本仓库忽略策略从根 .gitignore 收敛至自包含文件；全程 test-first，部署同步已确认生效。

## 修复 task-store 归档旧格式任务 hooks 崩溃

- Time: 2026-08-26T14:21:45.216Z
- Commit: 3c5bb84
- Summary: 排查 dsh session-f98c8040 的 after_archive 报错：旧格式 task.json 缺 hooks 字段导致 readTask 后 task.hooks 为 undefined。在 readTask 统一归一化补齐空数组并补回归单测，构建产物已同步至 profile（重启 dshweb 由用户确认）。

