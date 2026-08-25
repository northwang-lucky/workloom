# workloom

把 Trellis 式 AI 编码工作流抽象为与 runtime 无关的核心逻辑层（core）与资源层（assets），通过面向各 runtime 的官方格式插件（adapter）分发；用户项目内只保留一个资产目录 `.workloom/`。MIT。

设计决策与术语见 `CONTEXT.md` 与 `docs/adr/`，架构见 `docs/architecture*.md`，安装与验证见 `docs/adapter-install.md`。

```txt
packages/
├── core/            # 纯 JS 移植模块 + TS 新增模块，tsc 构建发布（@workloom-ai/core）
├── assets/          # workflow 契约、指引、skills/agents/commands 中间表示（@workloom-ai/assets）
├── adapter-dsh/     # DeepSeek Harness profile bundle（@workloom-ai/adapter-dsh）
└── adapter-pi/      # Pi Package（@workloom-ai/adapter-pi，executor 自研 spawn child pi）
```

状态：Phase 1（DSH）与 Phase 2（Pi）已实现并双端真机验证；Phase 3 收尾中（发布前准备、文档收口）。
