# C3 旧值零残留检索——命中清单归属复核（CASE 执行轮独立复核）

- 检索口径：plan 决定 11 五条精化检索式（`\bresearch\b`、`\bimplement\b(?!\.jsonl)`、`\bcheck\b(?!\.jsonl)`、`\bfrontend\b(?!-developer)`、`\breview\b`），范围 packages/core/src、packages/dsh-workloom/src、packages/core/resources。
- 本轮为 P2 注释修复后的重跑终版：src 段 39 文件 / 231 处（去重行），resources 段 21 文件 / 158 处。
- 原始命中：c3-src-hits.log、c3-resources-hits.log；比较形态与退役符号专项：c3-verification.log。
- 交叉核对对象：实施侧 legacy-check-final.md（worktree 侧任务目录；src 段 231 处/39 文件——行号级一致，唯一位移为 records.ts 168→169，系 CASE 轮 P2 注释修复消除陈旧「仅 check 使用」字样后新注释的 plan-review 连字符词形命中，类别①）。

## 决定性验证（真消费点零命中）

1. 等值比较专项：仅 doc-review.ts:234/270 两处命中，为 workloom_task_align/case 的 action 枚举 'review'（类别①，盘点 §4 在案假命中），非派发值域比较。
2. includes 形态、`kind: '<旧值>'` 写入形态：零命中。
3. 退役符号面（EXECUTOR_KINDS/isExecutorKind/isExecutorRoleOrLegacy/WRITE_GUARDED_KINDS/KIND_LABELS/CHECK_KIND/EXECUTOR_CONTRACT_BY_KIND/kindFromLabel/LABEL_TO_KIND/parseSubagents/subagentsSource/buildCrossKindReuseRejectText/assertKind/startContinuable）：两包 src 零命中。
4. resources 的 `kind: <旧值>` 参数字样：零命中；`(旧值) executor` 角色名词短语：仅 evals 夹具数据 1 处（G7 归属）。
5. ②类（frontend-developer 的 frontend 词段）与③类（implement.jsonl/check.jsonl）经负向前瞻排除，命中清单中不出现，符合预期。

## src 段逐文件归属（39 文件 / 231 处）

- `packages/core/src/dispatch/executor-roles.ts`（11 处）：④ LEGACY_KINDS/LEGACY_KIND_TO_ROLE 兼容映射表本体（R4 永久保留，AC3 允许）
- `packages/core/src/index.ts`（6 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/injection/local-prompts.ts`（7 处）：④ TARGET_BY_FILE 旧文件名兼容映射与说明注释（决定 4，AC3 允许）
- `packages/core/src/injection/prompt-compose.ts`（8 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/injection/prompt-sections.ts`（8 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/injection/session-context.ts`（2 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/injection/surface.ts`（24 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/resources-manifest.ts`（2 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/case-gates.ts`（2 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/dispatch-records.ts`（1 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/doc-review.ts`（28 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/jsonl.ts`（1 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/prd-structure.ts`（6 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/state/audit.ts`（3 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/state/confirm.ts`（7 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/state/guards.ts`（12 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/state/migrate.ts`（1 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/state/tracks.ts`（1 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/state/transitions.ts`（4 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/state/values.ts`（3 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/state/view.ts`（3 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/storage/create.ts`（8 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/storage/read-write.ts`（2 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/storage/records.ts`（7 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/task/task-ops.ts`（25 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/workspace/doctor-check-rules.ts`（5 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/workspace/doctor-checks.ts`（2 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/workspace/doctor-tasks.ts`（1 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/workspace/doctor-types.ts`（1 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/workspace/git-query.ts`（2 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/workspace/worktree-lifecycle.ts`（8 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/core/src/workspace/worktree.d.ts`（3 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/dsh-workloom/src/dispatch/discipline-text.ts`（7 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/dsh-workloom/src/dispatch/executor-guard.ts`（2 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/dsh-workloom/src/dispatch/executor-injection.ts`（1 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/dsh-workloom/src/dispatch/executor-schema.ts`（1 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/dsh-workloom/src/dispatch/executor.ts`（3 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/dsh-workloom/src/tooling/skills.ts`（1 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）
- `packages/dsh-workloom/src/tooling/tasks.ts`（12 处）：① 假命中（语义词/目录名/工件名/action 枚举/plan-review 连字符词形/英文动词，逐行见原始日志）

归属说明：guards.ts/task-ops.ts/doctor-check-rules.ts 的 check 为 2.2 门禁凭据与 check.jsonl 工件语义；doc-review.ts/tasks.ts/surface.ts 的 review 为 action 枚举、plan-review 轨道词汇与工具名；worktree-lifecycle.ts/prd-structure.ts 为英文动词与文档结构词汇；prompt-compose/prompt-sections/session-context 的 research 为 RESEARCH_DIR 目录名；executor-guard.ts/executor.ts/state/view.ts/storage/records.ts 含④兼容读说明注释；executor-schema.ts:69 为 purpose 枚举 plan-review 值；storage/records.ts:169 为 P2 修复后新注释的 plan-review 语义词。与实施清单 legacy-check-final.md 逐文件归属一致（行号级零差集，records.ts 位移如上注明）。

## resources 段逐文件归属（21 文件 / 158 处）

实施清单已载 14 文件 / 106 处（行号级一致）+ third-party 2 文件 / 4 处（其正文单列）。本轮独立检索另含 5 个 eval 夹具文件（实施清单未载），归属判定如下：

- `packages/core/resources/skills/workloom-alignment/SKILL.md`（11 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/skills/workloom-alignment/evals/evals.json`（18 处）：①/历史夹具数据：skill 评测夹具与期望行为描述文本（AC3 允许类别；其中 workloom-case-active/evals/evals.json:15 含旧角色名词短语 "check executor"，属评测数据陈旧措辞，登记归子任务七文档层）
- `packages/core/resources/skills/workloom-alignment/references/plan-authoring.md`（4 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/skills/workloom-alignment/references/ui-design.md`（2 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/skills/workloom-case-active/SKILL.md`（12 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/skills/workloom-case-active/evals/build-fixtures.mjs`（7 处）：①/历史夹具数据：skill 评测夹具与期望行为描述文本（AC3 允许类别；其中 workloom-case-active/evals/evals.json:15 含旧角色名词短语 "check executor"，属评测数据陈旧措辞，登记归子任务七文档层）
- `packages/core/resources/skills/workloom-case-active/evals/evals.json`（14 处）：①/历史夹具数据：skill 评测夹具与期望行为描述文本（AC3 允许类别；其中 workloom-case-active/evals/evals.json:15 含旧角色名词短语 "check executor"，属评测数据陈旧措辞，登记归子任务七文档层）
- `packages/core/resources/skills/workloom-case-archived/SKILL.md`（9 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/skills/workloom-case-archived/evals/build-fixtures.mjs`（6 处）：①/历史夹具数据：skill 评测夹具与期望行为描述文本（AC3 允许类别；其中 workloom-case-active/evals/evals.json:15 含旧角色名词短语 "check executor"，属评测数据陈旧措辞，登记归子任务七文档层）
- `packages/core/resources/skills/workloom-case-archived/evals/evals.json`（3 处）：①/历史夹具数据：skill 评测夹具与期望行为描述文本（AC3 允许类别；其中 workloom-case-active/evals/evals.json:15 含旧角色名词短语 "check executor"，属评测数据陈旧措辞，登记归子任务七文档层）
- `packages/core/resources/skills/workloom-continue/SKILL.md`（9 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/skills/workloom-finish/SKILL.md`（2 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/skills/workloom-migrate-plan/SKILL.md`（10 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/skills/workloom-update-spec/SKILL.md`（1 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/templates/case-result.md`（2 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/templates/case.md`（2 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/templates/research-facts.md`（2 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/third-party/mattpocock-skills/tdd/SKILL.md`（2 处）：① 第三方 skill 普通英文词（实施清单正文单列在案）
- `packages/core/resources/third-party/mattpocock-skills/writing-for-agents/SKILL.md`（2 处）：① 第三方 skill 普通英文词（实施清单正文单列在案）
- `packages/core/resources/workflow/workflow-light.md`（5 处）：① 语义词/工具名/模板字段名（与实施清单归属一致）
- `packages/core/resources/workflow/workflow.md`（35 处）：① 旧 stage 字样（归子任务七，用户已确认裁定）+ 语义词；kind: 参数字样零命中

## 结论

- 派发值域真消费点（盘点 §4 三张表 + plan 补充位点）零命中；全部剩余命中逐条归入①④允许类别（②③由检索式排除）。
- workflow.md 旧 stage 字样按用户已确认裁定标注「归子任务七」，不计残留。
- 与实施清单差异：resources 段 eval 夹具 5 文件（历史夹具数据，AC3 明文允许，实施清单未载已补归属）；src 段 records.ts 行位移 1 处（CASE 轮 P2 注释修复所致，已注明）。
- 复核：CASE 执行轮（check 子会话 335fd2ec）；证据：c3-src-hits.log、c3-resources-hits.log、c3-verification.log。
