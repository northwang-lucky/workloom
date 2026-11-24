# config 编辑专属 skill 与引用收编

## Context

当前 workloom 对 config.json/config.local.json 的修改分散在各 skill：packages-scan 直接写 packages 字段，migrate-to-sop 用专用脚本迁移遗留字段，update-spec 明确禁止改 config；workflow 契约与注入纪律里没有通用的"如何/何时改 config"提示（题外话核实）。用户要求把 config 修改收编为一个专属 skill，其他 skill 需要改 config 时引用它，统一修改纪律并补注入提示。

## Goal

新增 workloom-config-edit 专属 skill，统一项目层与本地层 config 修改纪律（读现状→提议→确认→合并写→校验）；packages-scan 与 migrate-to-sop 引用它；注入提示补齐。观察方式：改 config 的请求触发该 skill；packages-scan/migrate-to-sop 的 config 写入指向它；workflow/spec 有指引。

## Scope

范围内：

- 新增 `packages/core/resources/skills/workloom-config-edit/SKILL.md`（agent 面向，英文）；注册进 resources-manifest.ts SKILL_ENTRIES 名单并更新 skills.test 精确 pin（否则 skill 不注册）。
- packages-scan 收编：packages 写入步骤引用 config skill 纪律，保留扫描与 setup 推断专门逻辑。
- migrate-to-sop 收编：保留 migrate-config.mjs 专用迁移脚本，备份/校验纪律对齐并引用 config skill 作通用入口。
- 注入提示三处：skill description 触发词、repo/workflow spec 新条目、workflow.md 一句指引。
- 测试与资产同步：skill 结构 pin（如 contract-asset）、spec 条目、dist 同 commit。

非目标：

- 全局层 ~/.workloom/config 的迁移仍归 migrate-to-sop，config skill 不处理全局层。
- update-spec 保持禁止改 config（不收编）。
- 不改 config schema 本身（coverage 字段归 S4）；不改 loadConfig 逻辑。
- 不新建任务、不扩 S1/S2。

## Assumptions, Constraints and Dependencies

- config 三层流水线（全局→项目→本地），对象层顶层 key 覆盖；config skill 只编辑项目层 config.json|js 与本地层 config.local.json|js。
- 合法顶层字段以 config-defaults.ts/config-load.ts 为准：packages、worktree、hooks、subagent_profiles、context_injection、prompt_injection、executor、session_auto_commit；根层级 subagents 已退役。
- 修改纪律：读现状→提议变更→用户确认→合并写（保留其他字段）→loadConfig 校验 fail loud；每次修改用户确认（Q3A）。
- 备份：项目 config 靠 git 兜底，未提交修改先 .bak；全局层不在范围。
- agent 面向资产英文（repo/language）；编写 skill 前须读 writing-for-agents skill。
- 验证命令：pnpm lint、pnpm -r typecheck、pnpm -r build、两包 node --test。

## Requirements

- R1：新增 workloom-config-edit skill，frontmatter name/description/whenToUse 触发 config.json/config.local.json 修改请求；明示覆盖项目层与本地层，全局层拒绝并指引 migrate-to-sop。
- R2：skill 规定五步修改纪律——读现状（原始文件 + loadConfig 合并结果）→提议变更（展示字段影响/diff）→用户确认→合并写（保留其他字段，顶层 key 覆盖语义）→loadConfig 校验（fail loud）；含备份纪律（git 兜底，未提交先 .bak）。
- R3：skill 正文携带 8 个磁盘 snake_case 顶层字段清单（packages、worktree、hooks、subagent_profiles、context_injection、prompt_injection、executor、session_auto_commit）+ 权威源指针 config-defaults.ts（用户项目现场无源码，清单须随正文）；未知顶层字段由 skill 清单拒绝（loadConfig 静默忽略未知顶层字段，清单拒绝是强制点），关键子字段白名单（worktree.enabled/branch_template/cleanup 等）；已知字段形状经 loadConfig 或 workloom-doctor 校验。
- R4：packages-scan 的 packages 写入步骤改为引用 workloom-config-edit 的修改纪律，保留扫描/setup 推断专门逻辑；Boundaries 同步。
- R5：migrate-to-sop 保留 migrate-config.mjs 专用脚本与遗留字段映射；备份/校验纪律对齐 config skill，通用 config 修改入口引用 skill；迁移专门逻辑不变。
- R6：注入提示三处——skill description 触发词、repo/workflow spec 新条目 config-edit-skill、workflow.md 一句"config 修改走 workloom-config-edit"指引。
- R7：skill 结构 pin 同步（如 contract-asset 适用）；spec 条目英文；dist 同 commit；lint/typecheck/build/两包 test 全绿。

## Acceptance Criteria

- AC1（R1、R2、R3）：skill 存在且 frontmatter 触发词覆盖 config 修改；五步纪律齐全可定位；schema 字段清单与 config-defaults.ts 一致。验证方法：skill 资产核对 + grep 流程步骤 + 字段清单对照源码。
- AC2（R4、R5）：packages-scan 写入步骤引用 config skill；migrate-to-sop 引用 skill 且 migrate-config.mjs 保留。验证方法：grep 两 skill 引用 + 脚本存在核对。
- AC3（R6）：spec 条目、workflow 句、skill description 三处指引存在。验证方法：grep + contract-asset pin（如适用）。
- AC4（R7）：pnpm lint / pnpm -r typecheck / pnpm -r build / 两包 node --test 全退出 0；dist 与 src 同 commit。验证方法：命令退出码 + git 核对。

## Edge Cases and Failure Paths

- 全局层 config 修改请求：skill 拒绝并指引 migrate-to-sop（全局迁移）。
- 未知顶层字段：skill 字段清单拒绝（loadConfig 对项目/本地层未知顶层字段静默忽略，不依赖它拒绝）；已知字段形状由 loadConfig fail loud 校验。
- config.js 工厂函数：skill 以 JSON 编辑为主，config.js 提示手工编辑（工厂逻辑复杂，不自动改写）。
- 同层双文件（config.json + config.js 并存）：loadConfig 已 fail loud，skill 不制造该状态。
- 未提交修改：先 .bak 备份或建议先提交，再写。

## Risks and Open Questions

- 风险：skill 触发词与 packages-scan 触发词重叠（都涉 config）；接受，description 区分"扫描包结构"与"编辑 config 字段"，引用关系明确。
- 无未决问题（Q1A/Q2A/Q3A 已确认）。

## Alignment Decisions

- migrate-to-sop 保留专用脚本 + 引用 skill（Q1A）。理由：遗留字段映射是专门逻辑，不塞进通用 skill；只统一纪律与入口。
- 注入提示三处：skill description + repo/workflow spec + workflow.md（Q2A）。理由：workflow 层面可见，不依赖触发词命中。
- 每次改 config 用户确认（Q3A）。理由：与 packages-scan 一致，config 是项目级重要文件。
- 全局层归 migrate-to-sop，update-spec 保持禁止。来源：容器 PRD 边界。
- coverage 字段加入后 schema 清单同步归 S4。
- 注册 ripple（评审 P0-1）：skill 须进 SKILL_ENTRIES 名单 + skills.test pin，否则永不注册。
- 字段清单随正文（评审 P0-2）：用户项目现场无 config-defaults.ts，清单不可仅指针。
- 未知字段机制澄清（评审 P1-1）：loadConfig 静默忽略未知顶层字段，skill 清单拒绝是强制点；行为不变（未知字段仍被拒）。

## References

- `packages/core/resources/skills/workloom-packages-scan/SKILL.md`（步骤 5 packages 写入）、`workloom-migrate-to-sop/SKILL.md`（迁移脚本与备份）、`workloom-update-spec/SKILL.md`（禁止改 config）。
- `packages/core/src/workspace/config-load.ts`、`config-defaults.ts`（字段与校验）。
- writing-for-agents skill（编写 skill 前必读）。
- 规范：repo/language、repo/workflow、repo/code-style。

## Notes

- 实现须先读 writing-for-agents skill（agent 面向文档规则）；skill 正文英文。
- S4 加 coverage 字段后，config skill 的 schema 清单与示例同步（S4 责任，本任务预留说明）。
- workflow.md 仅加 guidance 句，states/step 不变，version 不升（asset-version-bump）。
