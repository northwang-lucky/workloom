# workloom_journal 工具行为规格

> 背景：W12（会话记录）落地缺口——收尾指引（assets/commands/workloom-finish.md 第 4 步）要求模型记录 journal，但 core 的 addSession 没有暴露为任何工具/命令，DSH 与 Pi 双端模型均无执行通道（2026-08-26 Pi 收尾真机验证发现）。
> 方案：新增模型可调工具 workloom_journal，双端注册；业务编排下沉 core（与任务工具同模式），adapter 只做薄投影。

## 1. 工具契约

- 工具名：`workloom_journal`（进 core surface 的 TOOL_NAMES/TOOL_DESCRIPTIONS/TOOL_SNIPPETS/PARAM_DESCRIPTIONS）。
- 参数（标准 JSON Schema 与 TypeBox 双形态，与既有任务工具一致）：
  - `title`：string 必填——journal 条目标题（core 校验：非空、无换行）。
  - `commit`：string 可选——work commit hash（无换行）。
  - `summary`：string 可选——会话总结（无换行）。
- description：`Record this session in the workloom journal (title + work commit hash + summary)`。
- snippet：`workloom_journal(title, commit?, summary?) — record the session journal`。

## 2. core 编排（command-ops.ts 新增，业务下沉）

```ts
export interface ExecuteJournalEntryParams {
  title: string
  commit?: string
  summary?: string
}
export async function executeJournalEntry(
  cwd: string,
  params: ExecuteJournalEntryParams,
): Promise<[Error | null, AddSessionResult | null]>
```

行为：
1. cwd 判空（ERR_PREFIX.command：「cannot determine the working directory of this session」）。
2. `readExistingDeveloper(cwd)`：无 .developer 身份 → err（`workloom command: no developer identity found; run the workloom init command first`）。
3. `addSession(cwd, { developer, title, ...(commit 非空 ? {commit} : {})，...(summary 非空 ? {summary} : {}) })`——空串视为未提供（与任务工具的空串过滤口径一致）。
4. err 转发；成功返回 AddSessionResult。
5. 自动 git 提交由 core addSession 内部按 config 处理（sessionAutoCommit + sessionCommitMessage），工具不做第二次提交。

## 3. adapter 薄投影

- adapter-dsh：新增 `src/journal-tool.ts`——`registerJournalTool(ctx)`（tools.register，标准 JSON Schema，execute 内联：requireCwd 后调 core executeJournalEntry，err 抛错，成功返回 AddSessionResult）；plugin.ts 追加注册调用。
- adapter-pi：新增 `src/journal-tool.ts`——`registerJournalTool(pi)`（pi.registerTool，TypeBox，含 promptSnippet；execute 内联：ctx.cwd → core executeJournalEntry，err 抛错，成功 `resultOf` 投影）；index.ts 追加注册调用。
- 两 adapter 的 journal 工具 execute 均为薄投影（无独立业务），不需要 adapter 侧新增单测。

## 4. 指引文本更新

`packages/assets/commands/workloom-finish.md` 第 4 步「Record」补一句执行通道：

`4. Record: record this session in the journal with the workloom_journal tool (title + work commit hash + summary).`

## 5. 测试与验证

1. core 测试（command-ops.test.js 追加）：
   - executeJournalEntry 成功：临时 .workloom 项目（init + .developer）→ 返回 journalFile/journalPath，journal 文件存在（约 2 例）；
   - 无 .developer → err 含 no developer identity；空 title → err 转发（约 2 例）；
   - surface.test.js 的 TOOL_SNIPPETS 键对齐断言自动覆盖新键。
2. 全量验证：`pnpm -r build`、`pnpm lint`、`pnpm format:check`、`pnpm -r typecheck`、三包 `pnpm test` 全绿；按部署同步纪律 rsync profile（不重启 dsh）。
3. 真机验证（模型换 qwen-token-plan-cn/qwen3.6-plus）：Pi 侧 finish 全链——模型调 workloom_journal 记录（journal 文件 + `chore: record journal` 自动提交）；DSH 侧由后续真机轮覆盖。
