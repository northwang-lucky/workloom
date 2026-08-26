# workloom

把 AI 编码工作流抽象为与 runtime 无关的核心逻辑层（core）与资源层（assets），通过面向各 runtime 的官方格式插件（adapter）分发；用户项目内只保留一个资产目录 `.workloom/`。MIT。

团队规范见 `.workloom/spec/`（随会话注入，按需读取），项目指南见 `AGENTS.md`。

```txt
packages/
├── core/            # 纯 JS 移植模块 + TS 新增模块，tsc 构建发布（@workloom-ai/core）
├── assets/          # workflow 契约、指引、skills/agents/commands 中间表示（@workloom-ai/assets）
├── adapter-dsh/     # DeepSeek Harness profile bundle（@workloom-ai/adapter-dsh）
└── adapter-pi/      # Pi Package（@workloom-ai/adapter-pi，executor 自研 spawn child pi）
```

状态：双端（DSH/Pi）命令、注入、skills、executor、effort、journal、spec 知识库均已实现并真机验证；本仓库自身已迁移至 workloom 工作流（dogfooding）。
