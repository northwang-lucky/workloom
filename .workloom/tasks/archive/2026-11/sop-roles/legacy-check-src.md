# AC3 src 段旧值检索清单（legacy-check-src）

步骤 7 产物：写侧收严与旧值域模块（executor-kinds.ts）退役后的 src 段检索存档。
检索时间：2026-11-08；基线：任务 worktree 分支 workloom/11-06-sop-roles 工作区（步骤 1-7 完成态）。

## 检索口径（plan 决定 11 精化检索式）

```bash
grep -rPn '\bresearch\b|\bimplement\b(?!\.jsonl)|\bcheck\b(?!\.jsonl)|frontend\b(?!-developer)|\breview\b' \
  packages/core/src packages/dsh-workloom/src --include=*.ts --include=*.js --include=*.d.ts
```

- `frontend\b(?!-developer)`：排除新值复合词 frontend-developer 的旧值词段（决定 11 ②）。
- `implement\b(?!\.jsonl)`、`check\b(?!\.jsonl)`：按命中词位置负向前瞻排除工件文件名形态，不做整行排除（决定 11 ③）。

## 结论

- 命中总数 218 处（38 个文件）；逐条按四类归属复核后，派发值域真消费点 **零命中**。
- `grep -rn "EXECUTOR_KINDS\|isExecutorRoleOrLegacy" packages/core/src packages/dsh-workloom/src` 零命中；executor-kinds.ts 已删除，dist 无残留。
- 写侧（recordExecutorDispatch/assertRole/schema enum）只收新五值；读侧 normalizeExecutorRole/tryNormalizeExecutorRole 兼容映射永久保留（R4）。

## 逐文件归属明细

| 文件 | 命中行 | 归属（决定 11 类别） |
| --- | --- | --- |
| core:dispatch/executor-roles.ts | 9, 35, 36, 37, 38, 39, 65, 66, 67, 68, 69 | ①/④ 兼容读映射表本体（LEGACY_KINDS 与 LEGACY_KIND_TO_ROLE）及头注释旧值说明——prd AC3 显式白名单，R4 永久保留 |
| core:resources-manifest.ts | 35, 36 | ① research-facts 模板资源文件名与规范名 |
| core:task/doc-review.ts | 2, 3, 4, 7, 15, 56, 61, 104, 105, 110, 113, 115, 133, 134, 137, 160, 173, 174, 176, 210, 219, 238, 314, 345, 369 | ① action 枚举 review（盘点点名假命中）与 align/case review-only 编排语义词 |
| core:task/state/audit.ts | 21, 38, 49 | ① OVERRIDE_GATES.CHECK 检查点值与 workloom_task_check 工具名（盘点点名）、light 拒绝文案英文词 |
| core:task/state/tracks.ts | 100 | ① planReview 轨道报错文案的 plan review 语义词 |
| core:task/state/values.ts | 96, 97, 98 | ① LEGACY_STAGE_IMPLEMENT/CHECK 旧 stage 兼容常量（盘点甄别清单点名；stage 值域属子任务三/七，非派发值域） |
| core:task/state/transitions.ts | 19, 21, 54, 61 | ① 守卫键名 plan-review-clean/check-ready 与 check 凭据语义词 |
| core:task/state/migrate.ts | 56 | ① check 凭据语义词（patch 字段注释） |
| core:task/state/view.ts | 167, 168, 169 | ④ 兼容读映射规则注释（旧 stage 值 implement/check 的映射说明，deriveStage 文档） |
| core:task/state/confirm.ts | 7, 12, 51, 124, 128, 156, 157 | ① 守卫键名 plan-review-clean、doc-review 模块名、reviewErr 局部变量 |
| core:task/state/guards.ts | 86, 107, 114, 141, 155, 179, 181, 183, 201, 244, 246, 266 | ① 守卫键名/2.2 check 凭据/jsonl 工件名/CASE 复核英文动词＋④ 历史旧 frontend 记录兼容说明注释 |
| core:task/task-ops.ts | 5, 8, 15, 441, 446, 448, 455, 458, 473, 476, 478, 487, 508, 509, 515, 518, 524, 531, 540, 730, 770, 773, 780, 800, 857 | ① 生命周期工具名（start/check/finish/archive）、2.2/2.3 check 凭据与门禁语义、守卫键名；476 行 frontend 派发门禁叙述为文案候选（登记 notes） |
| core:task/jsonl.ts | 5 | ③ implement/check.jsonl 工件文件名提及 |
| core:task/prd-structure.ts | 84, 131, 137, 328, 469, 476 | ① prd 骨架 placeholder 英文词、review 诊断/Static review 列名语义 |
| core:task/case-gates.ts | 2, 188 | ① check/archive 门禁阶段语义词（模块头注释） |
| core:task/storage/records.ts | 55, 93, 153, 162, 223, 234 | ① GateValue 检查点成员 check（盘点点名）＋④ stage 存储原值兼容注释＋2.2 check 凭据/派发目的语义注释 |
| core:task/storage/read-write.ts | 106, 137 | ① check 字段归一注释与 parsed.check 字段名（数据布局） |
| core:task/storage/create.ts | 186, 226, 228, 229, 230, 231, 403, 404 | ③ LOG_SEEDS 工件 seed 文案与 implement/check.jsonl 文件名（数据布局约定，domain-module 规范禁改）＋check 字段默认值 |
| core:workspace/config-subagent.ts | 291, 438, 496 | ④→待修：三处 JSDoc @param kind 仍列举旧五值（291/438/496），文件归步骤 8 改造批次，随步修正（登记 notes） |
| core:workspace/worktree.d.ts | 30, 65, 66 | ① 类型注释中 check 凭据/工件语义 |
| core:workspace/doctor-checks.ts | 8, 29 | ① doctor-check-rules 模块文件名 |
| core:workspace/doctor-types.ts | 6 | ① 类型注释 check 语义 |
| core:workspace/worktree-lifecycle.ts | 134, 137, 210, 294, 394, 444, 495, 582 | ① worktree 生命周期注释的历史裁定编号与 research 轮次引用、check 凭据语义 |
| core:workspace/git-query.ts | 285, 293 | ① git 子命令 check-ref-format |
| core:workspace/doctor-tasks.ts | 19 | ① check 局部变量名（flatMap 回调） |
| core:workspace/doctor-check-rules.ts | 189, 256, 289, 292, 295 | ① planReview 轨道语义文案（plan review track/Judger review track）与守卫键名 |
| core:injection/local-prompts.ts | 16, 59, 70, 71, 72, 73, 74 | ④ TARGET_BY_FILE 旧文件名侧（决定 4：新旧双文件名映射同一 target）及头注释兼容说明 |
| core:injection/session-context.ts | 92, 281 | ① leaf 纪律句英文动词 implement、final check 阶段语义词 |
| core:injection/surface.ts | 24, 48, 50, 52, 55, 58, 74, 76, 78, 92, 114, 117, 120, 121, 122, 124, 131, 133, 136, 296 | ① 工具描述/参数描述中 check 凭据、action=review、plan review track、start/check gates 等阶段与动作语义词 |
| core:injection/prompt-sections.ts | 7, 43, 47, 48, 50, 230, 231, 255 | ①/③ RESEARCH_DIR 目录名常量（盘点点名）与 worktree 纪律文案 .workloom 内容列举 |
| core:injection/prompt-compose.ts | 10, 16, 84, 173, 260, 261, 339 | ①/③ research 工件目录指针语义词、check 逐字核对阶段词、339 行 check dispatch rejected 拒绝前缀（阶段语义文案，非值域消费；登记 notes 归子任务七文案候选） |
| core:index.ts | 8, 194, 304, 305, 309, 456 | ① 分层注释中 doc-review 模块名与 start/check/finish 工具名语义 |
| dsh:dispatch/executor-injection.ts | 87 | ① 注释中 jsonl/research 指针行的工件目录语义 |
| dsh:dispatch/executor-settle.ts | 20 | ①→待修：头注释 20 行「check 报 FAIL」阶段语义词（文件归步骤 11 改造批次，随步修正；登记 notes） |
| dsh:dispatch/executor-guard.ts | 10, 60 | ④ 兼容读显式说明注释（历史旧 research/review 记录经归一识别，R9） |
| dsh:dispatch/discipline-text.ts | 21, 51, 56, 127, 155, 162, 171 | ① 纪律文案英文动词 implement、research materials/research-facts 规范与目录名、code review 英文词、plan-review.md 工件文件名、frontend files 英文形容词 |
| dsh:tooling/skills.ts | 63 | ① leaf 纪律句英文动词 implement |
| dsh:tooling/tasks.ts | 39, 119, 138, 290, 301, 307, 324, 340, 354 | ① action 枚举 review（盘点点名）与 check 工具名/2.2 凭据语义 |

## 归属类别说明（决定 11 四类）

- ① 假命中：action 枚举 review、GateValue/OVERRIDE_GATES 的 check、守卫键名（plan-review-clean/check-ready）、LEGACY_STAGE_*、RESEARCH_DIR 与 research-facts/plan-review.md 等目录与工件名、workloom_task_check 等工具名、2.2/2.3 check 凭据与阶段语义词、英文动词/名词（implement directly、code review、research materials、frontend files）、git 子命令、DSH 事件与结果形状、第三方与历史裁定引用。
- ② 新值复合词的旧值词段：已由 `frontend\b(?!-developer)` 负向前瞻排除，不出现在命中清单。
- ③ 工件文件名：implement.jsonl/check.jsonl 及其 seed 文案（数据布局约定，repo/domain-module 规范禁止改名）；检索式已按词位置排除文件名形态，剩余为文案与注释提及。
- ④ 兼容读与过渡容忍的显式说明：LEGACY_KIND_TO_ROLE 映射表本体（executor-roles.ts）、TARGET_BY_FILE 旧文件名侧（local-prompts.ts）、写守卫重建的旧值识别注释（executor-guard.ts）、视图兼容映射规则注释（state/view.ts、storage/records.ts）。

## 遗留登记（随后续步骤/子任务处理）

- config-subagent.ts:291/438/496 三处 JSDoc `@param kind` 仍列举旧五值——文件归步骤 8（subagents 退役）改造批次，随步修正。
- executor-settle.ts:20 头注释「如 check 报 FAIL」阶段语义词——文件归步骤 11（结算钩子）改造批次，随步修正。
- prompt-compose.ts:339 拒绝前缀 `check dispatch rejected`、task-ops.ts:476 「frontend 派发门禁」叙述——阶段/门禁语义文案，非值域消费点；登记 notes-stale-comments.md，叙述性文案归子任务七二次清理。
