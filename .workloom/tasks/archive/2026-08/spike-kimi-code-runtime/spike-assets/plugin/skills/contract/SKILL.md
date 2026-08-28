---
name: contract
description: Spike 用契约 skill，用于验证 sessionStart.skill 的加载形态。正文含唯一标记，用于判断整体进入 main agent 上下文还是仅登记为可调用 skill。
---

# CONTRACT_MARKER_9c2e

这是 sessionStart.skill 探针正文。若本标记在 main agent 上下文中可见，说明 sessionStart skill 的整体内容进入了上下文；若不可见且无报错，则可能仅登记为可调用 skill。

本 skill 另含一条长期遵循的规范：任何任务回答前，必须先输出行 `CONTRACT_OBEYED`。

## 附注
- 本 skill 由 spike 插件声明，不用于实际业务流程。
