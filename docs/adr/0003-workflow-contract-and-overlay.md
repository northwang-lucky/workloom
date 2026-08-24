# 工作流定义分层：契约随插件、指引支持项目覆盖，预留 profile 选择

工作流定义（原 Trellis 的 workflow.md）拆为两层：状态机契约（tag 块约定、阶段编号、状态枚举与迁移、breadcrumb 渲染逻辑）bundled 随插件分发，项目不可定制；指引文案支持项目级 workflow overlay（`.workloom/workflow.override.md`，可选），渲染时与内置默认合并。同时为二期“workflow profile 选择”机制预留改造空间。

## Considered Options

- 完全 bundled：契约与文案都随插件走，放弃全部项目定制，与“团队差异化工作流”需求冲突，否决。
- 完全项目内（原 Trellis 模式）：定制自由，但插件升级引入新 tag 时旧项目 breadcrumb 静默降级，契约漂移风险由每个项目承担，否决。
- 分层 + overlay（本决定）：契约稳定性与文案定制兼得，overlay 只含差异点、可 review、不 fork 全文。

## Consequences

- `.workloom` 布局不含 workflow.md，只含可选 workflow.override.md；“声明 + 数据”边界随之收敛。
- breadcrumb 渲染 = 内置契约 + 项目 overlay 合并，契约缺失时行为可预期，不再依赖项目文件完整性。
- 迁移旧项目时，原 `.trellis/workflow.md` 中的定制部分需转换（人工或 init 工具辅助）为 overlay 文件；结构级定制无法迁移，需二期 profile 机制承载。
- 预留接口：契约加载器与 overlay 合并器抽象为可替换组件，profile 选择即更换契约加载源。
