# 提示词本机扩展点机制（Pi 落地）— 实施计划

顺序执行；test-first（接缝见 design.md §6）。验证命令：`cd packages/adapter-pi && node --test 'test/*.test.ts'`、`pnpm -r typecheck`、`pnpm -r build`、`pnpm lint`、`cd packages/core && node --test test/*.test.js`。

## 1. pi-tools.ts 公共模块（+ 单测）

1. 先写 `packages/adapter-pi/test/pi-tools.test.ts`（先红）：
   - `buildTheoreticalTools(true)` = read/bash/edit/write/lsp_diagnostics/lsp_fix；`(false)` = 内置 4；
   - 常量导出断言（PI_LSP_SOURCE / PI_LSP_TOOLS / BUILTIN_CHILD_TOOLS）。
   - `hasLspCapability`：mock ExtensionAPI（getActiveTools 含/不含）两态。
2. 实现 `packages/adapter-pi/src/pi-tools.ts`（design.md §2）。

## 2. pi-args.ts `-e` 追加（TC1）

1. `pi-args.test.ts` 增补（先红）：
   - `loadExtensions: ['npm:@narumitw/pi-lsp']` → 参数序列在 `--no-extensions` 后含 `-e npm:@narumitw/pi-lsp`；
   - 未传 → 序列与旧版逐字一致；空数组同未传。
2. 实现：`BuildChildPiArgsParams.loadExtensions?: string[]` + 组装（`--no-extensions` 后追加每源 `-e` 对）。

## 3. executor.ts 注入链（TC2/TC3）

1. `executor.test.ts` 增补（先红）：
   - mock pi（getActiveTools 含/不含 lsp_diagnostics）；
   - 理论工具集命中时：`buildExecutorPrompt` 产物含 `## Local directives` 且片段文本在；未命中：无该段；
   - `buildChildPiArgs` 收 loadExtensions 的参数路径（执行层接线断言）。
   - 现有测试回归：不传扩展时行为不变。
2. 实现：executor 派发链按 design.md §3.2 接线（探测 → 工具集 → composeLocalDirectivesText → buildExecutorPrompt → dispatchChildPi → buildChildPiArgs）。

## 4. inject.ts 主会话注入（TC4）

1. `inject.test.ts` 增补（先红）：
   - `assembleSessionContextText` 传 localDirectives：快照含 `Local directives:` 小节；不传：无（基线不变）；
   - `injectSessionContext` 探测命中/未命中两态（mock pi）。
2. 实现：包装函数加可选参 + session_start 探测传参（design.md §4）。

## 5. 回归与全量验证（TC5）

1. grep 断言：`agent-definitions.ts` 不含 "LSP tooling"（防复述）；若实现过程触及该文件必须还原。
2. `pnpm lint` / `pnpm -r typecheck` / `pnpm -r build`；adapter-pi / core / adapter-dsh 全量测试。
3. 核对 core 无 diff（`git diff --stat packages/core` 应为空；若有最小签名调整须在报告中说明）。

## 6. pi-lsp server 配置（机器层，TC6，设计稿另附）

1. 对照 `~/.pi/agent/npm/node_modules/@narumitw/pi-lsp/README.md` 的「Custom config」schema 写 `~/.pi/agent/pi-lsp.json`：
   - gopls（`.go`）、bash-language-server（`.sh`/`.bash`）、TS 双路（tsgo `tsc --lsp --stdio` 优先 + typescript-language-server 兜底，tsserver fallbackPath `~/.dsh/lsp-typescript/node_modules/typescript`）。
2. 不改动仓库任何文件；把写入的 JSON 全文贴在报告里（供主会话与用户核对）。

## 7. 收尾

1. 汇总变更清单（预期只有 adapter-pi 的 pi-tools.ts 新增 + pi-args/executor/inject 修改 + 3 个测试文件增补 + pi-lsp.json 机器层文件）与验证结果，交 check executor 复核。
2. 不 git commit；不启动/重启任何服务。
