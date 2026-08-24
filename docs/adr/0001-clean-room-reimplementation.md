# 以 clean-room 方式重实现 Trellis 工作流，并弃用 trellis 命名

本项目参考 mindfold-ai/Trellis（AGPL-3.0）的工作流行为做独立实现。决定：不复制、不翻译、不改编其任何文档与代码文本；行为与 `.trellis` 数据布局保持兼容，全部文案与代码全新撰写；项目定名 **workloom**，资产目录定名 **`.workloom`**，不再使用 trellis 命名；许可证采用 **MIT**。

## Considered Options

- 直接 fork 原项目：传染性 AGPL-3.0，分发受限，否决。
- 允许改编原文档（workflow.md、agent/skill 文案）：衍生文本须同样按 AGPL-3.0 发布，与"可自由分发的万能插件"目标冲突，否决。
- clean-room 重实现：行为与数据格式兼容、文本独立，采用之。

## Consequences

- `.trellis` 数据布局保持兼容，老项目任务数据可直接迁移；init 需支持从旧目录迁移/重命名。
- 未来新功能不得从原仓库复制文本；借鉴行为时以本仓库调研报告（docs/trellis-core-workflows.md）为行为规格。
- 新目录名与原目录名的映射关系需要在 init 中显式处理。
