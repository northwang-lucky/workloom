# Pi 侧 executor 对齐 DSH：后台派发 + 续用链路 + 描述层债务修复（ADR-0006 修订）

## Goal

把 adapter-pi 的 executor 派发面与 adapter-dsh 全量对齐（方向 C，用户 2026-09-09 确认）：消除 `docs/research/pi-dsh-executor-parity.md` §2 的 P1–P8 全部差异——后台派发 + 完成通知、continue_executor/reinject 续用、mid-run steering、派发留痕时机、子会话标题消费、描述层/norms 的 runtime 漂移——同时继承 ADR-0006 的两条设计初衷（fresh prompt 保证 fresh context；child 无 workloom 扩展保证零再派发），并完成 ADR-0006 修订记录。

## 已核实事实（对齐前置，来源见括号）

- 差异清单 P1–P8 与已对齐项基线：`docs/research/pi-dsh-executor-parity.md` §2/§3。
- pi 0.84.2（adapter-pi 本地开发基线）已具备全部所需 CLI 能力：`--mode rpc`（prompt/steer/followUp 命令、事件流、请求关联）、`--session <path|id>` 非交互续接、`--session-dir`/`PI_CODING_AGENT_SESSION_DIR` 隔离存储、`--name` 会话显示名（`-p` 模式同样可用，README 示例 `pi --name "release audit" -p ...`）（pi repo v0.84.2 tag README/docs）。
- RPC 成帧：官方明示 Node `readline` 不合规（按 U+2028/U+2029 分行），RPC 客户端必须按 `\n` 严格分行——现有 `createInterface` 读法在架构 R 下必须替换（pi docs/rpc.md）。
- 非交互模式（-p/json/rpc）不弹 trust prompt，按全局 `defaultProjectTrust` 处理项目资源；现状 spawn 已在此语义下工作，改造不新增信任面（pi README）。
- Pi 侧回投通道：扩展可用 `pi.sendMessage({customType, content, display})` 向主会话投递 custom message（inject.ts 已在用，参与 LLM 上下文）。
- DSH 侧对齐目标语义：默认后台（返回 childId+receipt）、settled notice 报告、continue_executor（latest/childId、同 kind、rebind 拒绝）、reinject、派发时刻写 dispatches(running) + settle 回填终态、失败留痕、`[<KindLabel>] <title>` 标题（adapter-dsh executor 头注释与 executor-continuation/settle）。

## Alignment Decisions

（对齐进行中：第 1 轮 frontier 已列出等待用户回答；已定决策与结论逐条记录于此。）

### 已定

- 整改方向 = C 全量对齐（含 P8 steering 与 P7 title），独立任务与 skill-packages-scan 并行（用户 2026-09-09 确认）。
- parity 对照沉淀为 `docs/research/pi-dsh-executor-parity.md`（已落盘）。
- 架构 = **R（RPC 常驻 child）**：每派发 spawn `pi --mode rpc --session-dir <专用> --name [<KindLabel>] <title>`；后台 = prompt 命令接受即返回（childId = pi 会话 id），settle = 监听 `agent_end` 事件回投报告；续用 = 同 child 再发 prompt（存活时）或 `--session <id>` 重启；steering = `steer` 命令。RPC 客户端自写严格 `\n` 分行（Node `readline` 不合规，官方明示）。`--no-extensions` 与按需 `-e` 保留（零再派发根基不动）。架构 S（resume spawn）否决：无法交付 P8。（用户 2026-09-09 确认推荐）
- child 会话存储：项目内 `.workloom/sessions/`、gitignore；transcript 随任务归档清理（审计摘要由 dispatches/jsonl 承载）。该目录仅 Pi 侧写入（DSH 子会话由宿主自有存储管理）；层级布局（是否 `.workloom/sessions/pi/` runtime 命名空间）见开放节点 R2-1。（存储位置/清理已确认，命名分支待定）
- 报告回投：新 customType `workloom-executor-report`、`display: true`；回投失败仅 WARNING（与 DSH notice 降级同口径）。（用户 2026-09-09 确认推荐）
- 孤儿回收：主会话结束联动 SIGTERM 全部存活 child，未完成派发回填 failed（摘要注明 host session ended）；pi 重启不收养孤儿，启动时清理残留进程表。（用户 2026-09-09 确认推荐）
- 留痕口径：与 DSH 完全同口径——childId = pi 会话 id、派发时刻写 dispatches(running)、settle 回填终态、spawn/prompt 失败也留痕 failed；Pi 侧 settle 模块命名 executor-settle（同名同职责）。（用户 2026-09-09 确认推荐）
- 描述层统一时机：任务完成时一次统一（Pi 参数面补齐 continue_executor/foreground/reinject 后，core TOOL_DESCRIPTIONS/TOOL_SNIPPETS/norms 恢复「两 adapter 逐字相同」，title 的 DSH-only 标注删除）；任务期间不做过渡文案。（用户 2026-09-09 确认推荐）
- 任务拆分：单任务，design/implement 按 M1（RPC transport + 后台 + settle/留痕 + title）→ M2（续用 continue/reinject/steering）→ M3（描述层/norms 统一 + ADR-0006 修订）里程碑推进，不拆子任务。（用户 2026-09-09 确认推荐）
- 验收口径：真机 pi TUI 清单（后台派发→报告回投→continue_executor 续用→reinject→steering→取消→失败留痕→title 可见）+ 单测（RPC 分帧客户端、settle 回填、续用同 kind 校验、孤儿清理）+ DSH 回归（文案统一后 DSH 工具面不变形）；真机结果记录进 task 目录。（用户 2026-09-09 确认推荐）

### 开放节点（第 2 轮 frontier）

R2-1. **sessions 目录布局**（由用户问题「sessions 是 pi 专用吗」引出；已确认仅 Pi 侧写入，剩命名分支）：
   - A. runtime 命名空间 `.workloom/sessions/pi/`——语义自解释，未来第三 runtime（如 opencode spike）直接加兄弟目录，归档清理对整棵 `sessions/` 生效。
   - B. 平铺 `.workloom/sessions/` + 文件名 runtime 前缀——少一层目录，混放后清理/排查靠文件名约定。
   - C. 顶层 `.workloom/pi-sessions/`——最直白，但 runtime 写死在顶层名，新 runtime 需再加顶层目录。
   - 推荐：A。

<!-- workloom:open-nodes=pending -->

## Requirements

（待对齐收敛后按 P1–P8 逐项填写目标行为。）

## Acceptance Criteria

（待对齐收敛后填写，基线为开放节点 8 的清单。）

## Notes

- 约束：ADR-0006 两条设计初衷改造后必须仍成立——fresh prompt（首派上下文全量内联语义不变）；child 零再派发（`--no-extensions` 与按需 `-e` 保留，RPC child 同样不加载 workloom 扩展）。
- 关联：`docs/research/pi-dsh-executor-parity.md`（事实基线）、`docs/research/pi-web-subagent-support.md`（pi-web 场景下 spawn transport 的 PI_BIN 依赖，本任务完成后该依赖形态可能变化，交付时需复核 §5）。
- 并行任务：tasks/09-09-skill-packages-scan（第 1 轮 8 个开放节点同样待用户回答）。
