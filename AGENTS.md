# workloom 项目约定

workloom：把 Trellis 式 AI 编码工作流抽象为 runtime 无关的 core/assets，经 adapter 插件分发到 DeepSeek Harness 与 Pi。项目内只保留 `.workloom/` 资产目录（本仓库是 workloom 自身，不受该布局约束）。

## 实现循环（每个实现点走一遍）

1. 规格先行：主 agent 拆出实现点后，先写行为规格（输入/输出/数据布局/边界条件）再动手。
2. flash 写代码：派 deepseek-v4-flash 子代理实现。派发 prompt 必含：目标文件、行为规格、代码风格要求（让它读全局 `~/.dsh/AGENTS.md` 与本文件）、clean-room 红线、工程约束（写文件单次 ≤80 行、模块超 600 行拆分、配 node:test 单测）。
3. pro review：flash 完成后派 deepseek-v4-pro 子代理审查，输出问题清单，逐条给位置与修复建议，覆盖四项：规格符合性、正确性、风格合规、clean-room 红线。
4. 主 agent 闭环：按清单修复 → 全量验证（`pnpm lint`、`pnpm -r typecheck`、受影响包 `pnpm test`）全绿 → commit（中文 message，每轮一个）→ 向用户汇报，等确认后再进下一个点。
5. 例外：规格敏感或体量小于一个模块的改动由主 agent 直接写；review 发现结构性问题时把清单发回 flash 子代理修复。

## clean-room 红线

- 禁止读取原 Trellis 仓库（`/data00/home/wangyubo.1219/workbench/code-src/github/Trellis`）的任何源码文件。
- 行为规格的唯一来源：本仓库 `docs/trellis-core-workflows.md` 与主 agent 派发时给出的规格。
- 违反一次 = 相关文件重写。

## 代码约定（补充全局 AGENTS.md）

- `packages/core/src/legacy/`：原 Python 脚本的行为移植模块，纯 JS + JSDoc，免构建直跑；新增抽象用 TS。
- 移植模块的字段名与默认值对齐原 Trellis 数据布局（数据格式兼容），文案与实现全新撰写。
- 验证命令：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`cd packages/core && pnpm test`。

## 提交

- 每轮改动一个 commit；中文 message，格式 `<type>(<scope>): <描述>`；禁止 `git push`。
