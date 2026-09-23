# 实现计划：continue/finish 命令改造为 skill 并收紧自动提交工具 slug 约束

## 步骤

1. 新增两个 skill 资产。
   - 按 design.md「关键设计点 1」编写 `packages/assets/skills/workloom-continue/SKILL.md` 与 `packages/assets/skills/workloom-finish/SKILL.md`（front-matter 对齐 workloom-update-spec 格式，description 覆盖原命令触发场景）。
   - 删除 `packages/assets/commands/workloom-continue.md`、`workloom-finish.md`。
2. 更新 core。
   - 删除 `buildContinueGuidance`/`buildFinishGuidance`/`route-service.ts` 及相关导出与 surface 常量；`TASK_ARCHIVE_NOTE` 改写为 skill 引导。
   - `git.js` `gitAddCommit` 改 `(root, message, paths)`；archive/journal 调用方按 design.md 传入收窄后的路径列表。
   - task-ops 新增必填版 taskPath 解析，archive 改用；command-ops `executeJournalEntry` 新增必填 taskPath 并校验任务存在。
   - 同步 core 测试（删 continue/finish/route 用例，新增 slug 必填与暂存收窄用例）。
3. 更新 adapter-dsh。
   - commands.ts 删 continue/finish；skills.ts `SKILL_ASSETS` 加两条；archive/journal 工具 schema 的 taskPath 改/新增 required；同步测试。
4. 更新 adapter-pi。
   - commands.ts 删 continue/finish；sync-skills.mjs `SKILL_SOURCES` 加两条；archive/journal 工具 schema 同步；同步测试。
5. 更新 workflow 契约。
   - `packages/assets/workflow/workflow.md` step 3.1 与收尾段的命令引用改为「加载 workloom-finish skill」。
6. 验证。
   - LSP diagnostics 覆盖改动的 TS 文件。
   - `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`。
   - `cd packages/core && node --test test/*.test.js`。
   - `cd packages/adapter-dsh && node --test test/*.test.js`。
   - `cd packages/adapter-pi && bun test test/*.test.ts`。
   - 确认 `packages/adapter-pi/skills/` 构建产物含两个新 skill 目录；内容搜索确认发布面无 `/workloom-finish`、`/workloom-continue` 命令残留引用。
7. 复核与提交。
   - check executor 完整复核；记录 `workloom_task_check`。
   - 创建一个非空 commit，不主动 push。

## 实现约束

1. implement 阶段由 implement executor 修改实现文件，主会话不直接写实现代码。
2. skill/工具/运行时对外文案用英文，语义明确；源码注释用简洁中文说明设计意图。
3. legacy 模块（git.js/journal.js/task-store.js）保持纯 JS + JSDoc 约定。
4. 删除未被消费的入参、导出与测试，不留死代码。
5. 双 adapter 行为保持一致，schema/文案常量统一引 core surface。
