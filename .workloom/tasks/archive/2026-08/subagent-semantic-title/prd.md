## Goal

解决同一任务多次派发时子会话标题雷同的问题（task title 作语义部分导致无法区分），并把前缀从 `[Workloom Implement]` 精简为 `[Implement]`。

## Requirements

1. `workloom_execute` 新增可选参数 `title`（两 adapter 的 schema 同步）：
   - adapter-dsh：传了 title → 子会话标题为 `[<KindLabel>] <title>`；缺省回退 `[<KindLabel>] <task title>`；task title 缺失/空白时整体回退为 `workloom-<kind>`（连字符形式，与既有 `workloom <kind>` 不同，属刻意调整）；
   - 前缀精简：`[Workloom <KindLabel>]` → `[<KindLabel>]`（KindLabel 映射不变：Research/Implement/Check）；
   - adapter-pi：接受并忽略该参数（child pi 为 --no-session 进程无标题概念），文档注明仅 DSH 生效。
2. 参数文案（core surface）：PARAM_DESCRIPTIONS 新增 title 描述（英文），说明语义标题用途与回退行为；TOOL_SNIPPETS.executor 同步加 title?。
3. workflow.md 契约（step 2.1 或 2.2 附近）：建议派发时给出语义化 label（一句话即可，契约英文）；是否升 version 按语义变更惯例升 3 → 4。

## Acceptance Criteria

1. adapter-dsh：title 传入时标题为 `[Implement] <title>`；缺省回退 `[Implement] <task title>`；task title 缺失回退 `workloom-<kind>`；KindLabel 前缀不再含 Workloom（测试断言）。
2. adapter-pi：title 参数被接受且不报错、不影响派发（测试断言 schema 含 title）。
3. 参数描述与 snippet 更新；workflow.md 契约升 version 4。
4. 验证全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core 与 adapter-dsh 的 `node --test`、adapter-pi 的 `bun test`。

## Notes

- DSH 子会话无 LLM 自动起名机制（dsh-session-title 只对顶层会话自动生成），语义标题由派发主会话（模型）命名是最可靠路径。
- title 参数不含前缀（前缀由 executor 组装），主会话只写语义部分。
- test-first 缝：adapter-dsh 的 title 组装与 schema、adapter-pi 的 schema 接受。
