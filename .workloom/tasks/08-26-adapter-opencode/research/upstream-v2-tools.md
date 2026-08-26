# 上游调研：opencode v2 工具/MCP 通道进展（2026-08-26）

调研方式：GitHub REST API 实际抓取（issues/PRs/commits/releases），本地 1.18.23 源码交叉验证。结论均来自抓取结果。

## 结论一：MCP v2 —— 无已合并落地，设计未决

- `Issue #39937`「[FEATURE]: Add MCP registration to the V2 plugin context」：**open**，2026-07-31 后无更新（搁置约 4 周）。正文：v2 插件能 `ctx.skill.transform`/`ctx.tool.transform`（注：原文表述），但不能注册 MCP server；"exact API is open for design"。
- `PR #37684`「feat(mcp): bridge runtime-added MCP tools into the core tool registry」：**closed 未合并**（07-18 建 / 08-18 关）。根因：daemon/direct-prompt 的 `@opencode/MCP` 与 v2 `SessionRunner` 读工具的 `@opencode/v2/MCP` 是两个独立 Effect layer graph，`ToolRegistry.materialize` 只从静态 config 灌入；桥接需拉入 Location/Form/Integration/Credential 等无关依赖——**large layer-plumbing refactor**，故未合。
- 相关 open 项：PR #40013（fence runtime MCP tool reconciliation，08-01）、Issue #36462（normalize V2 MCP API naming，07-11）、Issue #37532（v2 MCP servers from config not recognized，07-17 直接 bug）、Issue #38808（V2 MCP tool name >64 chars，07-25）。
- 近 30 天 dev/v2 无 MCP→v2 工具通道实现提交。

## 结论二：插件自定义工具（v2 tool domain / Tools.Service 重设计）—— 方案清单在，无合并实现

- `PR #35869`「feat(plugin): add Tool domain to v2 plugin API」：**closed 未合并**（07-08 建 / 08-08 关）。正为 v2 Effect/Promise 插件加 `PluginContext.tool.transform()`（ToolDraft.register/unregister），未合。
- 计划/backlog（open 且久未更新）：Issue #34957（internal tool plugins expose gaps in public plugin API，07-02/07-05，~28 个核心服务 ranked backlog）、Issue #35364（V2 revisit tool plugin APIs and execute integration architecture，07-04，有 review scope + acceptance criteria）、Issue #36189（simplify plugin tool definitions）、Issue #35647（configure tool availability per session）。
- 最近在动：`PR #45219`「fix(plugin): support documented tool registration」：**open 未合并**，base `v2` 分支，2026-08-26 建。属 fix，非 Tools.Service 注册层重设计。
- 近 30 天 dev commit 无任何 Tools.Service/ToolRegistry 重设计提交。

## 结论三：节奏与时间窗口

- dev 分支近 30 天（07-27→08-26）：**415 commits，日均约 13.8**，无停摆日。
- v2 分支同样活跃（最近提交集中在 08-25/08-26）。
- Release：最新 v1.18.23 @ 2026-08-25；v1.18.14→v1.18.23 20 天 10 个 patch（约每 2 天一个）；v1.18.23 notes 只含 provider/auth 修复，无 MCP/工具/插件。
- **无公开时间线证据**（无 milestone、无 roadmap、无合并中实现 PR）。若按中性推断：需先见 #35364 结论被接受 + 跨 layer graph 的桥接 PR（MCP）或 registry 重设计 PR（插件）被合并——目前均不存在。

## 恢复判据（watch 清单）

任一项被**合并**即可考虑恢复本任务实现（工具面）：

1. `PR #45219`（support documented tool registration，base v2）——虽为 fix，但若合并说明 v2 工具注册 API 开始生效
2. 任何新的 MCP→v2 ToolRegistry 桥接 PR（对标 #37684 的复活或等价实现）
3. 任何 v2 plugin tool domain（ToolDraft register）的实现 PR
4. 公开 roadmap/release notes 明确 v2 工具/MCP 通道排期

## 来源

- issues/PRs 链接见上文各条目；commits 见 https://github.com/anomalyco/opencode/commits/dev ；releases 见 https://github.com/anomalyco/opencode/releases
