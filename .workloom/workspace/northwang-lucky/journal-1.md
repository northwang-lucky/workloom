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

## task_start/task_archive 流程硬卡点

- Time: 2026-08-27T01:45:20.739Z
- Commit: 30253b0
- Summary: 复盘 DSH 会话 session-f98c8040 跳过 workloom 流程的根因（软约束无硬卡点），落地 task_start/task_archive 流程硬卡点：新增 task-gates 模块与 workloom_task_check 凭据工具、force/overrides 豁免留痕、两 adapter 注册、workflow 契约同步（core a8fe374 / adapter 8b55eff / 契约 b74c9a8 / 交付物 30253b0）；全程走通 1.1 对齐（brainstorm+grilling）→1.3 配置→1.4 评审→2.1 TDD 实现→2.2 check→2.3 提交→3.1 归档。另发现 after_archive 空指针为旧部署版本问题，仓库已修复。

## design/implement 编写改为主动询问用户

- Time: 2026-08-27T03:23:56.075Z
- Commit: 88d6e20
- Summary: workflow 契约 1.4 改为 prd 定稿后主动询问用户是否编写 design/implement（两选项捆绑），去掉 "for complex tasks" 模糊判定；completion criteria 与 planning 面包屑同步；构建产物已 rsync 到 DSH web profile（未重启 dshweb）。

