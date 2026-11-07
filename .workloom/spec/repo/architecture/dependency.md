# dependency

包间依赖方向。

- rule: `dsh-workloom` 可依赖 `core`（仅裸包名入口）；core 不得依赖 dsh-workloom 或任何 runtime 包
- rule: core 需要内容时经自身 resources-manifest 读取；插件包不再以参数传内容文本（resources 随 core 包发布）
- counter-example: core import dsh-workloom，或 dsh-workloom 深引 `@workloom-ai/core/src/...`
