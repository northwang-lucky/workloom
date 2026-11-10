# 迁移 skill

## Context

SOP 需求点 6：提供从 workloom 迁移到 workloom-sop 的 skill，把原项目 .workloom 目录下的结构迁移成新结构。重构至今 `.workloom` 已改了两代：子任务一定版布局（tasks 含 subtasks 层约定、撤 workspace 与 .developer），子任务三落状态机与确认凭据字段，子任务四落配置 `subagent_profiles` 内层 `subagents→roles` 与角色键新五值——生产全局配置不按新键改则加载即拒，这是生产 pin 切换仅剩的两项硬前置之一。旧 `.trellis → .workloom` 迁移器 migrate.js 已在子任务二删除，但 trellis 残留链（purge 校验、locate 旧检测、surface 文案）仍在，去留裁定路由到本子任务。现实的首个用户是本机全局配置（pin 切换前由用户手跑迁移），其次是有旧结构 .workloom 的项目仓库。

## Goal

产出 workloom-migrate-to-sop skill：能把旧结构 .workloom 项目原地迁到新结构（任务目录、文档格式、配置字段三块），配置映射产出可被新代码无 WARNING 加载；trellis 残留链清零。可观察：skill 目录与脚本就位且经 manifest 发现；夹具端到端演练通过；trellis/purge 全仓零生产引用；全量验证绿。

## Scope

包含：

1. 新 skill `workloom-migrate-to-sop` 落位 packages/core/resources/skills/workloom-migrate-to-sop/：SKILL.md 迁移总规程（前置检查、三块迁移步骤、落账、失败即停可重跑、完成检查单、dry-run 预演说明）加 `scripts/migrate-config.mjs` 配置映射脚本。
2. 配置字段映射机械执行：`subagent_profiles` 条目内层 `subagents→roles`、角色键旧五值→新五值；值域经 core 的 executor-roles 单源解析，脚本不自造映射表；缺角色键条目保持缺键；非法值 fail loud 带定位。
3. trellis 残留链删除：command-ops.ts 的 purge 校验、locate 的旧 .trellis 检测、surface.ts 的 PURGE_FLAG 常量与 init 描述文案、init.test.ts 相关用例同步删改。
4. skill evals 夹具：旧结构 .workloom 夹具端到端演练（脚本真实执行、规程部分以检查单断言），HOME+TMPDIR 隔离。
5. dist 同 commit 纪律：skill 资源进 core resources，随包重建发布。

不包含（non-goals）：

1. workloom-migrate-plan 的删除执行：按容器 skill 去留决策它已判删除，执行归子任务七；本子任务不复活其职责、不做共存边界声明。
2. 状态机、确认行为或工具面变化：无。
3. 生产 pin 切换与本机全局配置的实迁：切换归容器决定 10，全局配置迁移由用户在切换前用本 skill 自行执行，本子任务只提供工具不代跑。
4. workflow.md 与既有 skill 文档改写：归子任务七。
5. UI 设计不适用：本任务无前端呈现面。
6. test-first 不适用：skill 产物以夹具探针与检查单验证，无红绿循环价值。

## Assumptions, Constraints and Dependencies

1. trellis 链删除后不存在 .trellis 用户：评估基线明示新体系不再有 .trellis 用户；事故记录支持删除防复发。
2. 迁移目标形态以新代码为权威：阶段/模式值域、角色值域、配置字段形状以 core 现行实现为准，脚本经 core 包引用值域单源。
3. 新脚本遵循仓库工程约束：Node v24 TS 直跑、可擦除语法、HOME+TMPDIR 测试隔离。
4. skill 面向的使用者是主会话（或用户手工执行），产出物不自动触发任何迁移动作。
5. 硬约束（用户 2026-11-10 拍板）：本子任务彻底完成前，禁止修改用户全局配置 ~/.workloom/config.json——迁移演练、脚本调试、evals、CASE 探针全部只在隔离夹具（重定向 HOME 的临时目录）中执行，不得对真实全局配置跑 migrate-config.mjs 或任何写操作；全局配置的实迁由用户在子任务完成、验收之后自行执行。
6. 外部依赖：无。

## Requirements

- R1: workloom-migrate-to-sop skill 落位 packages/core/resources/skills/workloom-migrate-to-sop/（SKILL.md 加 scripts/migrate-config.mjs），经 resources-manifest 登记可发现，随 core resources 发布。
- R2: SKILL.md 规程覆盖三块迁移（任务目录形态、文档格式重排、配置字段映射）与统一前置：要求项目 git 工作区干净（或先提交）、配置迁移前备份原文件；规程含落账要求、失败即停可重跑、完成检查单与 dry-run 预演说明。
- R3: scripts/migrate-config.mjs 机械执行配置映射：`subagent_profiles` 各条目内层键 `subagents→roles`、角色键旧五值（research/implement/check/review/frontend）映射新五值（researcher/developer/checker/judger/frontend-developer）；映射值经 core executor-roles 值域解析，不自造字面量表；缺角色键条目保持缺键不补默认；遇见未知角色键或非法形状 fail loud 并报定位；支持 `--dry-run` 只打印变更计划不改文件。
- R4: 迁移原地执行；配置改写用临时文件加 rename 原子写；脚本幂等——已是新形态的配置识别后输出 NOOP 行跳过。
- R5: trellis 残留链删除后，packages/ 下 grep `trellis`、`purge`、`PURGE_FLAG` 零生产引用（注释性历史说明与任务簿记文档除外）；init 命令描述恢复真实行为；相关测试删改后全绿。
- R6: skill evals 夹具端到端：构造旧结构 .workloom 夹具（旧配置字段加旧目录形态），跑规程步骤与脚本，断言产物符合新结构且新代码加载无 WARNING。
- R7: dist 同 commit：skill 资源与代码改动同 commit 重建 dist。

## Acceptance Criteria

- AC1: 覆盖 R1、R2——skill 目录就位且 manifest 登记；SKILL.md 含前置检查、三块步骤、落账、重跑、检查单、dry-run 七类章节。验证方法：glob 断言目录与两文件存在；grep manifest 登记行；章节清单逐条核对。
- AC2: 覆盖 R3、R4——migrate-config.mjs 夹具三态：旧配置迁移后新代码加载无 WARNING；`--dry-run` 不改任何文件且输出计划；已是新形态的配置输出 NOOP；注入非法角色键报错含定位。验证方法：node 直跑脚本夹具（HOME+TMPDIR 隔离），逐态断言。
- AC3: 覆盖 R5——trellis/purge 生产引用零命中，init 描述与行为一致。验证方法：grep 两包 src 与 resources（排除任务簿记）零命中；init 相关 node --test 全绿。
- AC4: 覆盖 R6——evals 夹具端到端演练通过。验证方法：跑 skill eval 命令，断言夹具项目迁移产物符合新结构。
- AC5: 覆盖 R7 与全部——全量验证绿且 dist 同 commit。验证方法：pnpm -r build、pnpm -r typecheck、pnpm lint、两包 node --test 全退出码 0；git diff --name-only 核对 dist 与 src 同 commit。

## Edge Cases and Failure Paths

1. 存量配置已是新形态：脚本幂等识别，NOOP 跳过，不重复改写不留痕。
2. 迁移中途失败：配置改写原子写不产生半文件；规程要求落账，重跑从断点继续。
3. 角色键被手改成未知值（脏数据）：fail loud 列出行号与值，不改写不猜测。
4. 本机全局配置（~/.workloom/config.json）迁移时机：pin 切换前由用户手跑；skill 规程点名该场景与备份要求；生产旧 pin 仍带 migrate.js，切换前禁止在无 .workloom 目录跑任何 init/migrate 类探针（事故记录现行注意事项）。
5. workloom-migrate-plan 删除后无 legacy plan 工件迁移路径：容器内已无此类存量任务，删除安全由子任务七确认，不归本子任务。
6. 旧项目无 git 管理：规程前置检查拒绝执行，提示先初始化 git 或手动备份。

## Risks and Open Questions

none：对齐一轮六问全收敛；用户纠正一条（workloom-migrate-plan 已判删除、执行归子任务七）已记录为边界，无遗留开放节点。

## Alignment Decisions

1. 迁移范围三块全做（推荐 A，Q1）：任务目录、文档格式、配置字段；配置映射直接服务 pin 切换硬前置，目录与文档一次做齐避免追两代。
2. trellis 残留链整条删除（推荐 A，Q2）：purge 校验、locate 旧检测、surface 文案与常量同步撤；依据评估基线与事故教训。
3. 命名 workloom-migrate-to-sop（用户在 Q3 选项 A 基础上指定最终名，2026-11-10 拍板）；更正一个事实：workloom-migrate-plan 按容器 skill 去留决策已判删除（用户在该决策轮确认），执行归子任务七，当前磁盘残留只是未执行；新 skill 不做共存边界声明、不吸收其职责（旧 design/implement 工件迁 plan 与 .workloom 结构迁移是两种东西）。
4. 原地改写加前置检查（推荐 A，Q4）：要求 git 干净或先提交；配置迁移前强制备份；失败即停可重跑。
5. skill 加脚本组合形态（推荐 A，Q5）：SKILL.md 总规程加 migrate-config.mjs 机械执行配置映射；任务目录与文档格式走规程步骤。
6. 任务文档格式规程化重排、不强制（推荐 A，Q6）：给操作规程与检查单；已归档任务不动；兼容读兜底读取。
7. 收敛摘要：一轮六问全收敛（Q3 采纳用户选项并附更正一条），前沿为空。

## References

1. SOP 原文需求点 6：/tmp/workloom-sop.txt（提供从 workloom 迁移到 workloom-sop 的 skill）。
2. 重写复用评估基线：[.workloom/tasks/11-06-sop-refactor/rewrite-reuse-eval.md](.workloom/tasks/11-06-sop-refactor/rewrite-reuse-eval.md)（workloom-migrate-plan 删除行、migrate.js 已删行）。
3. 需求增补记录：[.workloom/tasks/11-06-sop-refactor/requirements-addendum.md](.workloom/tasks/11-06-sop-refactor/requirements-addendum.md)（全局配置事故记录、pin 切换前置两项、追溯路由表第 1 条 trellis 链去留）。
4. 代码锚点：packages/core/src/resources-manifest.ts（skill 登记面）、packages/core/src/dispatch/executor-roles.ts（角色值域单源）、packages/core/src/workspace/command-ops.ts 与 locate.d.ts（trellis 残留链）。

## Notes

1. 首个真实用户是本机全局配置（~/.workloom/config.json），pin 切换前执行；本子任务只交付工具。
2. 生产旧 pin（1dc46f7）仍带 migrate.js：切换前禁止在无 .workloom 的目录跑 init/migrate 类命令或探针（事故记录现行注意事项，归容器切换时回收）。
3. workloom-migrate-plan 现行登记在 resources-manifest 的 SKILL_ENTRIES（'skills/workloom-migrate-plan/SKILL.md' 条目）；删除执行归子任务七时同步摘除登记与磁盘目录。本子任务新增 skill 的登记插入同一清单。
