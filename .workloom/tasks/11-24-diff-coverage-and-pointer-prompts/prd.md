# 任务增量覆盖率门禁与派发注入纯指针化（容器）

## Context

两个问题源于 zephyra B07 检查：覆盖率 628/1038（60.5%）暴露指标失真——整文件口径混入历史代码、机器门禁无数值阈值、文件集合不是真正的任务 diff；同时派发注入角色口径不一致，researcher/checker/judger 仍物化 prd 节块、checker 内联 CASE 与模板全文。用户要求覆盖率改任务增量口径（>90% 硬门禁 + 不达标原因审核）、五个角色注入统一纯指针。讨论中用户进一步要求：覆盖率工具按语言项目配置驱动（不配置走默认），且 config.json/config.local.json 的修改收编为一个专属 skill，其他 skill 改 config 时引用它。范围扩至四个可独立交付件，经用户确认拆分（Q1A）。

## Goal

- 覆盖率门禁只测本任务增量代码，严格 >90% 硬门禁，不达标走主会话原因审核与指纹绑定豁免。
- 五个 executor 角色派发注入统一纯指针模式，CASE 模板归 workloom-init 落盘、派发只读校验。
- 覆盖率工具按语言项目配置驱动，内置默认值；config 修改经专属 skill 统一纪律。
- 观察方式：新任务 RESULT 呈现逐文件变更行覆盖率；派发 receipt 内联计数降为指针级；coverage 配置缺省走默认；改 config 走专属 skill。

## Scope

容器编排四个子任务（children，各自完整生命周期，容器最后归档）：

- S1 增量覆盖率门禁与采集脚本：`subtasks/11-24-incremental-coverage-gate`。增量口径、>90% 硬门禁、below_threshold 审核与 coverageWaiver 豁免、core 变更行/交集脚本（go coverprofile、lcov、jacoco-xml）、模板 Coverage 节、workflow 2.3。无前置。
- S2 派发注入纯指针化与 CASE 模板 init 落盘：`subtasks/11-24-pointer-injection-and-template-init`。五个角色纯指针、ensureCaseTemplates init 落盘 + 派发只读校验 + doctor 检测、workflow Dispatch norm 与纪律文本、注入统计。无前置。
- S3 config 编辑专属 skill 与引用收编：`subtasks/11-24-config-edit-skill`。workloom-config-edit skill 统一项目/本地层 config 修改纪律；packages-scan、migrate-to-sop 等引用它；workflow/spec 补注入提示。无前置，通用基建。
- S4 覆盖率工具配置驱动与内置默认：`subtasks/11-24-coverage-config`。coverage 配置字段 + 内置语言默认 + 语言检测 + Checker/gate 消费 + 命令占位符；写配置引用 S3 skill。前置 S1 + S3。

非目标：不回测 B07、不改 zephyra；全局层 ~/.workloom/config 迁移仍归 migrate-to-sop；不引入第三方 diff-cover 依赖。

## Assumptions, Constraints and Dependencies

- 拆分依据：四个可独立交付件（3+ 触发拆分），用户确认清单（Q1A）。S1/S2/S3 无依赖可任意序，S4 依赖 S1 + S3；一次一个活跃任务。
- 容器只编排不实现，不配发 worktree/任务分支；子任务各自 worktree。容器做集成 CASE 验收合并行为，全部子任务归档后容器最后归档（级联清理）。
- autonomy semi：各子任务 PRD 人工确认、PLAN 评审清零后自动确认。
- 部署共享：各子任务 dist 同 commit 重建；容器归档前统一走 profile 重钉 + 用户授权重启（repo/deployment）。
- 语言分工、验证命令、编码约束按 repo/language、repo/code-style。

## Requirements

- R1：S1 交付增量覆盖率门禁——任务 diff 新增/修改可执行行口径、严格 >90% core 硬门禁（force 不可绕过）、below_threshold 主会话审核与指纹绑定豁免、core 脚本机械复算（go coverprofile、lcov、jacoco-xml）。
- R2：S2 交付五个角色纯指针注入——去除 prd 物化与 CASE/模板内联，CASE 模板 workloom-init 落盘（内容比对刷新）+ 派发只读校验 + doctor 检测。
- R3：S3 交付 config 编辑专属 skill——项目/本地层 config 修改统一纪律，其他需改 config 的 skill 引用它，注入提示补齐。
- R4：S4 交付覆盖率工具配置驱动——coverage 项目级字段（含 threshold 配置项，默认 90 严格 >）+ 内置语言默认 + 语言检测 + Checker/gate 消费（门禁与脚本读 threshold，缺省 90），写配置引用 S3 skill。
- R5：容器集成验收与部署——集成 CASE 验证四件合并行为，dist 同步与部署按 repo/deployment，子任务全归档后容器归档。

## Acceptance Criteria

- AC1（R1）：S1 归档，其 CASE 通过且增量门禁/豁免/脚本单测全绿。验证方法：S1 task.json check + archive 状态 + `node --test`。
- AC2（R2）：S2 归档，其 CASE 通过且注入/init/doctor 单测全绿。验证方法：S2 check + archive + `node --test`。
- AC3（R3）：S3 归档，config skill 存在且 packages-scan/migrate-to-sop 引用它，其 CASE 通过。验证方法：S3 check + archive + skill 资产核对。
- AC4（R4）：S4 归档，coverage 配置驱动默认/检测/消费单测全绿，其 CASE 通过。验证方法：S4 check + archive + `node --test`。
- AC5（R5）：容器集成 CASE 通过——在一个真实任务上验证增量门禁 + 纯指针注入 + 配置驱动合并行为；`pnpm lint`/`pnpm -r typecheck`/`pnpm -r build`/两包 `node --test` 全退出 0；dist 与 src 同 commit；部署同步完成。验证方法：集成 case-result.md + 命令退出码 + git 核对。

## Edge Cases and Failure Paths

- 依赖顺序：S4 必须在 S1 + S3 归档后启动；S1/S2/S3 任意序。
- 子任务未全归档：容器进入 integrating 被 children-archived 守卫拦截。
- 集成 CASE 失败：容器归档被 integration-case-passed 守卫拦截，回看对应子任务。
- 升级迁移：部署后已有项目重跑 workloom-init 刷新 CASE 模板副本（S2 doctor 兜底）。

## Risks and Open Questions

- 风险：四件顺序交付周期较长；接受，拆分换取边界清晰与独立验收。
- S4 内置语言集合在对齐时定（主会话已给推荐，见 Notes）；其余无未决问题。

## Alignment Decisions

- 拆四个子任务（S1 门禁脚本、S2 纯指针注入、S3 config skill、S4 配置驱动），容器编排最后归档。来源：用户 Q1A。
- config 修改收编为专属 skill，其他 skill 引用。来源：用户要求。
- 覆盖率工具配置驱动纳入本容器（S4），不另起独立任务。来源：用户选 B。
- 覆盖率阈值配置项 coverage.threshold 默认 90 严格 >（用户额外要求）：归 S4 配置驱动，S1 先硬编码默认 90，S4 让门禁与脚本读配置、缺省回退 90；不单独建任务、不扩 S1。
- S1/S2 需求种子来自容器原已确认 PRD（用户已确认 P1/P2 内容）。
- 覆盖率口径、删除行处理、>90% 严格阈值、主会话豁免审核、模板 init 落盘等关键决策见 S1/S2 PRD（已确认）。

## References

- 子任务 PRD：S1/S2 已种子化；S3/S4 待各自对齐。
- 现状核实：`packages/core/src/task/case-gates.ts`、`packages/core/src/injection/prompt-compose.ts`、`packages/core/src/workspace/config-load.ts`、`config-defaults.ts`、`packages/dsh-workloom/src/tooling/commands.ts`。
- 规范：repo/language、repo/code-style、repo/architecture、repo/deployment、repo/workflow。

## Notes

- children 完整路径：
  - `tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-incremental-coverage-gate`
  - `tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init`
  - `tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill`
  - `tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config`
- 执行顺序建议：S1 → S3 → S2 → S4（S4 需 S1+S3；S2 独立可插空）。
- S4 内置语言推荐（待 S4 对齐定稿）：内置能产机械复算格式的语言——go（go-coverprofile）、typescript/javascript/python/rust/c/cpp（lcov）、java/kotlin（jacoco-xml）。为此 S1 脚本支持三种格式：go-coverprofile、lcov、jacoco-xml（JaCoCo XML 逐行 ci>0 即覆盖，java/kotlin 共用）。其余语言（c#/ruby/php/swift 等）留配置 schema 由用户配置、走一致性校验，或后续加解析器再内置。
