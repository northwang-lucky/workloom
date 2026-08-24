# workloom

把 Trellis 式 AI 编码工作流抽象为与 runtime 无关的核心逻辑层（core）与资源层（assets），通过面向各 runtime 的官方格式插件（adapter）分发；用户项目内只保留一个资产目录 `.workloom/`。MIT。

设计决策与术语见 `CONTEXT.md` 与 `docs/adr/`，架构见 `docs/architecture*.md`。

```txt
packages/
├── core/            # 纯 JS 移植模块 + TS 新增模块，tsc 构建发布
├── assets/          # workflow 契约、指引、skills/agents/commands 中间表示
├── adapter-dsh/     # DeepSeek Harness profile bundle
└── adapter-pi/      # Pi Package（Phase 2）
```

状态：Phase 1 实现中。
