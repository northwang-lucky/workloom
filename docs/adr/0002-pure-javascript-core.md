# 原 Python 脚本的移植逻辑用纯 JavaScript，其余代码一律 TypeScript

core 中原 Trellis Python 脚本（task.py、session-start.py、inject-*.py、add_session.py 等）的等价逻辑，需被两个 runtime 直接运行。决定：这些移植模块以纯 JavaScript（ESM + JSDoc）编写、免构建直跑；除此之外的代码——core 的新增模块、adapter-dsh、adapter-pi——一律用 TypeScript 编写。

## Considered Options

- 全部 TypeScript + 构建：移植模块若 TS 化，DSH 动态执行环境不做转换、Pi 侧 jiti 做运行时转换，两端形态割裂且为移植物引入构建链，否决。
- 全部 JavaScript：adapter 层放弃类型安全，与 runtime 官方生态（DSH 官方包均为 TS 源码 + 构建产物、Pi Extension 为 TS 直载）脱节，否决。
- 分层（本决定）：移植模块 JS 源码、免构建；其余 TS。

## Consequences

- core 包以“少量 JS 移植模块 + TS 新增模块”构成，整体经 tsc 构建后作为 npm 包发布；移植模块以 JSDoc + checkJs 兜底类型。
- adapter-dsh：TS 源码 + tsc 构建产物，作为 DSH profile bundle 发布（DSH 官方包惯例）。
- adapter-pi：TS 源码，由 jiti 直载，无需构建步骤。
- 移植模块保持纯 JS 也是 clean-room 的佐证之一：与原文案、原实现逐行不同的全新实现。
