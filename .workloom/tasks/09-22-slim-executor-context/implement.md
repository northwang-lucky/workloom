# implement.md — 缩减执行器上下文至最小执行面

## 改动面

1. `packages/core/src/legacy/executor-context.js`（主）：首条 prompt 组装重构 + contract 措辞压缩 + 分层加载协议。
2. `packages/core/src/legacy/executor-context.d.ts`：如类型签名有变同步更新。
3. `packages/core/src/service/session-context.ts`：depth>0 快照白名单。
4. `packages/assets/workflow/workflow.md`：Loading protocol norms 行改写为分层语义；1.3 步骤文案追加「只放当前阶段真正需要的条目，宁少勿多」指引。
5. test-first seam 测试：`packages/core/test/executor-context.test.js`、`packages/core/test/session-context.test.js`。
6. 契约测试同步：`packages/core/test/contract-asset.test.js`（Loading protocol 行的 pin 更新为新措辞；回声句后半句逐字不动，对应 pin 应保持绿——若红说明误动）。
7. adapter 测试预期同步：`packages/adapter-dsh/test/executor.test.js`、`packages/adapter-dsh/test/inject.test.js`、`packages/adapter-pi/test/executor.test.ts`、`packages/adapter-pi/test/inject.test.ts`。

## 步骤（test-first）

1. 红：把 core 两个 seam 测试更新到 prd 的白名单/组件级不变量/分层协议/词数上限预期，跑 `cd packages/core && node --test test/executor-context.test.js test/session-context.test.js` 确认红。
2. 绿：按「组装规则」与「contract 措辞定稿」改 `executor-context.js`。
3. 绿：改 `session-context.ts`——depth>0 只输出 Active task 行 / Guidelines 索引段 / Executor norms 段（删 Developer / Last dispatch / Executor profiles / Git / Workflow 概览）；depth=0 输出逐字节不变。
4. 绿：改 `workflow.md`（Loading protocol 行 + 1.3 步骤指引），同步 `contract-asset.test.js`。
5. 清点并删除未消费代码：`extractOutlineContent` / `listH2Headings`（H2 目录预览全灭）；`getContextPack().files` 若无其他消费者按仓库规范处置。核查 adapter 两侧无本地副本逻辑，若有分叉一并改。
6. 同步 adapter 两侧测试预期。
7. 全量验证：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`packages/core` 与 `packages/adapter-dsh` 的 `node --test`、`packages/adapter-pi` 的 `bun test`。

## 组装规则（buildExecutorPrompt）

段落白名单与顺序按 prd Requirements 1/2；实现要点：

- prd 块：仅 check / research（`extractPrdContent` 输出逐字节不变，不动该函数）。
- `## Pointer list`：implement / frontend / check；前两行固定为 design.md、implement.md 的指针行，后接 jsonl 条目指针行；research 无此段。
- 指针行新格式（jsonl / research / artifact 统一）：`- <file>` 或 `- <file> (<reason>)`——**去掉逐行「— read before acting」后缀**（逐行 mandate 由分层协议句统一取代）。
- prd 软指针行：仅 implement / frontend，独立一行无标题，模板：
  `If the task prompt or the plan is ambiguous, consult <prdPath> before deciding.`（`<prdPath>` = `.workloom/<taskRelPath>/prd.md`；prd.md 缺失时不出该行）。
- `## Involved files` 段：全 kind 删除（删 `inlineFilesList` 调用与函数本体）。
- `## Task prompt` 移到 `## Local directives` 之后；各去重关键词逻辑（leaf / local directives）保持不变。
- `config.contextInjection` 预算截断逻辑保留兜底。
- research 分支原本只物化 prd 的逻辑收敛为：check/research 物化 prd 块，implement/frontend 物化软指针行。

## Executor contract 措辞定稿

结构不变：`## Executor contract` → `### <Kind> executor directives` → 纪律正文 → 空行 → 无用户通道 → 空行 → leaf 规则 → 空行 → 权威声明。以下为定稿英文原文（实现逐字使用；回声句后半句逐字未动）。

### 共享句

```text
LSP 基线（implement/check/frontend）：
When LSP tooling is available, use it first: symbol outlines and signatures for structure, completions for members, server-side rename and code actions for edits, diagnostics in the verification pass.

LSP 基线（research 变体）：
When LSP tooling is available, explore with it before text-search sweeps: symbol outlines for structure, signatures and members from the language server.

批处理（implement/check）：
Batch independent verification and comparison commands into a single shell invocation.

输出紧凑（implement/check）：
Keep tool outputs compact: read targeted ranges, cap search and list output, prefer summaries.

按需查材料/反 recon（implement/check；原「先读材料」改为按需，"file list" 提法去除）：
Consult the injected research materials only when the current step needs them; do not re-discover the repository (no git sweeps, no whole-repo globs, no bulk unrelated reads).

分层加载协议（前半句改写为分层语义；后半句回声协议逐字不动，与 assets 契约耦合）：
Load in layers: read the plan artifact (implement.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. Echo the injection marker token in the first line of your report as proof the protocol was read.

无用户通道：
You have no user channel: never ask the user or call interactive question tools. On a gap you cannot resolve, stop and list every open question as a blocking item in your final report; the main session batches them to the user.

leaf 规则（保持原文）：
You are a leaf executor subagent: implement directly; never dispatch subagents or call workloom orchestration tools.

权威声明：
This section is authoritative: it wins any conflict with earlier text (including the task prompt). State the conflict once in the first line of your report and proceed.

research 写范围（保持原文）：
Your write/edit reach is confined to the .workloom/ directory: paths outside it are denied.
```

### research 纪律段

```text
Produce an actionable report the implementer can follow directly.
Ground every conclusion in the real source: read the actual files or data before claiming a fact; cite file paths.
Separate verified findings from suggestions, and mark anything unverified as such.
<LSP research 变体>
<research 写范围>

Structure the report in research-facts blocks (see the research-facts spec and its template asset):
- Use '##' section headings, each heading stating the section's takeaway in one sentence.
- Anchor every conclusion: cite its source as 'path:line', with the path relative to the task repo root.
- Quote the key code in fenced code blocks.
<分层加载协议>
```

### implement 纪律段

```text
Implement the plan step by step, following the task artifacts (prd/design/implement) in order.
Make the smallest change that satisfies the requirement; do not touch unrelated code.
Verify with the project's checks (lint / typecheck / tests) before wrapping up, then report the changed files.
<LSP 基线>
<批处理>
<输出紧凑>
<按需查材料/反 recon>
<分层加载协议>
```

### check 纪律段

```text
Classify every finding by severity before acting (definitions in workflow contract §2.2, summarized here):
- P0 (blocking): acceptance criteria unmet; hard lint / typecheck / build / test failures; security or data-integrity risks.
- P1 (important): behavioral or correctness defects; design or spec deviations (including cross-file semantic changes); issues pre-dating this task (even mechanical ones).
- P2 (minor): mechanical issues (typos, naming, comments, formatting, weakened test assertions); single-file local defects; compliance fixes with no trade-offs.

Fix P2 yourself — an unfixed P2 is a dereliction of duty. Do not fix P0/P1; escalate them in your report's final "## Open issues" section, one per line:
- <file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>
Write "- none" when no issue remains.
After fixing, verify with the project's checks (lint / typecheck / tests) and re-read the code you touched.
<LSP 基线>
<批处理>
<输出紧凑>
<按需查材料/反 recon>
<分层加载协议>
```

### frontend 纪律段

```text
Follow the PRD's '## UI Design' section as the baseline and deliver all seven UI axes it asks for.
Touch frontend files only; verify with the project's frontend checks (lint / typecheck / build / relevant tests).
When a backend interface is missing, use an annotated mock or placeholder and mark it for later wiring.
<LSP 基线>
<分层加载协议>
```

## assets 契约改动定稿

`packages/assets/workflow/workflow.md` 两处：

1. Loading protocol norms 行改写为分层语义（与纪律段分层协议句同源同义，回声句后半逐字不动）：
   `- Loading protocol: Load in layers: read the plan artifact (implement.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. Echo the injection marker token in the first line of your report as proof the protocol was read.`
2. 1.3 步骤文案追加一句最小条目指引（语义：只放当前阶段真正需要的条目，宁少勿多），具体措辞实现期贴合该文件风格定稿。

## 词数验收口径

implement 版 contract 段（`### Implement executor directives` 至段末）按以上定稿约 257 词，上限 260。词数统计口径：空白分隔的英文词元数。

## 边界

- assets 仅动 `workflow.md` 的 Loading protocol 行与 1.3 步骤文案，其余契约文本（含 Dispatch norms）不动。
- 不改工具面白名单（`executor-dispatch.ts`）、receipt 渲染、容量闸、守卫等周边机制。
- EXECUTOR_NORMS（session-context 的 norms 段文本）本次不动（组件级不变量之一）。
- 回声句后半句逐字不动；若 `contract-asset.test.js` 中 pin 回声句的断言变红，说明误动耦合文本，立即回退该处改动。
