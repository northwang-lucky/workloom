# workloom-case-archived 验收结论

- 总结：**通过**
- 范围：五个真实带技能场景，每个场景一次。
- 不带技能材料不参与通过判定；不生成评分、benchmark 或静态审阅页。

## 场景结论

### Archived PLAN uses current HEAD

- 结论：**通过**
- 说明：通过：默认验证当前 HEAD；新任务独立归档，历史 CASE/RESULT 仅作参考，原件清单一致。
- 证据：`eval-0-archived-plan-default-head/with_skill/run-1/`

### Legacy materials use an explicit ref

- 结论：**通过**
- 说明：通过：指定 ref 创建本地分支并在启动后恢复；实际代码内容为 ref 侧 base，原件清单一致。
- 证据：`eval-1-archived-legacy-explicit-ref/with_skill/run-1/`

### PRD-only archive is explicitly rebuilt

- 结论：**通过**
- 说明：通过：明确标记缺少 plan.md 并重建新 PLAN，真实执行完成，原件清单一致。
- 证据：`eval-2-archived-prd-only-rebuild/with_skill/run-1/`

### No path requires candidate selection

- 结论：**通过**
- 说明：通过：按 completedAt 列出合法候选并等待选择，light 被排除；本场景未创建任务或分支。
- 证据：`eval-3-archived-select-candidate/with_skill/run-1/`

### Invalid input fails without writes

- 结论：**通过**
- 说明：通过：外部路径与不存在的 ref 都在写盘前失败，未创建任务或分支，原件清单一致。
- 证据：`eval-4-archived-invalid-input-fast-fail/with_skill/run-1/`

## 补充说明

- 场景 2 的 sourceCommit 与 validationCommit 相同，是指定 ref 恰好等于归档记账提交的合法情况。
- 场景 1、2 的 PLAN 在批准后有追加修订，原始运行记录已披露。
- 用户要求只报告验收是否通过，因此本文件不包含评分、benchmark 或静态审阅页。
