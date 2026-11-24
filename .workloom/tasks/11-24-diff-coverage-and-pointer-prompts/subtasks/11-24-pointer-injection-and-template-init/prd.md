# 派发注入纯指针化与 CASE 模板 init 落盘

> 种子来源：容器 11-24-diff-coverage-and-pointer-prompts 已确认 PRD 的 P2 部分（用户已确认）。本子任务仍需走自身 1.1 对齐收敛并确认 PRD。

## Context

派发注入的角色口径不一致：developer/frontend-developer 已是纯指针模式（plan.md 指针 + jsonl 指针 + research 指针 + prd 软指针）；researcher/checker/judger 仍物化 prd 的 Requirements/Acceptance 节块，checker 还内联 CASE 全文与两份模板，注入体积大且与文件内容重复。CASE 模板在插件资源目录（`packages/core/resources/templates/`），跨项目不可直读，这是当前全文内联的原因。现有架构中模板是 init 附属物（`handleInit` → `ensureTemplates` 补落 spec 模板）。

## Goal

researcher、developer、frontend-developer、checker、judger 五个角色派发注入统一纯指针模式：prd、plan、jsonl、research、CASE、模板全部以指针行给出，执行器按分层加载协议按需读取。CASE 模板归 workloom-init 落盘，派发只读校验。观察方式：派发 receipt 内联计数降为指针级；checker 注入无 prd 节块、无 CASE/模板全文。

## Scope

范围内：

- 注入：`prompt-compose.ts`/`prompt-sections.ts` 去除 prd 物化与 CASE/模板内联，统一软指针；checker 派发只读校验模板副本。
- init/doctor：core 新增 `ensureCaseTemplates`（内容比对刷新），dsh `ensureTemplates` 扩展复用已有模板 loader；doctor 增副本缺失/过期检查项。
- resources：`workflow.md` Dispatch norm 与 2.2/2.3 措辞；dsh `discipline-text.ts` 同步。
- 测试与 spec：更新注入相关测试、`contract-asset.test.ts`、init/doctor 单测；spec 新增注入模式条目；dist 同 commit 重建。

非目标：

- 增量覆盖率门禁与脚本归 S1；config 编辑 skill 归 S3；覆盖率配置驱动归 S4。
- 不改 CASE 的 SR/C 验收结构与 Traceability；不改 spec 模板"已存在不覆盖"语义。

## Assumptions, Constraints and Dependencies

- 模板副本内容比对刷新，刻意不同于 spec 模板"已存在不覆盖"：CASE 结构是门禁契约，副本须随插件版本同步。
- 派发只读：checker 派发校验副本存在且一致，缺失/过期 fail loud 指引重跑 init，不在派发时写盘。
- 语言分工（repo/language）、验证命令（repo/code-style verify）、编码约束；absence-assertions 用完整结构形式。
- 插件升级后已有项目需重跑 workloom-init 刷新副本（doctor 兜底检测）。

## Requirements

- R1：researcher/checker/judger 注入与 developer 一致：prd 软指针行 + plan.md/jsonl/research 指针行；去除 prd 节块物化。
- R2：checker 的 CASE 与两份模板改项目内副本 + 指针行，去除全文内联；case.md 在任务目录直接给指针；模板副本 workloom-init 落盘（内容比对刷新）；checker 派发只读校验，缺失/过期 fail loud 指引 init。
- R3：workflow.md Dispatch norm 与 2.2/2.3 同步：首次派发/failover/reinject 不再携带 CASE 与模板全文，改指针；分层加载协议与角色纪律指明必读 artifact（checker 执行轮必读 case.md，设计轮必读两份模板副本）；副本缺失/过期派发拒绝并指引 init。
- R4：注入统计与 receipt 语义同步：filesInlined 不再计 prd/CASE 块，指针计数如实反映。
- R5：既有测试更新到新行为并通过，新行为有测试覆盖；spec 新增条目；dist 同 commit 重建；部署按 repo/deployment。

## Acceptance Criteria

- AC1（R1、R2、R4）：五个角色注入夹具断言无 prd 节块物化、无 CASE/模板全文内联；checker 得 case.md 与模板指针行；receipt 内联计数为指针级。验证方法：core 注入单测 + dsh 单测。
- AC2（R2）：init 落盘副本且重跑 init 内容比对刷新；副本缺失/过期时 checker 派发拒绝并指引 init；doctor 检测缺失/过期。验证方法：init/doctor 单测 + 派发守卫单测。
- AC3（R3）：workflow.md Dispatch norm 与 2.2/2.3 文本更新，contract-asset 逐字核对通过；states/step 集合不变，front-matter version 不升。验证方法：`contract-asset.test.ts`。
- AC4（R5）：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、两包 `node --test` 全退出 0；spec 新条目存在；dist 与 src 同 commit。验证方法：命令退出码 + git 核对。

## Edge Cases and Failure Paths

- failover/reinject：文件在盘上，新会话直接读指针目标，不依赖旧会话记忆，不需重新携带全文。
- 模板副本过期：init 内容比对刷新保证与当前插件一致；副本只读参考，项目内修改重跑 init 时被覆盖；派发只读校验缺失/过期拒绝并指引 init。
- 插件升级迁移：已有项目重跑 workloom-init 刷新副本；doctor 检测缺失/过期并报告。
- light/container：case.required=false 门禁豁免语义不变。

## Risks and Open Questions

- 风险：升级后未重跑 init 的项目派发 checker 会被拒绝；接受，fail loud 给指引比静默用旧模板更安全，doctor 兜底。
- 无未决问题（种子已确认；本子任务对齐如有新节点再补）。

## Alignment Decisions

- 五个角色统一 developer 式纯指针；CASE/模板经项目内副本 + 指针访问。理由：注入与文件重复，指针 + 分层加载协议已足够；模板跨项目不可直读，落盘副本解决可达性。
- 模板落盘归 workloom-init，派发只读校验（用户质疑运行时落盘后修正）。理由：现有架构模板是 init 附属物，注入组装应只读；派发写盘违背分层。代价：升级后需重跑 init，doctor 兜底。
- CASE 模板副本内容比对刷新，刻意不同于 spec 模板"已存在不覆盖"。理由：CASE 结构是门禁契约，副本漂移会让 checker 按旧模板设计；spec 模板是用户可改脚手架。

## References

- `packages/core/src/injection/prompt-compose.ts`、`prompt-sections.ts`、`packages/dsh-workloom/src/dispatch/executor-injection.ts`、`discipline-text.ts`。
- `packages/core/src/workspace/spec-templates.ts`、`packages/dsh-workloom/src/tooling/commands.ts`（handleInit → ensureTemplates）。
- `packages/core/resources/workflow/workflow.md`、`packages/core/resources/templates/case.md`、`case-result.md`。
- 规范：repo/language、repo/code-style、repo/architecture（executor-voice）、repo/deployment、repo/workflow（asset-version-bump）。

## Notes

- 部署需用户授权重启；新注入自部署后下一个任务生效；升级后项目重跑 workloom-init 刷新副本。
- workflow.md states/step 不变，仅改 guidance，按 asset-version-bump 不升 version。
- 模板落盘位置建议 `.workloom/templates/`（避开 spec 索引收集器），由 Developer 在 plan 锚定。
