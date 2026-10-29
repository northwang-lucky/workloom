# 计划文档体系升级：plan.md 合并 + 规定式写作标准 + review 执行器

## Goal

系统性升级 workloom 的计划文档链路，根治“主会话写的计划文档过于模糊、子会话自由发挥空间过大”的问题：design/implement 合并为 plan.md 并落地完全规定式写作标准（子任务 A）、prd 增加 R/AC 编号溯源格式规范（子任务 C）、新增开工前 review 执行器（子任务 B）。升级后 prd → plan → review → implement → check 整条链编号可核对、锚点可执行。

## Requirements

1. 四个子任务，执行顺序 A → C → D → B：
   - A tasks/10-29-plan-md-prescriptive：合并 design/implement 为 plan.md，完全规定式写作标准（写作侧 + 执行侧）。**已归档**（工作提交 5c0ee38，check 通过记录在案）。
   - C tasks/10-29-prd-traceability：prd 的 R/AC 编号格式规范，plan 步骤标注覆盖的 AC（Covers 语法），review 联动文本。
   - D tasks/10-29-plan-migration-skill：独立迁移技能，消费项目存量任务的 design/implement 迁移即重写为 plan.md，prd.md 同步重写为 R/AC 编号格式（含对齐凭据 stale 重确认路径），迁移后删原件，continue 留指针，技能自带批量扫描。
   - B tasks/10-29-review-executor：review 执行器类型，四维度 21 项开工前审查，P0/P1/P2 处置，复审循环上限三轮（同一子会话续接）。D 排在 B 前：两者都动 assets 文本，先小后大避免文案冲突。
2. 容器任务自身不写实现代码：只做整体验收（三个子任务交付文本之间的链路一致性、交叉引用、逐字固定文案同源性），最后归档。
3. 每个子任务各自跑完整生命周期（对齐 → 调研（可选）→ 上下文 → 审阅确认 → 实现 → 检查 → 提交 → 归档），容器的对齐与确认在全部子任务归档前收口。

## Acceptance Criteria

1. 四个子任务全部归档，各有 workloom_task_check 通过记录。
2. 链路一致性抽查：plan.md 命名在 workflow 文本、alignment 技能、执行器注入文本、pi 角色说明中一致；R/AC 溯源要求在 prd 骨架指引、plan-authoring reference、review 纪律段中一致；除归档历史记录外，仓库无 “design.md/implement.md” 制品引用残留。
3. 生产 profile 已 repin 到包含全部三个子任务的提交，经用户授权重启后生效：新体系下的第一个任务全程按新规范走通（plan.md 写作 → review 派发 → 编号核对 → 规定式执行）。
4. 全链验证命令全绿（pnpm lint、pnpm -r typecheck、pnpm -r build、各包测试）。

## Notes

- 跨切面决策的完整记录在各子任务 prd.md 的 Alignment Decisions；容器只记索引，不复述细则。
- 部署纪律：core 与相关包的 dist 同 commit 重建，push 后 profile repin，实例重启经用户授权（repo/deployment spec）。

## Alignment Decisions

已定（容器拆分与跨切面决策均经用户逐项确认）：

1. 拆分方案：容器 + 子任务 A、C、D、B，执行顺序 A → C → D → B（用户确认候选清单与拆分本身；D 为容器交付后经用户提问“其他项目的存量任务怎么办”补充确认）。
2. 跨切面决策索引：plan.md 合并与改名、完全规定式标准、双向约束、不加机器门禁（A）；R/AC 编号溯源、AC 带验证方法、plan 步骤 Covers 标注、review 顺带审 prd 格式（C）；独立迁移技能、迁移即重写（按新标准重写步骤并实地核锚点）、prd.md 同属迁移范围（按 C 格式重写 + 凭据 stale 重确认路径，用户 2026-10-30 补充）、迁移后删除原文件、continue 只留指针句、技能自带批量扫描（D）；review 四维 21 项、P0/P1/P2 计划口径、复审循环上限三轮同子会话续接、复用 implement.jsonl、test-first 五接缝（B）。

开放节点：

1. 暂无独立开放节点；容器的最终验收细目在全部子任务归档前计算并确认。

<!-- workloom:open-nodes=pending -->
