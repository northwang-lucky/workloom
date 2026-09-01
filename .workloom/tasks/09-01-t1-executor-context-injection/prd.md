# T1 executor 上下文注入与 prompt 模板

## Goal

让 implement/check/research executor 子代理的 seed 携带本任务研究产物的全量上下文与
「禁止全局摸底」指令，消除每个子代理各自的仓库 recon。

## Requirements

1. **research 产物注入**：`buildExecutorPrompt`（`packages/core/src/legacy/executor-context.js`
   `buildInternal`）新增注入段：任务目录 `research/*.md` 全文注入 seed；合计超过
   20K 字符时截断，**保留文件头部（标题区）与锚点区**（截断语义与现有 artifact
   截断相反，需独立实现；被截断文件追加截断标注行）。
2. **无产物不报错**：任务无 `research/` 目录或无 `.md` 产物时该段为空，不影响现有
   注入链与返回（`stats` 新增字段记录注入/截断计数，缺省 0）。
3. **模板指令固化**：kind 纪律段（`EXECUTOR_CONTRACT_BY_KIND`）追加「先读上下文物料、
   禁止全局 recon（git status/log、glob 全库、无关文件批量 read）」指令（措辞按现有
   英文纪律段风格，implement/check 两 kind 注入，research 不注）。
4. **files 清单注入位（依赖 T3 上下文包）**：`buildExecutorPrompt` 消费 T3 的锚点索引
   产物，自动生成「本任务涉及文件清单」注入模板段；`userPrompt`（主会话 prompt）已
   含显式清单（关键词命中）时不重复注入。
5. **实现边界**：只改 core（`executor-context.js` 与其 d.ts、单测），不动 adapter-dsh
   的 executor.ts（T2 管）；T3 未交付时注入位为空实现（不报错）。

## Acceptance Criteria

1. 有 research 产物的任务：seed 文本含 `research/*.md` 全文（或截断规则生效后的
   头部+锚点区 + 截断标注）。
2. 无 research 产物的任务：seed 与现状一致（除纪律段新增指令外），统计缺省为 0。
3. 纪律段含「禁止全局 recon/先读材料」指令；主会话 prompt 带显式清单时不重复注入。
4. T3 交付后（本任务后续补测）：任务 `context/` 锚点索引存在时，seed 含自动 files 清单。
5. 回归：`packages/core` `node --test test/*.test.js` 全绿、`pnpm -r typecheck`、
   `pnpm lint`；改动文件 LSP diagnostics 干净。

## Notes

- 继承容器任务裁决（见 09-01-subagent-efficiency-continuable/prd.md）：注入全文、
  20K 截断保留标题+锚点区、files 清单自动生成、不做开关。
- 参考实现事实：research/executor-context.js 注入顺序
  Active task → artifacts（research 仅内联 prd.md）→ jsonl 引用 → Task prompt →
  kind 纪律段 → Local directives → Executor contract；`localDirectives` 是现有可选
  注入参数，research 注入可走同模式。
- 执行顺序：T3 先行交付锚点索引与解析器后，本任务补 files 清单消费测试。
