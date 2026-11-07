# layering

各类代码的栖身位置。

- rule: `packages/core/src/` 按 task、dispatch、injection、workspace 四个功能子包划分，一律 TypeScript 且仅可擦除语法；根层只留 index.ts 与 resources-manifest.ts 作对外入口
- rule: 内容资源在 `packages/core/resources/`（skills、templates、workflow、skeleton、third-party），路径经 resources-manifest.ts 集中登记
- rule: runtime 无关逻辑归 core；宿主机制与 runtime 纪律文本归 dsh-workloom
- counter-example: 把 DSH 专属命令文本或 lsp_ 纪律文本放进 core
