# 调研并升级 workloom PRD 格式

## Context

当前 PRD 模板只提供目标、需求、验收和备注四个基本位置。它能承载最少的任务信息，却没有告诉作者如何交代问题背景、范围边界和约束条件。

更实际的问题出在写作方式。LLM 容易把对齐过程中的问答逐条搬进文档，使 PRD 变成按时间排列的决策清单。读者能看到很多条目，却难以理解这些条目共同解决什么问题。

## Goal

本次改造要让 PRD 成为一份可以独立阅读的需求文档。读者不需要翻阅会话记录，就能理解为什么做、做什么、不做什么，以及如何判定完成。

结构升级与写作升级必须同时发生。新模板不仅增加内容位置，还要引导作者建立清楚的因果关系：背景解释目标，目标限定范围，范围支撑需求，需求映射验收。最终效果是减少流水账式堆砌，同时保留机器可检查的 R/AC 追踪。

## Scope

### In scope

本次覆盖完整任务的 PRD 模板、结构检查、需求对齐指引、迁移指引、评测与相关测试。`UI Design` 继续作为适用时的专门内容处理。

### Non-goals

本任务不修改 PLAN 的五字段伪代码协议，也不改变已完成的 PRD/PLAN 分阶段内容确认。轻量任务继续使用简化流程，已归档任务不做迁移或改写。

## Assumptions, Constraints and Dependencies

业界模板提供内容分类，但不能直接照搬到所有技术任务。纯内部改造通常没有商业指标或终端用户画像，此时应使用消费方场景和可观察结果，而不是虚构产品数据。

文档结构保持固定。某个类别不适用时，作者写明 `none` 或 `not applicable`，并给出简短理由。这样既能保持文档一致，也能区分有意省略与意外遗漏。

外部依据来自 Atlassian、Productboard 和 IEEE 的公开资料。现有 R/AC 编号和内容确认工具是必须保留的内部约束；开放节点 HTML 标记经复核后决定移除。

## Requirements

### 文档结构与叙述

- R1：完整任务的 PRD 固定包含 Context、Goal、Scope、Assumptions, Constraints and Dependencies、Requirements、Acceptance Criteria、Edge Cases and Failure Paths、Risks and Open Questions、Alignment Decisions、References 和 Notes。
- R2：PRD 主文必须按问题、目标、范围、需求和验收的逻辑组织，不得按对齐问答的时间顺序拼接内容。
- R3：每个主要小节应先说明本部分要回答的问题，再给出条目；需求按能力或行为分组，不得把每次问答机械地转换成独立需求。
- R4：Alignment Decisions 只记录影响范围、验收、风险或外部接口的关键决定及理由，不保存 Q/A 编号、逐轮答复或重复的需求摘要。

### 需求质量与追踪

- R5：每条 R 只表达一个必要且可判定的需求，每条 AC 都包含验证方法和对应的 R 编号；目标、需求与验收之间的关系必须可从正文和编号共同识别。
- R6：PRD 不承载完整技术实现，也不以商业指标、用户画像或用户故事句式作为所有任务的强制内容。

### 工具与生命周期

- R7：结构检查必须识别新模板的必需小节、占位内容和 R/AC 追踪；不适用的小节以显式 `none` 或 `not applicable` 保留。
- R8：workflow、alignment、迁移指引、评测和相关测试必须同时采用新结构及反流水账写作规则。
- R9：完整任务创建时使用新模板；现有 planning 任务在下次确认前由主会话按新结构重写，归档任务保持不变。
- R10：移除 `<!-- workloom:open-nodes=... -->` 及其扫描、确认和启动依赖；开放问题由 `Risks and Open Questions` 承载，主会话依据实际内容判断是否具备确认条件。

## Acceptance Criteria

### 模板与叙述质量

- AC1（覆盖 R1、R6、R7、R10）：新模板包含全部固定小节及填写用途；合法文档没有 HTML 开放节点标记也能通过结构检查，缺少小节或仍含占位内容时被拒绝。验证方法是运行 core 模板与结构测试。
- AC2（覆盖 R2、R3、R4）：评审和评测包含一组对照样本：按问答堆叠且重复摘要的 PRD 被判为内容质量问题，按能力组织且主线连贯的 PRD 被接受。验证方法是运行 alignment 评测与相关资产测试。

### 追踪与工具一致性

- AC3（覆盖 R5）：新格式中的每条 AC 都能追踪到 R，并带有命令或可观察动作及预期结果；缺少关联或验证方法时结构检查给出问题。验证方法是运行 core 追踪与确认测试。
- AC4（覆盖 R7、R8）：workflow、alignment、迁移技能和双 adapter 的测试均使用新格式，且不出现要求逐轮问答入文或 PRD 编写完整实现的指引。验证方法是运行 workflow、技能与 adapter 测试。

### 生命周期边界

- AC5（覆盖 R9）：新建完整任务获得新模板，旧 planning 任务不会被自动改写，轻量任务和归档任务保持各自边界。验证方法是运行任务创建、轻量流程和归档不可变测试。

## Edge Cases and Failure Paths

内容类别不适用时，作者保留标题并写出原因，不得通过删除标题绕过结构检查。对于纯技术任务，作者使用工程消费方和运行结果描述价值，不强行生成用户故事。

旧 planning 任务可以由主会话整理结构，但不能把旧问答记录原样搬入新模板。整理后仍须满足叙述质量和 R/AC 追踪要求。

叙述连贯性无法只靠正则表达式判断。机器检查负责结构完整性，主会话复核与评测负责识别流水账、重复和断裂，两者不能互相替代。

## Risks and Open Questions

主要风险是模板变长后产生新的套话。为控制这个风险，每节只保留与当前任务有关的内容，不适用时直接写 `none`，不得为了篇幅补造信息。

另一个风险是同一事实同时出现在需求、备注和决定摘要中。写作与复核都应指定一个主要归属小节，其他位置只保留必要引用。

当前没有剩余开放问题。

## Alignment Decisions

采用完整且固定的分层结构，不适用的小节显式保留。现有 planning 任务在确认前由主会话整理，归档任务不做迁移。

在结构升级之外，本次明确加入叙述质量要求。PRD 不按问答过程记账，Alignment Decisions 也不保存逐轮问答。评审需要同时检查结构和阅读主线。

开放节点 HTML 标记一并移除。它不再参与确认或启动；主会话根据实际内容判断收敛，用户确认记录承担后续启动依据。

所有设计树节点均已覆盖，无剩余开放节点。

## References

- 调研报告与完整来源说明：`research/industry-prd-formats.md`。
- [Atlassian PRD 模板](https://www.atlassian.com/software/confluence/templates/product-requirements)。
- [Productboard PRD 指南](https://www.productboard.com/blog/product-requirements-document-guide)。
- [IEEE Software Requirements](https://technav.ieee.org/topic/software-requirements)。

## Notes

本任务不涉及前端 UI，也不采用专门的 test-first 交付要求。核心结构、资产内容和双 adapter 行为由现有测试体系保护。
