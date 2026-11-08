# AC3 全仓旧值检索终验清单（legacy-check-final）

步骤 18 产物：src 与 resources 两份清单在**全步骤完成终态**上的合并复核归档（分步清单见同目录 legacy-check-src.md 与 legacy-check-resources.md，本文件为终态权威版）。
检索时间：2026-11-08；基线：任务 worktree 分支 workloom/11-06-sop-roles 工作区（步骤 1-17 与工作项①②全部完成态，未 commit）。

## 检索口径（plan 决定 11 精化检索式）

```bash
grep -rPn '\bresearch\b|\bimplement\b(?!\.jsonl)|\bcheck\b(?!\.jsonl)|frontend\b(?!-developer)|\breview\b' \
  packages/core/src packages/dsh-workloom/src --include='*.ts' --include='*.js' --include='*.d.ts'
grep -rPn '<同式>' packages/core/resources --include='*.md'   # third-party/** 单列（类别①）
```

- `frontend\b(?!-developer)`：排除新值复合词的旧值词段（决定 11 ②）。
- `implement\b(?!\.jsonl)`、`check\b(?!\.jsonl)`：按命中词位置排除工件文件名形态，不做整行排除（决定 11 ③）。
- 另跑比较形态专项检查：`(===|!==|==) '<旧五值>'` 与 `'<旧五值>' (===|!==)` 两向检索。

## 终态结论

- src 段命中 231 处 / 39 文件；resources 段命中 106 处 / 14 文件；第三方 skills 4 处（third-party/mattpocock-skills 的 tdd 与 writing-for-agents，类别①）。逐条按四类归属复核后，派发值域**真消费点零命中**。
- 比较形态专项检索**零命中**（排除白名单：executor-roles.ts 的 LEGACY_KIND_TO_ROLE 映射表本体、local-prompts.ts 的 TARGET_BY_FILE 旧文件名侧、state/values.ts 的 LEGACY_STAGE_* 旧 stage 常量、action 枚举 'review'、GateValue 'check'）。
- 退役符号清单全部零命中（两包 src）：EXECUTOR_KINDS、isExecutorKind、isExecutorRoleOrLegacy、NATIVE_TOOLS_DSH、startContinuable、assertKind、KIND_LABELS、WRITE_GUARDED_KINDS、buildCrossKindReuseRejectText、EXECUTOR_CONTRACT_BY_KIND、kindFromLabel、LABEL_TO_KIND、parseSubagents、subagentsSource；core src 无 failover/dispatch-binding 引用；dist 无退役模块产物残留（core dist 唯一命中为 surface.js 内 PARENT_MODEL_LABEL 注释的历史来源说明，合法）。
- `kind:` 参数字样与 "(research|implement|check|review|frontend) executor" 角色名词短语在 resources 全目录零命中；workflow.md front-matter version 未提升（决定 10），contract-asset 四处版本断言原样绿。
- 相对步骤 7/17 分步清单的命中增量（src 218→231）全部来自步骤 10-16 新增的 plan-review 轨道词汇（'plan-review' 连字符词形、planReviewMark 编排注释、taskPlanReview 工具描述、PLAN_REVIEW_PURPOSE 常量）与 roles 改名注释，均属类别①语义词，非派发值域消费点。

## src 段逐文件归属（231 处 / 39 文件）

归属类别沿用决定 11 四类；各文件的具体归属说明与 legacy-check-src.md 一致，新增文件/增量在表后补注。

| 文件 | 命中行 |
| --- | --- |
| core:dispatch/executor-roles.ts | 9 35 36 37 38 39 65 66 67 68 69 |
| core:index.ts | 8 178 288 289 296 443 |
| core:injection/local-prompts.ts | 16 59 70 71 72 73 74 |
| core:injection/prompt-compose.ts | 10 16 86 163 178 265 266 344 |
| core:injection/prompt-sections.ts | 7 43 47 48 50 230 231 255 |
| core:injection/session-context.ts | 93 281 |
| core:injection/surface.ts | 23 48 50 52 54 57 60 76 78 80 82 96 118 121 124 125 126 128 135 137 138 140 143 309 |
| core:resources-manifest.ts | 35 36 |
| core:task/case-gates.ts | 2 188 |
| core:task/dispatch-records.ts | 365 |
| core:task/doc-review.ts | 2 3 4 7 15 56 61 104 105 110 113 115 133 134 137 162 177 185 220 233 234 236 270 279 298 374 405 429 |
| core:task/jsonl.ts | 5 |
| core:task/prd-structure.ts | 84 131 137 328 469 476 |
| core:task/state/audit.ts | 21 38 49 |
| core:task/state/confirm.ts | 7 12 51 124 128 156 157 |
| core:task/state/guards.ts | 86 107 114 141 155 179 181 183 201 244 246 266 |
| core:task/state/migrate.ts | 56 |
| core:task/state/tracks.ts | 100 |
| core:task/state/transitions.ts | 19 21 54 61 |
| core:task/state/values.ts | 96 97 98 |
| core:task/state/view.ts | 167 168 169 |
| core:task/storage/create.ts | 186 226 228 229 230 231 403 404 |
| core:task/storage/read-write.ts | 106 137 |
| core:task/storage/records.ts | 55 93 154 158 168 229 240 |
| core:task/task-ops.ts | 5 8 15 441 446 448 455 458 473 476 478 487 508 509 515 518 524 531 540 730 770 773 780 800 857 |
| core:workspace/doctor-check-rules.ts | 189 256 289 292 295 |
| core:workspace/doctor-checks.ts | 8 29 |
| core:workspace/doctor-tasks.ts | 19 |
| core:workspace/doctor-types.ts | 6 |
| core:workspace/git-query.ts | 285 293 |
| core:workspace/worktree.d.ts | 30 65 66 |
| core:workspace/worktree-lifecycle.ts | 134 137 210 294 394 444 495 582 |
| dsh:dispatch/discipline-text.ts | 21 51 56 127 155 162 171 |
| dsh:dispatch/executor-guard.ts | 10 58 |
| dsh:dispatch/executor-injection.ts | 92 |
| dsh:dispatch/executor-schema.ts | 69 |
| dsh:dispatch/executor.ts | 163 517 527 |
| dsh:tooling/skills.ts | 63 |
| dsh:tooling/tasks.ts | 40 121 140 313 324 330 347 363 377 389 397 404 |

src 段归属补注（相对步骤 7 清单的新增/增量文件）：

- core:task/doc-review.ts（28）——① action 枚举 'review' 与 align/case review-only 编排语义 ＋ 步骤 10 新增 executePlanReviewMark 的 plan review 轨道语义词（revising/clean 标记、'plan review mark' 报错文案）。
- core:injection/surface.ts（24）——① 工具/参数描述中 check 凭据、action=review、plan review track、start/check gates 等阶段与动作语义词 ＋ 步骤 10 新增 taskPlanReview/planReviewPhase 描述与 executorPurpose 的 plan-review 词形。
- dsh:tooling/tasks.ts（12）——① action 枚举 'review'、check 工具名/2.2 凭据语义 ＋ 步骤 10 新增 planreview 工具注册与 planReviewMarkTool 的轨道语义词。
- core:task/storage/records.ts（7）——① GateValue 'check' 成员、2.2 凭据语义 ＋ ④ PLAN_REVIEW_PURPOSE='plan-review' 常量（连字符词形命中）与 DispatchPurpose 联合注释。
- core:injection/prompt-compose.ts（8）——①/③ research 工件目录指针语义、check 逐字核对阶段词、'check dispatch rejected' 拒绝前缀（阶段语义文案，notes 已登记归子任务七）＋ purpose 字段的 plan-review 注释。
- dsh:dispatch/executor.ts（3）——① 头注释 researcher 守卫/checker + execution 轮分工词 ＋ plan 评审自动置位注释与 clean 态 WARNING 文案（plan review track 语义）。
- dsh:dispatch/executor-schema.ts（1）——① purpose enum 单源拼装注释（plan-review 词形）。
- core:task/dispatch-records.ts（1）——① judger purpose 校验注释（plan-review 词形）。
- core:workspace/doctor-checks.ts（2）/doctor-types.ts（1）——① doctor-check-rules.ts 文件名引用。
- core:workspace/config-subagent.ts（0，步骤 7 时为 3）——旧 JSDoc @param kind 旧五值列举已随步骤 8 修正清零。
- 新模块 model-failover.ts / executor-spawn.ts / dispatch-binding.ts(dsh) / dispatch-scan.ts——检索零命中或仅英文词（'model-access error' 等），无旧值词。
- 其余文件归属与 legacy-check-src.md 逐文件明细一致（executor-roles.ts 映射表本体①/④、local-prompts.ts 双文件名④、executor-guard.ts 兼容读注释④、state/values.ts LEGACY_STAGE_*①、guards/confirm/transitions/audit 守卫键与阶段语义①、task-ops 工具名与凭据语义①、worktree-lifecycle 历史裁定引用①、git-query 子命令①、resources-manifest 资源名①、create/read-write/jsonl 工件文件名③、discipline-text/skills/session-context/prompt-sections/prd-structure/case-gates/tracks/migrate/view/index/doctor-check-rules/executor-injection/worktree.d.ts 英文词与语义名①）。

## resources 段逐文件归属（106 处 / 14 文件；另 third-party 4 处类别①）

归属说明与 legacy-check-resources.md 一致（该文件产生后 resources 未再改动，命中数逐字相符）：workflow.md 35 处为英文词/工具名/stage `implement`/`check` 旧 stage 字样（决定 10 显式保留归子任务七）/工件文件名；其余文件为英文词、模板列名与占位（case.md/case-result.md/research-facts.md）、design.md/implement.md 旧工件名（migrate-plan/case-archived）、frontend 英文形容词（ui-design/update-spec）、check dirty files 动词（finish/continue）。

| 文件 | 命中行 |
| --- | --- |
| skills/workloom-alignment/references/plan-authoring.md | 5 26 37 44 |
| skills/workloom-alignment/references/ui-design.md | 3 23 |
| skills/workloom-alignment/SKILL.md | 4 9 21 24 47 57 73 74 78 84 90 |
| skills/workloom-case-active/SKILL.md | 3 4 14 15 28 34 35 36 41 43 45 56 |
| skills/workloom-case-archived/SKILL.md | 3 13 24 38 40 43 45 49 57 |
| skills/workloom-continue/SKILL.md | 8 21 27 29 30 32 33 34 35 |
| skills/workloom-finish/SKILL.md | 3 14 |
| skills/workloom-migrate-plan/SKILL.md | 3 4 9 19 25 30 31 34 38 42 |
| skills/workloom-update-spec/SKILL.md | 20 |
| templates/case.md | 29 64 |
| templates/case-result.md | 5 15 |
| templates/research-facts.md | 1 5 |
| workflow/workflow-light.md | 11 19 29 31 43 |
| workflow/workflow.md | 16 17 18 25 35 39 41 50 54 59 68 70 79 81 82 90 92 96 104 106 108 110 113 124 132 136 154 155 156 157 158 160 171 172 177 |

## 归属类别说明（决定 11 四类）

- ① 假命中：action 枚举 review、GateValue/OVERRIDE_GATES 的 check、守卫键名（plan-review-clean/check-ready）、planReview 轨道语义词（plan review track/revising/clean 及 'plan-review' 连字符词形）、LEGACY_STAGE_*、RESEARCH_DIR 与 research-facts/plan-review.md/implement.jsonl/check.jsonl 等目录与工件名、workloom_task_check 等工具名、2.2/2.3 check 凭据与阶段语义词、英文动词/名词（implement directly、code review、research materials、frontend files）、git 子命令、DSH 事件与结果形状、第三方与历史裁定引用。
- ② 新值复合词的旧值词段：已由 `frontend\b(?!-developer)` 负向前瞻排除，不出现在命中清单。
- ③ 工件文件名：implement.jsonl/check.jsonl 及其 seed 文案、design.md/implement.md 旧工件名（数据布局约定，repo/domain-module 规范禁止改名）。
- ④ 兼容读与过渡容忍的显式说明：LEGACY_KIND_TO_ROLE 映射表本体（executor-roles.ts，R4 永久保留）、TARGET_BY_FILE 旧文件名侧（local-prompts.ts，决定 4）、写守卫重建的旧值识别注释（executor-guard.ts）、视图兼容映射规则注释（state/view.ts、storage/records.ts）。

## 关联观察点（步骤 18 第 5/6 项联动）

- AC9 文件树：core dispatch/ 仅 executor-capacity(.d.ts)/executor-roles/executor-tools；task/state 与 task/storage 各含 index.ts；task/ 根无 state-machine.ts 与 task-storage.ts；拆分产物（storage 五文件、state 十文件、prompt-compose 三件套，合计 3661 行）单文件全部低于 600 行。
- 既有超 600 行文件如实登记不强制拆分（评审 #10）：src 侧仅 task-ops.ts（934 行，本任务未加深）；测试大文件 state-machine.test 1330 / config.test 1581 / task-store.test 2609 / executor.test 3237。
- AC10：退役符号清单（14 项）与 core failover/dispatch-binding 引用全部零命中；旧值比较形态零命中。

## 交叉引用

- 步骤 7 分步清单：legacy-check-src.md（src 段 218 处时点版，含遗留登记节）。
- 步骤 17 分步清单：legacy-check-resources.md（resources 段，含已切换点清单）。
- 注释与 spec 登记：notes-stale-comments.md（剩余注释候选、过期 spec 条目、测试隔离脆弱面、全局配置迁移前置）。
