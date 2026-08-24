# @workloom/assets

workloom 资源层：与 runtime 无关的内容资源。规划中的目录结构（点 6 落地）：

```txt
workflow/      # 工作流契约（阶段/tag/迁移）+ 内置指引文案（MD + front-matter）
skills/        # workloom 自有 skills 的中间表示
agents/        # Executor 定义（research/implement/check）的中间表示
commands/      # 命令资源的中间表示（init/continue/finish 等）
third-party/   # 三方 skill vendoring（mattpocock/skills，MIT；改写约定见 docs/vendoring-plan.md）
```

中间表示约定：正文 Markdown，元数据用 YAML front-matter；adapter 渲染为各 runtime 官方格式（DSH：skills 注册 / commands 注册；Pi：包内 skills / registerCommand / pi-subagents agent 定义）。
