# executor 并发闸改为按 kind 限制，默认每 kind 3、全局闸默认不限

## Goal

把 workloom subagent（executor）的并发限制重心从「全局闸默认 2」改为「按 kind 限制、每 kind 默认 3」：全局闸 `executor.max_concurrent` 保留但缺省改为 0（不限），kind 闸在未配置时兜底 3。开箱即可获得更合理的分 kind 并发上限，同时保留全局闸作为可选的总量保险。

## Requirements

1. **DEFAULT_CONFIG**：`executor.maxConcurrent` 缺省值 2 → 0（`packages/core/src/legacy/config.js`），0 = 不限语义不变。
2. **每 kind 默认 3**：`resolveSubagentDefaults` 返回的 `maxConcurrent` 在未配置时兜底为硬编码常量 3（`profileLayer.maxConcurrent ?? 3`）；显式配置 0 仍 = 该 kind 不限。配置入口不变：仅 `subagent_profiles[].subagents.<kind>.max_concurrent`，legacy `subagents` 层出现该字段仍 fail loud。
3. **配置解析维持现状**：`executor.max_concurrent` 字段保留、校验规则（非负整数）不变，无迁移逻辑。
4. **容量判定**：core `evaluateExecutorCapacity` 双层闸结构保留（全局闸 0 时天然不生效），kind 未知（空串）的记录不占任何 kind 槽——现状语义，接受。
5. **回执文案**：`formatAtCapacityReceipt` 在 kind 层拒绝且 globalLimit = 0 时省略 global 段（输出 `<kind> kind at capacity (3/3)`）；globalLimit > 0 时维持双层格式；全局层拒绝文案（`at capacity (X/Y)`）不变。
6. **init 脚手架模板**：两份模板（config.json / config.js）移除 `executor: { max_concurrent: ... }` 行（缺省已是不限，不再示范该字段）；`init.test.js` 对 DEFAULT_CONFIG 的断言随动。
7. **同步物**：`config.d.ts` 注释（「缺省 = 2」→「缺省 = 0」等）、adapter 两侧注释中涉及默认值的描述、相关测试（core config/init 测试、adapter-dsh executor 测试中断言默认值或回执文案的用例）。
8. **非目标**：session context「Executor profiles」注入行不展示并发上限（维持现状）；不改配置解析/校验规则；不做旧配置迁移；不动 docs/assets（无相关用户文档）。

## Acceptance Criteria

1. 全新项目不写任何并发配置时：每 kind 最多 3 个在途 executor（第 4 个同 kind 派发被 at capacity 回执拒绝），不同 kind 互不挤占；全局无总量限制。
2. `executor.max_concurrent` 显式配置 > 0 时全局闸照常生效，与 kind 闸取严；配置 0 或缺省时全局闸不生效。
3. `subagent_profiles[].subagents.<kind>.max_concurrent` 显式配置（含 0）覆盖默认 3。
4. kind 层拒绝且全局闸 = 0 时，回执为 `<kind> kind at capacity (<kindCount>/<kindLimit>)`，无 `global X/0` 段；全局闸 > 0 时回执维持双层格式。
5. `workloom-init` 生成的两份脚手架模板不再包含 executor 段。
6. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core / adapter-dsh / adapter-pi 三套测试全绿；测试覆盖新默认值（缺省全局 = 0、缺省 kind = 3、显式覆盖、0 = 不限）与新回执格式。
7. 部署闭环：dist/ 与 src 同 commit 入库并 push；`~/.dsh/profiles/web` 执行 `pnpm update @workloom-ai/adapter-dsh` 重钉锁后，用户重启 DSH 生效（重启不归 agent）。

## Notes

- 事实核查结论：docs/、README、packages/assets、executor 工具 schema 中均无 max_concurrent / 并发闸的用户文档描述，无需文档同步；唯一用户可见文案是 `formatAtCapacityReceipt` 的 at capacity 回执。
- 影响文件（预估）：`packages/core/src/legacy/config.js`、`config.d.ts`、`init.js`、`executor-capacity.js`（回执文案）、`packages/adapter-dsh/src/executor-capacity.ts`（注释）、`packages/adapter-pi/src/executor.ts`（注释）、对应测试文件。
- **部署流程（本机已改为远端 git 源安装）**：生产 profile 经 `github:northwang-lucky/workloom#path:packages/adapter-dsh` 安装，pnpm-lock 钉提交。变更循环：改 src → `pnpm -r build` + typecheck + 测试 → **dist/ 同 commit 重建入库**（core 与 adapter-dsh 的 dist 随源码提交，git 子目录安装不跑构建）→ push → 在 `~/.dsh/profiles/web` 执行 `pnpm update @workloom-ai/adapter-dsh` 重钉锁 → 生效需重启 DSH 实例。**重启由用户执行，agent 不自行重启**；旧 rsync 同步（dsh-sync-workloom）已退役，不再向本机 dsh 插件目录拷贝。细则见 `.workloom/spec/repo/deployment`。

## Alignment Decisions

### 已定决策

| 节点 | 决策 | 备选与否决理由 |
| --- | --- | --- |
| 全局闸去留 | 保留 `executor.max_concurrent`，缺省 2 → 0（不限） | 否决「彻底删除」（用户要求保留作可选保险）；否决「全局默认 3」（与按 kind 语义重复） |
| 旧配置兼容 | 解析逻辑维持现状，无迁移 | 字段保留故无兼容问题 |
| kind 未知记录 | 不占任何 kind 槽（现状），接受 | 否决「计入所有 kind」（保守但易误伤，实际极少发生） |
| 每 kind 默认值形态 | 硬编码 3 + 按 kind 覆盖 | 否决「新增全局默认值字段」（最简优先，用户选定） |
| 默认值落点 | `resolveSubagentDefaults` 兜底 `?? 3` | 内部实现细节，随推荐 |
| 回执文案 | globalLimit = 0 时 kind 层拒绝省略 global 段；> 0 维持双层格式 | 否决「global X/unlimited」（冗余）与「维持现状」（`X/0` 费解） |
| init 模板 | 移除 executor 行 | 否决「改 0 保留」（示范冗余字段）与「保留 2」（与新缺省矛盾） |
| session context 展示 | 不展示每 kind 上限，注入层不动 | 否决「展示」（范围控制，用户选推荐） |
| UI 适用性 | 不适用：纯配置/核心逻辑变更，无前端界面 | — |
| 测试先行适用性 | B —— 否，常规实现：seam 均为已有测试覆盖的纯函数/配置边界，改默认值令现有断言天然变红，同轮更新测试与代码 | 否决 A（红→绿纪律对默认值/文案调整增益小）与 C（无需单独圈关键路径） |
| 部署方式 | 远端 git 源安装：dist 同 commit 入库 → push → profile 目录 `pnpm update` 重钉锁；重启归用户 | 旧 rsync 同步已退役（用户告知 + 最新提交 c79cacc 证实） |

### 开放节点

无——全部节点已收敛（含测试先行 = B 常规实现），frontier 为空。

### 收敛摘要

覆盖根节点 1–8：目标（并发限制重心改为按 kind，缺省每 kind 3）、范围与非目标（不动解析规则/注入层/文档，无迁移）、环境约束（git 源部署闭环）、可观察验收（7 条）、UI 不适用、测试先行 = B、关键决策 11 项（见上表）、边缘路径（kind 未知不占槽、显式 0 = 不限、双层闸取严、回执格式分支）。用户已逐轮确认全部决策。

<!-- workloom:open-nodes=none -->
