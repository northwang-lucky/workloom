# 重命名 session_auto_commit 并移除 context_injection

## Context

`session_auto_commit` 这个配置字段的字面含义是"会话自动提交"，但代码里它只在任务归档流程中被读取（`task-ops.ts` 的 `autoCommitIfEnabled`），提交信息也用 `ARCHIVE_COMMIT_PREFIX`。名字与实际行为不符，会误导使用者。

`context_injection` 字段在运行时已无消费者。三个子字段 `max_file_bytes`、`max_artifact_bytes`、`max_total_bytes` 只在配置加载和默认值里出现，`prompt-compose` 的测试也确认大 CASE 改为只出指针，不再依赖这项预算。字段残留会让使用者以为它仍然生效，例如 `session-context.ts` 的截断提示仍在建议调高这个字段。

## Goal

配置字段的命名与实际行为一致，已退役字段不再残留在代码和文档中，使用者不会被失效的配置项误导。

## Scope

- 把磁盘字段 `session_auto_commit` 改名为 `archive_auto_commit`，运行时字段 `sessionAutoCommit` 改名为 `archiveAutoCommit`。
- 不做旧字段兼容，旧配置里的 `session_auto_commit` 不再被识别。
- 彻底删除 `context_injection` 字段及其三个子字段，含运行时残留和提示文案。
- 同步更新源码、测试、SKILL 资产、资产 pin 测试、dist 构建产物、两版 README。
- 不改动其他配置字段的行为，不改动归档提交机制本身。

## Assumptions, Constraints and Dependencies

- 约束：core 的 dist 与 src 必须同 commit 入库，dsh-workloom 的 dist 同样重建。
- 约束：改动后两个包的 typecheck、lint、测试须通过。
- 依赖：无外部依赖。

## Requirements

- R1：配置层接受 `archive_auto_commit`，不再接受 `session_auto_commit`。
- R2：运行时配置对象的字段名为 `archiveAutoCommit`，默认值 true，归档流程读取该字段。
- R3：全局层白名单允许 `archive_auto_commit`。
- R4：`context_injection` 字段及其三个子字段从类型、默认值、解析逻辑、全局白名单中删除。
- R5：截断提示文案不再提及 `context_injection`。
- R6：SKILL 资产字段清单、资产 pin 测试与两版 README 同步到新字段集合。
- R7：dist 构建产物重建，与 src 一致。

## Acceptance Criteria

- AC1：覆盖 R1、R2，跑 `pnpm -r typecheck` 与两个包的 `node --test`，全部通过；grep 确认源码与测试中无 `session_auto_commit`、`sessionAutoCommit`。
- AC2：覆盖 R3、R4、R5，grep 确认源码与测试中无 `context_injection`、`contextInjection`、`maxFileBytes`、`maxArtifactBytes`、`maxTotalBytes`，截断提示改为不指向已删字段。
- AC3：覆盖 R6，资产 pin 测试通过，SKILL 字段清单为八个，README 两版字段表一致。
- AC4：覆盖 R7，`pnpm -r build` 后 dist 与 src 的字段定义一致，git 中 dist 与 src 同 commit 提交。

## Edge Cases and Failure Paths

- 旧配置文件仍写 `session_auto_commit`：按决定不兼容，字段被忽略，归档自动提交回退到默认值 true。此行为在 README 不单独说明。
- 全局配置写 `context_injection`：删除后该字段不在白名单，加载器忽略未知顶层字段，不会报错。

## Risks and Open Questions

- 无未决问题。三个设计决定已由用户确认：新名 `archive_auto_commit`、不兼容旧字段、建 light 任务。

## Alignment Decisions

- 新字段名用 `archive_auto_commit`，因为它只在归档时生效。
- 不做旧字段兼容，遵循团队代码优先规范。
- 用 light 任务，由主会话实现、自检、提交。

## References

- `.workloom/spec/repo/code-style`
- `.workloom/spec/repo/deployment`

## Notes

无。
