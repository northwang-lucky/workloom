# 实施计划：扩展 LSP 提示词基线（测试先行）

接缝（AC1）：`executor-context.test.js` / `contract-asset.test.js` 的基线句断言。文本以 design.md §1 逐字符为准。

## 步骤

1. [红] 测试先行：两测试文件快照常量换新主句；`contract-asset.test.js` version 断言 14→15；`executor-context.test.js` 新增 research 纪律段含变体句断言。跑 `cd packages/core && node --test test/executor-context.test.js test/contract-asset.test.js` 确认失败且仅因新句缺失。
2. [绿] core `packages/core/src/legacy/executor-context.js`：换 `LSP_BASELINE_SENTENCE` 多段拼接值（JSDoc 中文注释同步）；新增 `LSP_RESEARCH_BASELINE_SENTENCE` 并注入 `EXECUTOR_CONTRACT_BY_KIND[research]`（三句 grounding 指令末尾、report 结构说明块之前）。
3. `packages/assets/workflow/workflow.md`：4 处 138 字符旧句整行替换为新主句（2.1 / 2.2 / in_progress / norms）；front-matter `version: 15`。research 步骤正文不动。
4. `.workloom/config.example.yaml` prompts.local 示例段：换点名式示例 + 环境注释（design §4 口径），说明 requiresTools 检查同名工具。
5. 本机落地：重写 `.workloom/prompts.local/` 四片段（全文见附表，gitignored）。
6. 验证：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core 与 adapter-dsh 的 `node --test` 全绿；`workloom_doctor` 确认四片段加载；`lsp_diagnostics` 检查改动的 TS/JS 文件（本机 cordis 已补 .js 映射但需重启才生效——当前对 .js 报 UNAVAILABLE 属预期，记录之）。
7. 部署提醒（不执行重启）：告知用户按 deployment spec 同步 + 择机重启 dshweb。

## 附表：prompts.local 四片段全文（front-matter 哨兵维持 [lsp_diagnostics]）

### main.md（无 front-matter）

```txt
# Local directives (main agent, all sessions)

You MUST lean on LSP tooling on this machine: use lsp_symbols / lsp_signature to orient before touching code, lsp_completion / lsp_code_action to resolve details and fixes, lsp_rename for renames instead of textual search, and treat the built-in soft baseline as a hard constraint — the verification pass of every task includes an lsp_diagnostics check. lsp_format / lsp_inlay_hints: as needed.
```

### implement.md

```txt
---
requiresTools: [lsp_diagnostics]
---
# Local directives (implement executor)

You MUST use LSP tooling while implementing on this machine: lsp_symbols / lsp_signature / lsp_completion for structure and APIs, lsp_rename for every symbol rename (never textual find-replace), lsp_code_action for quick-fixes, and lsp_diagnostics after each edit. Your final report MUST include the lsp_diagnostics verification result (clean, or every remaining diagnostic fixed with evidence). lsp_format / lsp_inlay_hints: as needed.
```

### check.md

```txt
---
requiresTools: [lsp_diagnostics]
---
# Local directives (check executor)

You MUST use LSP tooling while reviewing on this machine: lsp_diagnostics on every touched file, lsp_symbols / lsp_signature to verify structure and call sites, lsp_code_action to judge available fixes. Your final report MUST include the lsp_diagnostics verification result (clean, or every remaining diagnostic fixed or recorded with evidence). lsp_format / lsp_inlay_hints: as needed.
```

### frontend.md

```txt
---
requiresTools: [lsp_diagnostics]
---
# Local directives (frontend executor)

You MUST use LSP tooling while implementing frontend changes on this machine: lsp_symbols / lsp_completion / lsp_signature for components and APIs, lsp_rename for refactors, lsp_code_action for fixes, and an lsp_diagnostics check in the frontend verification pass before reporting. lsp_format / lsp_inlay_hints: as needed.
```
