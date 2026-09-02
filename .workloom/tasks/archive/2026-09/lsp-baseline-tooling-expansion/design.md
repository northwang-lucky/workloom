# 设计：扩展 LSP 提示词基线

## 1. 权威文本（单一来源，逐字符为准备入测试快照）

### 1.1 主基线句（替换 core `LSP_BASELINE_SENTENCE` 现值，contract 4 处同源替换）

```txt
When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.
```

core 常量写法（多段拼接，拼接结果必须与上逐字符一致；contract 内为同一句的整行文本）：

```js
const LSP_BASELINE_SENTENCE =
  'When LSP tooling is available, treat it as the first choice for code work: ' +
  'read structure through LSP symbol outlines and call signatures; ' +
  'resolve members and arguments with completions; ' +
  'rename symbols through server-side rename and fix them with code actions ' +
  'instead of hand-searched edits; ' +
  'and include an LSP diagnostics check in the verification pass.'
```

### 1.2 research 变体句（新常量 `LSP_RESEARCH_BASELINE_SENTENCE`，仅注入 core research kind 纪律段）

```txt
When LSP tooling is available, explore through it before falling back to text-search sweeps: map code structure with LSP symbol outlines and resolve call signatures and members from the language server.
```

## 2. 注入矩阵

| 落点 | 文本 |
| --- | --- |
| core `EXECUTOR_CONTRACT_BY_KIND.implement/check/frontend` | 主句（现状不变的位置，仅换文本） |
| core `EXECUTOR_CONTRACT_BY_KIND.research` | 变体句（新增注入，追加在三句 grounding 指令末尾、report 结构说明块之前；research 段本就不含 READ_MATERIALS_FIRST_RULE） |
| workflow.md 2.1 完成标准 / 2.2 完成标准 / `[workflow-state:in_progress]` / `[workflow-norms]` | 主句 ×4（contract 不进变体句，research 步骤正文不动） |
| workflow.md front-matter | `version: 14` → `15` |
| `.workloom/config.example.yaml` prompts.local 示例段 | 点名式示例 + 环境注释（见 §4） |
| 本仓库 `.workloom/prompts.local/` 四片段 | 按 target 定制点名句（见 §4，gitignored 不入库） |

## 3. 测试接缝（修正 brainstorm 口径：实际两个文件，非三个）

- `packages/core/test/executor-context.test.js`：L452 快照常量换成新主句；补断言——implement/check/frontend 段含主句（现状）、**research 段含变体句**（新增）。
- `packages/core/test/contract-asset.test.js`：L366 快照常量换新主句；norms/in_progress/2.1/2.2 四处包含断言不变。
- `packages/core/test/session-context.test.js`：**不改**。其 L387 字符串是 `localDirectives` 合入参的示例数据，只验小节装配顺序，与基线句无关。
- adapter-dsh / adapter-pi 测试无该句快照，零改动。

## 4. 本机片段与 example 措辞（全文见 implement.md 附表；均为英文点名式）

- 要点：8 工具点名表共享；main 重 symbols/signature 摸底 + diagnostics 硬约束；implement 重 rename/completion/signature；check 重 code_action/diagnostics；frontend 取 implement 子集；format/inlay_hints 一律"as needed"。
- example 注释一句话：示例基于 DSH + dsh-lsp-actions，工具名按 runtime 实际暴露改。

## 5. 交付与生效

- `pnpm -r build` 后按 deployment spec 跑 `~/dsh/bin/dsh-sync-workloom` 的 rsync 段；dshweb 重启归用户（届时 cordis.patch.yml 的 .js 映射一并生效）。
- `workloom_doctor` 验证四片段加载（AC4）。
