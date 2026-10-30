# 存量任务迁移技能：design/implement 按新标准迁移为 plan.md

## Goal

给消费项目提供存量任务的计划迁移通道：新增独立迁移技能 workloom-migrate-plan，把在途任务（planning / in_progress）目录里的旧制品 design.md + implement.md 迁移为符合新标准的 plan.md，prd.md 同步重写为 R/AC 编号溯源格式。转换深度为“迁移即重写”——以旧文档为输入、实地读当前代码核对锚点，按 plan-authoring reference 的规定式标准重写步骤，迁移后删除原文件并留文档头注记。补齐 plan.md 干净切换对消费项目的最后一块配套。

## Requirements

已定（容器级讨论与 D 对齐轮，用户逐项确认）。本节按 R/AC 编号溯源格式编排（继承 C 交付，吃自己狗粮惯例）：

R1. 机制形态：独立迁移技能 workloom-migrate-plan，可手动调用；workloom-continue 的路由判定在「with prd.md but no plan.md」行之前插入 legacy 制品分支（发现 design.md/implement.md 且无 plan.md → 指向迁移技能，防止旧任务被误路由到 1.4）。技能自带扫描模式：列出项目内 planning/in_progress 任务中带旧制品的清单。归档任务任何情况下不扫、不迁。
R2. 转换深度：迁移即重写——以旧 design/implement 为输入，实地读当前代码核对每个锚点（文件、符号、片段），按 plan-authoring reference 重写 `## Steps`（含 Covers 标注，C 已交付）；`## Design decisions` 按两部分结构整理旧 design 内容。in_progress 任务全量重写：已完成步骤标注执行凭据（提交号/日期 + 验证状态），剩余步骤按当前代码重核锚点。
R3. prd.md 同属迁移范围：按编号溯源格式重写（Requirements 逐条 R 编号且可判定，Acceptance Criteria 逐条 AC 编号且每条补验证方法，Alignment Decisions 与 open-nodes 标记结构保留）。重写是格式升级 + 验证方法补全，不得改变原需求语义（逐条对应，补验证方法依据原文推导、必要时读代码核实）。派生机制要求：prd.md 重写使已 confirm 任务的对齐凭据 stale，迁移流程必须包含 stale 重入路径（聚焦变化区域与用户重新确认 → action=review + action=confirm 固定新 hash → 已启动任务按既有 stale 拦截规则处理后续派发）。
R4. 迁移节奏：逐任务节拍——扫描清单 → 每个任务依次〔重写 plan + 重写 prd → 向用户展示重写结果与语义对应摘要 → 凭据重确认 → 删原件〕→ 下一个；大计划允许派 research 执行器辅助核锚点（只读调研）。
R5. 原文件处置与注记：迁移完成（plan.md 与 prd.md 写就并经用户确认）后删除 design.md 与 implement.md；plan.md 与 prd.md 文档头各加一行迁移注记（日期 + 来源文件 + 重写依据的标准）。
R6. 执行主体与波及面：迁移由主会话执行（计划写作权在主会话），不新增执行器类型。波及面 = assets 新技能目录 + continue 指针句；adapter-dsh 的 skills.ts（SKILL_ASSETS 8→9、注释去硬编码计数改为「清单为单一来源」口径、registerSkills 重复 JSDoc 块合并去重）与 plugin.ts 计数注释同口径处理、skills.test.js（清单契约 9 名单 + 新技能资产可解析断言 + continue 指针句固定）；adapter-pi 的 sync-skills.mjs（SKILL_SOURCES 8→9 + 注释去计数）与 skills.test.ts（产物清单 9 目录）；相关 dist。

## Acceptance Criteria

AC1. 技能资产与双端注册：workloom-migrate-plan/SKILL.md 新建（frontmatter 可解析；正文含扫描模式、迁移五步流程、in_progress 执行状态标注规则、逐任务节拍与 research 辅助、归档不扫边界五要点）；dsh SKILL_ASSETS 第 9 项 + 注释去硬编码计数 + 清单契约测试 9 名单 + 新技能资产可解析断言；pi SKILL_SOURCES 第 9 项 + 注释去计数 + 产物清单测试 9 目录。（覆盖 R1、R6）
　验证：`cd packages/adapter-dsh && pnpm run test` 全绿；`cd packages/adapter-pi && pnpm run build && bun test test/skills.test.ts` 全绿；`ls packages/adapter-pi/skills/` 含 workloom-migrate-plan。

AC2. continue legacy 分支：路由表在「with prd.md but no plan.md」行之前插入旧制品分支指向迁移技能，skills.test.js 固定该指针句。（覆盖 R1）
　验证：`grep -c "workloom-migrate-plan" packages/assets/skills/workloom-continue/SKILL.md` 输出 ≥ 1；adapter-dsh 测试全绿。

AC3. 技能文档承载完整迁移语义：五步流程（读旧文档 → 重写 prd → 用户确认 + 凭据重确认 → 重写 plan → 用户确认 + 删原件 + 注记）、in_progress 全量重写与执行标注规则、prd 语义保真要求（逐条对应 + 文档头注记）、research 辅助条款、归档不扫边界。（覆盖 R2、R3、R4、R5）
　验证：1.4 审阅时按本清单逐项核对技能文档；AC4 演练覆盖运行时行为。

AC4. 端到端演练：对构造的存量样例任务（临时目录，含旧格式 design.md/implement.md/prd.md 与已确认凭据状态）完成一次迁移全流程：plan.md 符合 Authoring bar 且含执行标注、prd.md 为 R/AC 格式且语义逐条对应并带文档头注记、凭据重确认走通（新 hash）、原件删除、扫描清单正确（归档任务不在内）。（覆盖 R1–R5）
　验证：演练在临时目录进行不入库，实现报告含产物逐项对照，check 阶段复跑取证。

AC5. 全链验证绿与部署：pnpm lint、pnpm -r typecheck、pnpm -r build、四包全量测试通过；相关 dist 同 commit 重建；push 后 profile repin；实例重启经用户授权。（覆盖 R6 交付面）
　验证：各命令 exit 0；core/adapter-dsh/adapter-pi/assets 全量测试 0 失败。

AC6. 本任务计划文档以 plan.md 单文档规定式形态写作（Covers/Target/Edit/Verify 四要素）。（示范义务，由计划文档自身承载，无对应实现步骤）
　验证：1.4 审阅时由用户按 plan-authoring reference 逐项核对。

Test-first 接缝（已确认，红绿推进，测试只放在下列公开边界）：

- 接缝① dsh 注册面：SKILL_ASSETS 含新技能、skills.test.js 清单契约 9 名单、新技能 frontmatter 可解析断言。
- 接缝② pi 同步面：SKILL_SOURCES 含新技能、skills.test.ts 产物清单 9 目录。
- 接缝③ assets 文本面：workloom-migrate-plan SKILL.md 关键句与 continue legacy 指针句，按资产可解析测试模式固定。

## Notes

- 依赖：A 已交付 plan-authoring reference 与 plan.md 形态；C 已交付 Covers 语法与 R/AC 格式（均在 main 且已部署）。执行顺序 A → C → D → B；容器任务 tasks/10-29-plan-system-upgrade。
- D 排在 B 前的原因：两者都动 assets 文本，先小后大避免文案冲突。
- 本仓库自身的归档任务（40 个含旧制品）不迁移，属历史记录；端到端演练用临时构造的样例任务，不动真实归档。
- skills.ts 的 registerSkills 存在重复 JSDoc 块（既有瑕疵，两段同文案），本任务更新计数时顺带合并去重，避免 check 阶段按“非本次引入问题”报 P1。

## Alignment Decisions

已定（容器级讨论，用户答复“2B 3B 其他按推荐”）：

1. 机制形态：独立迁移技能 + continue 指针句 + 技能自带扫描。否决：continue 惰性分支 + doctor 提示（用户选独立技能，保留手动批量入口）、doctor fix 机械迁移（用户感知弱，与迁移即重写深度不匹配）。
2. 转换深度：迁移即重写（实地核锚点、按规定式标准重写）。否决：无损结构合并（旧宽松标准的步骤直接搬进 plan.md 会把模糊带进新体系）。
3. 原文件处置：迁移后删除。否决：移入 legacy/ 子目录（同一内容存两份必然漂移）。
4. 顺序与依赖：A → C → D → B；D 对齐在 C 归档后开始。

已定（C 归档后事实核查，主会话）：

5. 波及面事实核查完成：dsh skills.ts 的 SKILL_ASSETS 8 项 + 三处「8 个 SKILL.md」注释（含重复 JSDoc 块两段）+ skills.test.js 清单契约 deepEqual 8 名单与资产可解析测试模式；pi sync-skills.mjs 的 SKILL_SOURCES 8 项 + 注释 + skills.test.ts 产物清单 deepEqual 8 目录（全文 41 行三个测试）；continue 路由表「with prd.md but no plan.md」行需前置 legacy 分支；doctor 不枚举技能（仅 overlay 旧引用检查 R19），零波及。
6. UI 适用性：不适用（纯文本与清单改动）。

已定（D 对齐轮，用户答复“全按推荐”）：

7. in_progress 迁移语义：全量重写 + 已执行状态标注（提交号/日期 + 验证状态），剩余步骤按当前代码重核锚点。否决：只重写剩余工作（Covers→AC 审计链断裂）。
8. 技能命名：workloom-migrate-plan。否决：workloom-plan-migration（名词式偏离家族动词风格）、workloom-migrate（对象不明）。
9. 迁移节奏：逐任务节拍（重写 → 用户确认 → 凭据重确认 → 删原件 → 下一个）；大计划允许派 research 辅助核锚点。否决：批量节拍（单任务否决拖累整批返工）。
10. 迁移注记：plan.md 与 prd.md 文档头各一行迁移来源注记。否决：不加注记（git 不跟踪 .workloom 的项目丢线索）。
11. test-first：是；三接缝（dsh 注册面、pi 同步面、assets 文本面）。否决：只锁①②（技能文本与 continue 指针漂移无保护）、常规实现。
12. Authoring：是，plan.md 单文档（实例已重启，新契约生效）；prd 本体按 R/AC 格式自排（沿 C 惯例）。否决：不 authoring（清单契约与计数注释多处，同源链最易漏同步）。
13. 注释计数策略（主会话设计决定，1.4 审阅包中明示）：skills.ts / plugin.ts / sync-skills.mjs 的注释去掉硬编码计数，改为「清单（SKILL_ASSETS / SKILL_SOURCES）为计数单一来源」表述，并合并 registerSkills 的重复 JSDoc 块——从结构上杜绝本任务正在修的“8 个”字样多处漂移复发（编码原则：单一来源、禁重复）。否决：把计数改成 9（下次加技能再漂移一遍）。

开放节点：无。

<!-- workloom:open-nodes=none -->
