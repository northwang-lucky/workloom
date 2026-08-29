# 核心工作流新增前端 UI 设计对齐流程

## Goal

当前工作流 1.1 只对齐代码逻辑需求，模型对涉及前端页面展示的任务不会主动发起 UI 设计讨论。本任务为工作流契约新增「前端 UI 设计对齐」条件流程，使这类任务在规划阶段自动进入 UI 讨论。

## Requirements

- 1.1 新增固定问题「任务是否涉及前端 UI 展示」（英文措辞：Does this task involve frontend UI presentation?）；回答 yes（选项 A）则强制进入 UI 设计对齐子阶段。
- UI 设计对齐子阶段编号为 Phase 1.1b（位于 brainstorm 1.1a 之后、grilling 之前）；grilling 顺延为 1.1c，vendored grilling/tdd skill 注记中的 "1.1b" 同步更新为 "1.1c"。
- 新增 skill `workloom-ui-design` 承载 UI 对齐讨论轴与产出要求；DSH 与 Pi 两个 adapter 的 skill 注册/同步清单加入该 skill。
- 涉及前端展示的任务在 prd.md 增加「UI Design」小节（不进骨架 placeholder 门禁，PRD_SECTIONS 不变）；复杂任务在 design.md 出 UI 设计章节。
- UI 讨论轴默认覆盖七轴：页面/组件清单与信息架构、布局与导航、视觉风格与设计稿来源、交互细节与状态、响应式与多端适配、无障碍、可观测验收点。
- brainstorm skill 正文新增一句与 workloom-ui-design 的交接说明（skill description 不变）。
- workflow.md version 8 → 9；契约兼容测试同步 version 断言并新增 UI 固定问题措辞锁定断言。
- 测试优先：不采用（conventional implementation），无新增逻辑 seam；契约兼容测试（contract-asset.test.js）提供回归保障。

## Acceptance Criteria

- workflow.md version 为 9，parseContract 解析成功、无 warnings，步骤 id 列表仍为 1.0/1.1/1.2/1.3/1.4/2.1/2.2/2.3/3.1。
- 1.1 正文包含 UI 固定问题（含选项 A/B 措辞）与条件触发的 1.1b UI 设计对齐流程描述；短语 "Does this task involve frontend UI presentation?" 出现在 1.1 正文。
- assets/skills/workloom-ui-design/SKILL.md 存在，front-matter 含 name/description/whenToUse（name/description 必填），正文覆盖七轴、产物要求（prd.md「UI Design」小节 + design.md 章节）、与 grilling 的收口关系。
- adapter-dsh/src/skills.ts 的 SKILL_ASSETS 与 adapter-pi/scripts/sync-skills.mjs 的 SKILL_SOURCES 均含 workloom-ui-design；DSH 注册 comment 中 skill 数量说明随之更新。
- vendored grilling/tdd skill 注记中 "1.1b" 均已改为 "1.1c"（grilling 注记一句话 + tdd 注记两处）。
- brainstorm SKILL.md 含 UI 轴交接说明。
- contract-asset.test.js 锁定 version=9 与 UI 固定问题措辞；`pnpm -r build`、`pnpm lint`、`pnpm -r typecheck`、assets 契约解析测试全部通过。
- 发布动作（build 产物同步到 DSH profile、dshweb 重启）不在本任务范围内，任务完成后给用户发布提醒。

## Notes

- 已确认决策：触发方式 = 固定问题强制（非模型自觉）；产物落点 = prd.md 小节 + design.md 章节，不新增 ui-design.md 独立文档；维度清单 = 七轴；test-first = 否；发布动作不纳入任务；brainstorm 加交接句。
- 契约解析器不感知步骤内部编号，新增子阶段只影响契约正文与 skill 文档；prd 骨架 PRD_SECTIONS 保持不变（UI 小节按需添加、不参与 placeholder 门禁）。
