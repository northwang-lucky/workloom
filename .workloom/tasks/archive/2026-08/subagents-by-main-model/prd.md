# subagents 配置支持按主 Agent 模型分档（subagent_profiles）

## Goal

把 `.workloom/config.yaml` 的 subagents 配置升级为「带 whenMain 条件的 profile 列表」，使子代理（research/implement/check/frontend）的 model/effort 配置能按主会话当前 Agent 模型分档生效；配置为 profile 与旧 subagents map 并存，profile 优先级更高。

## Requirements

### 配置形态（已确认）

- 顶层字段 `subagent_profiles`：数组，顺序即匹配顺序。
- 每个条目 `{ whenMain?: string | Record<runtime, string>, subagents: Record<kind, {model?, effort?}> }`；无 `whenMain` 的条目 = 兜底配置。
- 内层 `subagents` 沿用现有 per-kind 形态（model 支持 string 或 per-runtime map，effort string）。
- 与旧顶层 `subagents`（map 形态）并存，优先级更高；旧字段解析路径保持不变（非破坏性变更）。

### 匹配与级联（已确认）

- 数组从头遍历：无 `whenMain` 的条目无条件命中，有 `whenMain` 的条目在主模型匹配时命中；取第一个命中的条目。
- 命中条目未配置某 kind 时，该 kind 依次回退：旧 `subagents.<kind>` → 仍缺则继承父会话（kind 级联）。
- `subagent_profiles` 缺失或为空数组：直接回退旧 `subagents`，行为与现状完全一致。
- model/effort 字段独立合并；解析有效值的总链（逐字段）：显式参数 > 命中 profile 条目字段 > 旧 `subagents` 字段 > 继承父会话。
- 冲突检测（detectExecutorConflicts）：显式参数与「合并后的配置层值」两段归一化比较，逻辑与现状一致，配置层改按上述合并链。

### 校验（已确认）

- `whenMain` 为 string：必须完整 `provider/model` 形式（首个 `/` 前、后均非空），否则 WorkloomConfigError。
- `whenMain` 为 map：每个 value 同样完整形式；当前 runtime 缺 key → 该条目不匹配（跳过），不报错。
- 歧义 fail loud：多个无 `whenMain` 的条目必须报错；两条目 `whenMain` 条件重叠判定（grilling Q1 已定）：按 runtime 展开比较，任意一个 runtime 上匹配值相同即报错，报错信息写明冲突的 runtime 与值。
- 内层 `subagents.<kind>.model` 的 per-runtime map 缺当前 runtime key 仍 fail loud（沿用现状口径）。

### 运行时行为（grilling 已定）

- 主模型取不到（DSH `requestHeader()` 无记录 / Pi `ctx.model` undefined）：一律视为不匹配——跳过所有 whenMain 条目，走兜底 / 旧 `subagents`，不 fail loud。
- 可观测性：receipt 来源标注细分——`(config: whenMain=<值>)` / `(config: fallback)` / `(config: legacy)`；冲突提示同样标注配置侧来源。`(param)` 语义不变。

### 主模型来源（实现侧调研结论）

- DSH：`exec.agent.session.requestHeader()?.config`（会话日志最新 request/header 快照的 provider/model/reasoningEffort，反映运行中切模型）。
- Pi：ExtensionAPI 工具 ctx 的 `ctx.model`（当前模型）。

### 迁移范围

- 非破坏性：`.workloom/config.yaml` 保留旧 `subagents` 作默认层，可选增配 `subagent_profiles`；`config.example.yaml` 更新为双字段并存示例与优先级说明；`config.local.yaml`（gitignore）本地自行处理。

## Acceptance Criteria

test-first seams（已确认，A：L1+L2+L3 全进）：

- L1 `loadConfig` 解析层（core 纯函数，报错信息与解析结果可断言）：
  - `subagent_profiles` 数组解析；每条为 {whenMain?, subagents} 且内层沿用现有 entry 校验。
  - `whenMain` string 非完整 `provider/model`（无 `/` 或任一侧为空）→ WorkloomConfigError。
  - `whenMain` map 的每个 value 非完整形式 → WorkloomConfigError；value 类型非 string → WorkloomConfigError。
  - 多个无 `whenMain` 条目 → WorkloomConfigError；两个条目 `whenMain` 条件重叠 → WorkloomConfigError（判定粒度按 grilling 结论）。
  - 旧 `subagents` map 解析路径与现状完全一致（回归）。
- L2 `resolveSubagentDefaults` 合并层：
  - 顺序匹配：第一个命中条目生效；`whenMain` 为 per-runtime map 缺当前 runtime key 时该条目跳过；无 whenMain 条目无条件命中；全部未命中且无兜底 → 回退旧 `subagents`。
  - kind 级联：命中条目未配某 kind → 旧 `subagents.<kind>` → 仍缺 → undefined（继承父会话）。
  - 字段独立合并：model/effort 各自沿「显式参数 > 命中 profile 条目 > 旧 `subagents`」链解析，sources 正确标注（param/config 语义不变；profile 条目与旧字段均标 config）。
  - `subagent_profiles` 缺失/空数组 → 与现状逐字段等价。
- L3 `detectExecutorConflicts` 冲突层：
  - 配置侧生效值按合并链解析后与显式参数两段归一化比较（与现状同口径）。
  - force + reason 校验、冲突文本含配置值/传入值（行为回归）。

适配器主模型读取（L4，非 test-first，2.2 check 验证）：DSH 从 `exec.agent.session.requestHeader()?.config` 取主模型；Pi 从工具 ctx `ctx.model` 取主模型。

## Notes

- test-first 交付已确认（yes）；seams 清单待确认后写入 Acceptance Criteria。
- 开放点（待 grilling 收敛）：
  1. 重复 `whenMain` 条件的判定粒度（string 展开为全 runtime 同值后比较？任意 runtime 重叠即报错？）
  2. receipt / 冲突提示是否标注命中来源（whenMain=xxx / 兜底 / legacy）
