# workloom

把 AI 编码工作流抽象为与 runtime 无关的核心逻辑层（core，资源在 `packages/core/resources/`），以 dsh-workloom 插件分发到 DeepSeek Harness；用户项目内只保留一个资产目录 `.workloom/`。MIT。

团队规范见 `.workloom/spec/`（随会话注入，按需读取），项目指南见 `AGENTS.md`。

```txt
packages/
├── core/            # 核心逻辑层：src 按功能分 task/dispatch/injection/workspace 子包，资源在 resources/（@workloom-ai/core）
└── dsh-workloom/    # DeepSeek Harness 插件：src 根层插件入口 + dispatch/tooling 子包，dist 同 commit 入库（@workloom-ai/dsh-workloom）
```

状态：命令、注入、skills、executor、effort、会话簿记收尾、spec 知识库均已实现并真机验证；本仓库自身已迁移至 workloom 工作流（dogfooding）。
