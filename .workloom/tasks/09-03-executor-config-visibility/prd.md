# 执行器配置可见性与终态错误可观测

## Goal

消除 2026-09-03 两条 cardx 会话（session-2fe7e677 / session-eb22f744）暴露的
执行器治理盲区：主会话看不见三层配置的解析结果与执行器终态错误的真实原因，
只能靠 task.json override 留痕猜纪律、猜模型、猜失败原因，导致错误 force 覆盖
全局配置与 UNKNOWN_MODEL 三连误诊重试。

## Requirements

1. 会话上下文注入生效中的执行器画像（`Executor profiles` 节）：四个 kind 全量
   展示，紧跟 Active task 行。配置命中的行给出 model、effort、tools 配置
   （includes/excludes 原值，过长截断留计数）与来源标注
   `global/project/local config (whenMain match | fallback entry | legacy subagents)`；
   未配置的行标注 `not configured (inherits parent session model)`。首行带主会话
   模型；取不到时写 `main model unknown; whenMain entries skipped`（whenMain 条目
   跳过，展示兜底解析）。画像解析复用 `resolveSubagentDefaults`，不造第二套。
2. 配置来源 provenance：`loadConfig` 结果挂顶层字段 `subagentProfilesSource` /
   `subagentsSource`（`global | project | local`），记录该 key 最后写入层。函数
   工厂层返回文档含 `subagent_profiles` 时归工厂层，否则沿用低层 provenance。
3. 会话上下文注入最近派发状态（`Last dispatch` 节）：活跃任务存在派发记录时，
   紧跟画像节展示最新一条：`Last dispatch: <kind> <status> at <time> (child <id>)
   — <一行错误>`；completed 同样展示；无记录不输出。
4. 执行器终态错误落账（仅 DSH runtime）：全局 `session/event` 监听器对登记表内
   childId 捕获最近一次 `turn/end` 的 error（message + code）；subagent/end 且
   stopReason=error 时，将真实错误压成一行（上限 200 字符）整体替换写入
   `dispatches[].error`。登记缺失/提取失败回退现有泛化文案并记一条 WARNING，
   不阻塞结算。其余终态文案维持现状。监听器只消费 `turn/end` 且仅限登记表内
   childId。
5. `workloom_execute` 工具描述补覆盖语义警示：改 `core/src/surface.ts` 的
   `PARAM_DESCRIPTIONS`（model/effort 各补一句"传递即覆盖三层配置解析结果，仅
   用户明确要求时传递"），双 adapter 共用；`force`/`reason` 描述不动。
6. test-first：三条接缝先写失败测试——(a) 三层配置 → 执行器画像解析与来源层
   标注（core，含 provenance）；(b) 终态错误捕获与落账（adapter-dsh）；
   (c) 会话上下文注入文本组装（core，含画像节与派发行）。

## Acceptance Criteria

1. 单测：三条接缝的纯函数覆盖来源层合并、未配置回退、error 提取、解码失败
   回退、注入文本格式；core / adapter-dsh 全量测试绿。
2. 注入实证：重启后的 DSH 会话上下文可见四 kind 画像与来源层；活跃任务有
   失败派发时可见一行真实错误。
3. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 全绿；改动文件
   `lsp_diagnostics` 无错。
4. 部署走 `~/dsh/bin/dsh-sync-workloom`，用户重启后冒烟验证。

## Notes

### 范围外（本轮明确不做）

- Pi runtime 的终态错误提取（spawn 子进程 pi 错误面不同，留后续任务）。
- DSH core 结算通知改造（dsh-subagent settlementSummary 不动）。
- cardx 仓自身行为修复（其任务独立演进）。

### 根因证据（诊断留档）

- fe 会话：读 task.json override reason 当判例 + 只见项目层配置、不知全局层，
  误判"不 force 默认 = 父会话模型 k3"，主动 force 覆盖全局配置解析结果。
- eb 会话：裸 model id `deepseek-v4-flash` 被解析到错误 provider，子会话每轮
  UNKNOWN_MODEL；DSH 结算通知与 workloom settle 只映射 stopReason，真实错误
  不可见，主会话误诊 429 原样重试三次。
- `/tmp/figma-auth-handoff.md` 过时模型条款已加失效标注（2026-09-03）。
