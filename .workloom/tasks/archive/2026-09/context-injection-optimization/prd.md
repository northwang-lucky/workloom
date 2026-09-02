# 上下文注入优化

## Goal

压缩执行器首次派发注入与主会话 breadcrumb 的基线体积：注入每步都背着，会话内累积虽是 200k 主因，基线仍值得压（实测 17–33KB，预算 128KB）。验证基线：用任务 A 交付的 receipt 注入统计做同任务同 kind 优化前后对照。

## Requirements

1. **五项优化全做（用户确认）**，单任务不拆分，切片顺序 ⑤→①→②→③→④：
   - ① jsonl 清单基线化：派发注入只给"路径 + reason + 先读后判"指针行，不再内联文件全文（改造点 `materializeJsonlEntries`）。implement/check **两角色统一纯指针，本轮直接撤预取**（用户确认，激进项，由 ⑤ 兜底）。
   - ② artifacts 提取：prd 的 Requirements/Acceptance Criteria 全文保留；design/implement **只注入 H2 目录 + 指针**，放弃"决议关键段"启发式，决议内容由执行器按强制先读协议自取。
   - ③ 主会话注入**先测后瘦**：先量化状态块各部分字节数（大头 norms 约 2.5KB 保持全文不动），只压确有收益的部分，不盲改。
   - ④ 交付时过滤**收窄为仅 LSP 段按工具可用性过滤**（用户确认：仓库实证不存在 per-runtime 注入文本，"平台标签块"无对象可滤，不造新块；偏差见 Notes）；角色 norms 维持现有深度替换机制不动。
   - ⑤ 可靠性护栏：强制加载协议写进纪律段（契约版本号递增，措辞实现时定稿、check 逐字核对）+ **单一注入标记回声机制**：每次派发生成唯一 marker token 随指针清单注入，纪律句要求执行器在报告首行回显（证明注入到达且协议被读）；"实读文件"由既有"报告引用实读文件"纪律保证（子代理实读不可观测为已知能力边界）。
2. **注入预算 128KB 上限不动**（兜底，非目标）。
3. **体积对照记录在本任务 prd/Notes**；不设硬性体积指标，验收报告实测前后数字。
4. **脱敏纪律**：仓库文档不记参考来源名（延续调研文档口径）。

## Acceptance Criteria

- test-first 交付，六条接缝（用户确认全收）：
  - S1 jsonl 纯指针：两角色注入输出只含"路径 + reason + 先读后判"行，无文件全文进入注入。
  - S2 artifacts 提取：prd Requirements/Acceptance 全文保留、design/implement 只进 H2 目录 + 指针（逐字断言）。
  - S3 主会话注入瘦身：含"先测"量化报告；被压部分有前后字节对照；norms 段逐字未动（防瘦身误伤纪律）。
  - S4 过滤：无 LSP 工具时注入不含 LSP 段（平台过滤已收窄，见 Notes 偏差登记）。
  - S5 护栏：纪律段含强制加载协议句（逐字断言）；注入含唯一 marker token；契约要求报告首行回显（执行器侧断言）。
  - S6 体积口径：断言统计口径存在且可对比；真实前后数字作为验收报告而非测试断言。
- 优化前后体积对照：同任务同 kind，用 receipt 注入统计报告实测数字。
- 回归：三包测试全绿 + lint + typecheck + build。

## Notes

- 互补已交付：任务 A 批处理纪律 + 注入统计（对照工具）；任务 B 后台派发 + 续接增量（续接侧冗余已砍，本线针对首次派发与主会话侧）。
- 调研：`docs/research/context-injection-optimization.md`（脱敏，勿在仓库文档提及参考来源名）。
- 风险登记：implement 纯指针无预取，依赖 ⑤ marker 回声与纪律句兜底，check 阶段需重点验证行为闭环。
- 切片顺序依据：⑤纪律句先行为①提供安全网；①②同模块（executor-context.js）；③④同注入面。
- 偏差登记（2026-09-02，implement 执行器实证发现，用户决断收窄）：④ 原含"平台标签块按当前平台过滤"，实证三包无 per-runtime 注入文本，对象不存在；收窄为仅 LSP 过滤，不为过滤造新块（与压注入目标一致）。
- ③ 主会话注入先测后瘦（2026-09-02 实测，根目录快照，字节为 UTF-8 计数）：
  - developer 行 26；git 行 35；Workflow 概览行 189；Guidelines 段（标签 + 8 条 spec index 路径）391；norms 段 3008（占快照 72%，纪律载体）；Local directives 段 489（用户 .workloom/prompts.local/main.md，非本线可压）。
  - 快照总 4184 字节；状态块（developer+git+workflow+guidelines）仅 641，活跃任务行只含标题/状态/路径、无长文本字段。
  - 结论：norms 为唯一大头且按 grilling 决断保持全文不动；状态块无「确有收益」的可压长文本字段 → ③ 交付测量报告 + 不动结论，不盲改（防瘦身误伤纪律由 S3 norms 逐字未动断言覆盖）。
- 体积对照（S6 口径，同任务同 kind，implement 派发，receipt 注入统计）：
  - 优化前（2026-09-02）：14.9KB，7 inlined，0 truncated，0 indexed。
  - 优化后（2026-09-02，同夹具同口径补测）：6.0KB，3 inlined，4 pointed，0 truncated，0 indexed（receipt 同行追加 `, 4 pointed`）。
  - 结论：KB 降约 60%（14.9→6.0）；inlined 7→3（仅剩 prd/design/implement 三个 artifact 块，jsonl 4 条 spec 引用转纯指针）；指针行计入 pointed 不计 inlined（口径变化见 ① 设计）。未设硬性体积指标，数字为验收报告实测。
