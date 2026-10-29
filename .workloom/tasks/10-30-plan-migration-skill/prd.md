# 存量任务迁移技能：design/implement 按新标准迁移为 plan.md

## Goal

给消费项目提供存量任务的计划迁移通道：新增独立迁移技能（暂定名 workloom-migrate-plan），把在途任务（planning / in_progress）目录里的旧制品 design.md + implement.md 迁移为符合新标准的 plan.md。转换深度为“迁移即重写”——以旧文档为输入、实地读当前代码核对锚点，按 plan-authoring reference 的规定式标准重写步骤，迁移后删除原文件。补齐 plan.md 干净切换对消费项目的最后一块配套。

## Requirements

已定（容器级讨论，用户逐项确认）：

1. 机制形态：独立迁移技能，可手动调用；workloom-continue 的路由判定只留一句指针（发现旧制品且无 plan.md → 指向迁移技能）。技能自带扫描模式：列出项目内 planning/in_progress 任务中带 design.md/implement.md 的清单，支持批量处理。归档任务任何情况下不扫、不迁。
2. 转换深度：迁移即重写。以旧 design/implement 为输入，实地读当前代码核对每个锚点（文件、符号、片段），按 plan-authoring reference 重写 `## Steps`（含 Covers 标注，依赖子任务 C 交付）；`## Design decisions` 按两部分结构整理旧 design 内容。
3. 原文件处置：迁移完成（plan.md 写就并经用户确认）后删除 design.md 与 implement.md；内容以重写形态保存在 plan.md，git 跟踪 .workloom 的项目历史可查。
4. 执行主体：迁移由主会话执行（计划写作权在主会话），技能是主会话的指引文档，不新增执行器类型。
5. 波及面（预计，事实核查为对齐开放节点）：assets 新技能目录 + workloom-continue 指针句、adapter-dsh src/skills.ts 的 SKILL_ASSETS 注册与注释计数、adapter-pi scripts/sync-skills.mjs 的 SKILL_SOURCES 清单与注释计数、两 adapter 相关测试、dist。
6. prd.md 同属迁移范围（用户 2026-10-30 补充确认）：存量任务的 prd.md 按子任务 C 的编号溯源格式重写——Requirements 逐条 R 编号且可判定，Acceptance Criteria 逐条 AC 编号且每条补验证方法，Alignment Decisions 与 open-nodes 标记结构保留。重写是格式升级 + 验证方法补全，不得改变原需求语义（补验证方法需依据原文推导，必要时读代码核实）。派生机制要求：prd.md 重写会使已 confirm 任务的对齐凭据 stale，迁移流程必须包含 stale 重入路径（聚焦变化区域与用户重新确认 → action=confirm 固定新 hash → 已启动任务按既有 stale 拦截规则处理后续派发）。

## Acceptance Criteria

（草案；test-first 接缝与 authoring 问题在本任务对齐轮确认）

1. 新技能注册后在两个 runtime 均可被发现和加载（dsh 技能注册面、pi skills 同步产物），技能文档含：扫描模式、单任务迁移流程（读旧文档 → 核当前代码 → 按规定式标准重写 → 用户确认 → 删原件）、in_progress 任务的执行状态标注规则。
2. workloom-continue 路由判定含旧制品检测指针句，contract/技能文本固定测试同步。
3. 对本仓库构造的存量样例任务（fixture 或临时任务目录）完成一次端到端迁移演练：产出的 plan.md 符合 Authoring bar，prd.md 重写为 R/AC 编号格式且语义与原文件逐条对应，已确认任务的凭据 stale 重确认路径走通，原文件删除，扫描模式清单正确（归档任务不出现在清单）。
4. 全链验证绿（pnpm lint、pnpm -r typecheck、pnpm -r build、各包测试），相关包 dist 同 commit 重建，push 后 profile repin，实例重启经用户授权。

## Notes

- 依赖：子任务 A 已交付 plan-authoring reference（在 main）；子任务 C 将交付 Covers 标注语法——本任务的对齐与 authoring 在 C 归档后进行。执行顺序 A → C → D → B；容器任务 tasks/10-29-plan-system-upgrade。
- D 排在 B 前的原因：两者都动 assets 文本，先小后大避免文案冲突。
- 本仓库自身的归档任务（40 个含旧制品）不迁移，属历史记录。

## Alignment Decisions

已定（容器级讨论，用户答复“2B 3B 其他按推荐”）：

1. 机制形态：独立迁移技能 + continue 指针句 + 技能自带扫描。否决：continue 惰性分支 + doctor 提示（用户选独立技能，保留手动批量入口）、doctor fix 机械迁移（用户感知弱，且与迁移即重写的深度不匹配）。
2. 转换深度：迁移即重写（实地核锚点、按规定式标准重写）。否决：无损结构合并（用户选择质量优先，旧宽松标准的步骤直接搬进 plan.md 会把模糊带进新体系）。
3. 原文件处置：迁移后删除。否决：移入 legacy/ 子目录（同一内容存两份必然漂移，与建 plan.md 的初衷相悖）。
4. 顺序与依赖：A → C → D → B；D 对齐在 C 归档后开始（前置条件是 C 交付的 Covers 语法与 A 交付的 reference 终态）。

开放节点（待本任务轮次的对齐轮，前置条件：C 已归档）：

1. in_progress 任务的迁移语义：旧计划可能已部分执行——重写覆盖全部步骤并标注已执行状态，还是只重写剩余工作？锚点核对以当前代码为准的处理细则。
2. 技能命名定稿（workloom-migrate-plan 或其他）。
3. 批量模式交互细节：迁移即重写下每任务成本高，扫描清单是否逐任务确认；大计划重写是否允许派 research 辅助核锚点。
4. 波及面事实核查：两 adapter 注册清单的计数文案与测试固定现状（“8 个 skill”字样）、doctor 技能清单是否受影响。
5. test-first 适用性与接缝清单。
6. UI 适用性（预判不适用，对齐轮正式确认）。
7. Authoring 问题（最终轮固定问题）。
8. prd 重写与对齐凭据的交互细节：批量迁移时逐任务触发 stale 重确认的交互形态；重写后 prd 的用户确认时机（迁移中逐任务确认，还是清单式一次确认）。
9. prd 重写的语义保真核对方式：逐条 R/AC 与原 prd 内容的对应关系是否需要留迁移注记（如文档头“由原 prd 迁移”标注）。

<!-- workloom:open-nodes=pending -->
