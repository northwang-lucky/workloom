# AC3 resources 段旧值检索清单（legacy-check-resources）

步骤 17 产物：resources 机械字样切换完成后的检索存档。
检索时间：2026-11-08；基线：任务 worktree 分支 workloom/11-06-sop-roles 工作区（步骤 17 完成态）。

## 检索口径（plan 决定 11 精化检索式）

```bash
grep -rPn '\bresearch\b|\bimplement\b(?!\.jsonl)|\bcheck\b(?!\.jsonl)|frontend\b(?!-developer)|\breview\b' \
  packages/core/resources --include=*.md   # third-party/** 单列（类别①）
```

## 结论

- 非第三方命中 106 处（14 个文件），逐条按归属复核后派发值域真消费点 **零命中**：
  `kind:` 参数字样全 resources 零命中；`(research|implement|check|review|frontend) executor` 角色名词短语零命中。
- 第三方 skills（third-party/mattpocock-skills 的 tdd 与 writing-for-agents，共 4 处）为普通英文词，类别①，不属派发值域。
- front-matter version 未提升（决定 10：本任务全部为既有步骤内的指令文案切换，非契约结构变化）；
  contract-asset.test 四处版本断言原样绿，三处钉住句已同步新措辞并加 1.4 plan-review 补充句钉住。
- 旧 stage 字样（workflow.md 79/136/155-156 的 stage `implement`/`check`）按决定 10 与 plan 的显式冲突声明保留，归子任务七。

## 逐文件归属明细

| 文件 | 命中行 | 归属 |
| --- | --- | --- |
| templates/case.md | 29, 64 | ① 模板列名与复合词（Static review 列、spec-check）。 |
| templates/case-result.md | 5, 15 | ① checkSession front-matter 字段名（盘点报告显式点名）与 Static review 列名。 |
| templates/research-facts.md | 1, 5 | ① 模板占位与英文词（<research topic>、research output is read-only）。 |
| workflow/workflow-light.md | 11, 19, 29, 31, 43 | ① 否定式提及已核对（11 行 "no executor is dispatched" 角色中性保留；31 行已切 "no Checker"）；余为 Self-check 复合词、workloom_task_check 工具名与 check dirty files 英文动词。 |
| workflow/workflow.md | 16, 17, 18, 25, 35, 39, 41, 50, 54, 59, 68, 70, 79, 81, 82, 90, 92, 96, 104, 106, 108, 110, 113, 124, 132, 136, 154, 155, 156, 157, 158, 160, 171, 172, 177 | ① 英文词/工具名/步骤名（workloom_task_check、action=review、Self-check、research materials 等）＋ stage `implement`/`check` 旧 stage 字样（79/136/155-156，决定 10 显式保留，归子任务七）＋ implement.jsonl/check.jsonl 工件文件名提及（③）。派发指令句与 kind: 参数字样已全部切换（本清单生成前复核 `kind:` 与 "X executor" 角色名词零命中）。 |
| skills/workloom-continue/SKILL.md | 8, 21, 27, 29, 30, 32, 33, 34, 35 | ① 英文词与步骤名（2.3 Check、CASE review、author and review plan.md、purpose=execution 无 kind 参数字样——全文 grep `kind:` 零命中）。 |
| skills/workloom-alignment/references/plan-authoring.md | 5, 26, 37, 44 | ① 英文词（the behavior to implement、1.4 review）；5 行已切 the Developer。 |
| skills/workloom-alignment/references/ui-design.md | 3, 23 | ① frontend UI presentation / frontend dispatch gate / frontend file implementation 为英文形容词短语；23 行参数字样已切 `role: frontend-developer`。 |
| skills/workloom-alignment/SKILL.md | 4, 9, 21, 24, 47, 57, 73, 74, 78, 84, 90 | ① 英文词（review the plan、frontend UI presentation、Check readyToConfirm、action=review）；47/49 两行角色名词已切 Researcher/Developer。 |
| skills/workloom-case-archived/SKILL.md | 3, 13, 24, 38, 40, 43, 45, 49, 57 | ① 英文词（review CASE、design session）＋ ③ design.md/implement.md 旧工件文件名（历史任务材料形态描述）；42 行已切 `role: checker`。 |
| skills/workloom-finish/SKILL.md | 3, 14 | ① check dirty files 英文动词。 |
| skills/workloom-case-active/SKILL.md | 3, 4, 14, 15, 28, 34, 35, 36, 41, 43, 45, 56 | ① 英文词（review revisions、self-check、check discipline、action: review）；9/27-28/35/43 行已切 Checker 与 `role: checker`。 |
| skills/workloom-update-spec/SKILL.md | 20 | ① frontend 作为 spec 分层示例词（backend/frontend 目录层次），非派发值域。 |
| skills/workloom-migrate-plan/SKILL.md | 3, 4, 9, 19, 25, 30, 31, 34, 38, 42 | ③ design.md/implement.md 旧工件文件名（迁移对象本体）＋ ① research materials 英文词；14 行已切 `researcher` dispatch。 |
| third-party/mattpocock-skills/{tdd,writing-for-agents}/SKILL.md | 各 2 处 | ① 第三方 skill 普通英文词（决定 11 显式归属） |

## 已切换点清单（决定 10 边界）

- workflow.md：1.2 Researcher；1.4 Judger + `role: judger`/`purpose: plan-review` + 自动置 reviewing 与 workloom_task_planreview 标记句 + 同 Judger 子会话续接；2.1 Developer/Developer subagent；2.1 与 2.3 `role: frontend-developer` 与 frontend-developer 门禁字样；2.2/2.3 `role: checker` 与 Checker 全部角色名词；breadcrumb in_progress 段 `role: checker` 与 Checker；norms 段 Developer subagent/Checker/checker dispatch；1.0 原则句 Checker；1.1 段 Developer。
- workflow-light.md：2.2 "no Checker"。
- ui-design.md:23：`role: frontend-developer` executor dispatch。
- workloom-alignment SKILL.md 47/49：Researcher / Developer。plan-authoring.md:5：the Developer。test-first.md 3/25：the Developer。
- workloom-case-active SKILL.md 9/27-28/35/41-43：Checker、`role: checker`、Developer/frontend-developer dispatches。
- workloom-case-archived SKILL.md 42：`role: checker`。workloom-migrate-plan SKILL.md 14：`researcher` dispatch。
- contract-asset.test.ts：2.1/2.3/2.3 三处钉住句同步新措辞；1.4 钉住句切 Judger 派发指令并新增自动置 reviewing 与 planreview 工具说明两条钉住。
