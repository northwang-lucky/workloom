# 业界 PRD 与需求文档格式调研

调研日期：2026-11-06。目的：为 workloom 的 PRD 模板升级提供事实依据，不直接照搬面向大型产品团队的表单。

## 1. Atlassian：目标、假设、用户故事、开放问题与非目标

来源：[Atlassian Confluence PRD 模板](https://www.atlassian.com/software/confluence/templates/product-requirements) 与 [Atlassian PRD 指南](https://www.atlassian.com/agile/product-management/requirements)。

模板和指南共同强调：

- 先写目标与成功指标，说明为什么值得做。
- 记录技术、业务和用户行为假设。
- 用用户故事或具体场景说明谁获得什么价值。
- 集中链接设计、调研和其他支撑材料。
- 跟踪待研究或待决定的问题，以及答案和日期。
- 明确写出不做什么，防止范围不断扩大。
- 文档保持简洁，并随反馈持续更新。

对 workloom 的启示：当前模板缺少背景、非目标、假设、约束、参考资料和开放问题的明确位置。Alignment Decisions 虽能记录决定，但不能完全代替这些内容。

## 2. Productboard：问题、用户、约束、验收和依赖

来源：[Productboard PRD 指南](https://www.productboard.com/blog/product-requirements-document-guide) 与 [Productboard PRD 词条](https://www.productboard.com/glossary/product-requirements-document)。

常见组成包括：

- 问题陈述与背景。
- 目标用户与用户洞察。
- 功能需求、非功能需求与约束。
- 验收标准与成功度量。
- 开放问题、依赖和发布注意事项。
- 假设、风险与范围项。

对 workloom 的启示：需求不能只写功能动作，还应记录非功能约束、依赖、风险与可观察结果。发布注意事项多数由 workloom 的部署规范和提交流程承担，不必复制到每份 PRD。

## 3. IEEE 29148：单条质量和追踪关系

来源：[IEEE Software Requirements](https://technav.ieee.org/topic/software-requirements)。

IEEE 对需求规范的说明强调：

- 内容完整且一致。
- 表述准确、没有歧义。
- 需求可验证，并对应至少一个验证用例。
- 功能需求描述系统要做什么，非功能需求描述性能、可靠性、安全性等约束。
- 需求与上层目标、下游设计和验证之间建立追踪关系。

对 workloom 的启示：保留 R/AC 编号，继续要求每条 R 单一、可判定，每条 AC 带验证方法并指向 R。新增格式不应削弱这条追踪链。

## 4. 用户故事与验收标准

来源：[Atlassian User Stories](https://www.atlassian.com/agile/project-management/user-stories)。

常见用户故事格式是“As a [user], I want [goal], so that [reason]”，并附验收标准。其价值在于明确用户视角和成功结果，而不是要求所有技术任务都套用同一句话。

对 workloom 的启示：用户故事适用于存在明确用户或调用方的任务。纯内部重构可以使用消费方场景或行为变化描述，不强制套用英文句式。

## 5. 建议融合结构

建议 workloom PRD 使用以下层次：

1. Context：问题、背景、现状与目标使用者或消费方。
2. Goal：目标、价值与成功信号；没有业务指标时使用可观察结果。
3. Scope：范围内事项与明确非目标。
4. Assumptions, Constraints and Dependencies：假设、环境、非功能要求与外部依赖。
5. Requirements：R1、R2 等单一且可判定的需求。
6. Acceptance Criteria：AC1、AC2 等验收项，包含验证方法和 R 引用。
7. Edge Cases and Failure Paths：边界、异常与不允许出现的行为。
8. Risks and Open Questions：风险、未决事项及其处理状态。
9. Alignment Decisions：关键选择、备选方案和收敛摘要；开放问题正文写入 Risks and Open Questions，不使用 HTML 状态标记。
10. References：调研、源码、设计和其他支撑链接。
11. Notes：不适合放入上述小节的补充信息。

`UI Design` 继续作为适用时的专门小节。轻量任务仍使用现有简化流程，不强制完整模板。

## 6. 不建议照搬的内容

- 不复制负责人、目标发布日期和团队状态字段；这些信息已由任务记录或项目管理工具承担。
- 不要求每份技术任务都有商业指标或用户画像。
- 不把 PRD 写成完整技术实现；实现细节仍由 PLAN 的伪代码协议承担。
- 不为了格式完整而制造风险、依赖或用户故事；无内容时使用明确的 `none` 或 `not applicable`。

## 7. workloom 的特定问题：按对齐过程记账，而不是组织需求

用户补充的真实问题是：LLM 常把 PRD 写成对齐过程的问答记录。每条规则按回答顺序罗列，文档缺少统一的问题陈述和叙述主线。

因此，仅增加标题不足以解决质量问题。新格式还需要：

- 主文按问题、目标、范围、需求和验收组织，不按问答时间组织。
- 每个小节先说明内容的用途和相互关系，再列具体条目。
- 需求按能力或行为分组，不把一个问答机械地转成一条 R。
- Alignment Decisions 只保留影响方案的关键决定，不保存 Q1/A1 式过程记录。
- 同一事实只在一个主要小节完整说明，其他位置引用，避免多份摘要互相重复。
- 评审与评测加入“连贯性、重复度、是否按问答堆叠”的负面对照，机器结构检查无法代替这项内容判断。
