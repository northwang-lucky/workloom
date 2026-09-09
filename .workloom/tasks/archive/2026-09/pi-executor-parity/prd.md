# Pi 侧 executor 对齐 DSH：后台派发 + 续用链路 + 描述层债务修复（ADR-0006 修订）

## Goal

把 adapter-pi 的 executor 派发面与 adapter-dsh 全量对齐（方向 C，用户 2026-09-09 确认）：消除 `docs/research/pi-dsh-executor-parity.md` §2 的 P1–P8 全部差异——后台派发 + 完成通知、continue_executor/reinject 续用、mid-run steering、派发留痕时机、子会话标题消费、描述层/norms 的 runtime 漂移——同时继承 ADR-0006 的两条设计初衷（fresh prompt 保证 fresh context；child 无 workloom 扩展保证零再派发），并完成 ADR-0006 修订记录。

## Scope 与非目标

- 范围：P1–P8 全部差异 + ADR-0006 修订 + 描述层/norms 统一。改动面：adapter-pi（executor、pi-args、pi-events、新增 RPC 客户端与 executor-settle、child 进程表）、core surface（TOOL_DESCRIPTIONS/TOOL_SNIPPETS/PARAM_DESCRIPTIONS 恢复逐字相同）、assets workflow 契约（norms Dispatch 段）、adapter-dsh（文案同步 + dist 重建）。
- 非目标：不切换到 pi-web 原生 subagent transport（其缺口见 `docs/research/pi-web-subagent-support.md` §4.2）；不采用 in-process `AgentSession`（保持进程隔离与零再派发的结构性保证）；不改 DSH 行为语义（仅文案统一）；不涉及 skill-packages-scan 任务范围。

## 已核实事实（对齐前置，来源见括号）

- 差异清单 P1–P8 与已对齐项基线：`docs/research/pi-dsh-executor-parity.md` §2/§3。
- pi 0.84.2（adapter-pi 本地开发基线）已具备全部所需 CLI 能力：`--mode rpc`（prompt/steer/followUp 命令、事件流、请求关联）、`--session <path|id>` 非交互续接、`--session-dir`/`PI_CODING_AGENT_SESSION_DIR` 隔离存储、`--name` 会话显示名（`-p` 模式同样可用）（pi repo v0.84.2 tag README/docs）。
- RPC 成帧：官方明示 Node `readline` 不合规（按 U+2028/U+2029 分行），RPC 客户端必须按 `\n` 严格分行——现有 `createInterface` 读法必须替换（pi docs/rpc.md）。
- 非交互模式（-p/json/rpc）不弹 trust prompt，按全局 `defaultProjectTrust` 处理项目资源；现状 spawn 已在此语义下工作，改造不新增信任面（pi README）。
- Pi 侧回投通道：扩展可用 `pi.sendMessage({customType, content, display})` 向主会话投递 custom message（inject.ts 已在用，参与 LLM 上下文）。
- DSH 侧对齐目标语义：默认后台（返回 childId+receipt）、settled notice 报告、continue_executor（latest/childId、同 kind、rebind 拒绝）、reinject、派发时刻写 dispatches(running) + settle 回填终态、失败留痕、`[<KindLabel>] <title>` 标题（adapter-dsh executor 头注释与 executor-continuation/settle）。

## Requirements

（按 parity 编号对齐目标行为。）

- R1（P2/P3）后台派发与完成通知：`workloom_execute` 默认后台——RPC child 的 prompt 命令被接受后立即返回 childId（= pi 会话 id）+ receipt；完成报告经 customType `workloom-executor-report`（`display: true`）回投主会话，回投失败仅 WARNING；`foreground: true` 走前台阻塞链路，等 `agent_end` 直接返回终文。
- R2（P1）续用：`continue_executor`（`latest` 或记录的 childId；同 kind 校验，跨 kind 返回拒绝文案；child 存活时直接向同一进程发 prompt，不存活时 `--session <id>` 重启续接）；`reinject: true` 全量重注入任务上下文，默认只发增量指令；`continue_executor` 与 model/effort 同传触发 rebind 拒绝（与 DSH 同文案）。
- R3（P8）mid-run steering：运行中的续用消息经 RPC `steer` 命令注入（当前回合工具执行完、下次 LLM 调用前送达）；取消经 SIGTERM 联动，dispatches 回填。
- R4（P6）派发留痕：派发时刻写 dispatches（status: running、childId、生效 model/effort 绑定与 modelSource）；Pi 侧 executor-settle 监听终态事件回填 completed/failed + 一行错误摘要；spawn/prompt 失败同样留痕 failed。
- R5（P7）子会话标题：child 以 `--name "[<KindLabel>] <title>"` 启动；`PARAM_DESCRIPTIONS.titleExecutor` 的 DSH-only 标注删除。
- R6 会话存储与孤儿回收：child 会话落 `<root>/.workloom/sessions/pi/`（gitignore；runtime 命名空间布局，未来 adapter 加兄弟目录），transcript 随任务归档清理；主会话结束联动 SIGTERM 全部存活 child 并把未完成派发回填 failed（摘要注明 host session ended）；pi 重启不收养孤儿，启动时清理残留进程表。
- R7（P4/P5）描述层与 norms 统一：Pi 参数面补齐 continue_executor/foreground/reinject 后，core TOOL_DESCRIPTIONS/TOOL_SNIPPETS/PARAM_DESCRIPTIONS 与契约 norms Dispatch 段恢复「两 adapter 逐字相同」，无 runtime 分支、无过渡文案。
- R8 ADR-0006 修订：记录 transport 从「json spawn 用后即弃」演进为「RPC 常驻 + 会话落盘」的动因与取舍；论证两条设计初衷保持——fresh prompt（首派全量内联语义不变）、零再派发（`--no-extensions` + 按需 `-e` 在 RPC child 上原样保留）。

## Acceptance Criteria

- 真机 pi TUI 清单（结果记录进 task 目录）：后台派发立即返回 childId+receipt → 报告经 `workloom-executor-report` 回投且用户可见 → `continue_executor`（latest 与 childId 两种取值）续用 → `reinject` 全量重注入 → mid-run steering 送达 → 取消联动 SIGTERM 且留痕 → spawn/prompt 失败留痕 failed → child 会话标题 `[<KindLabel>] <title>` 可见 → 主会话退出后孤儿被回收、重启后残留进程表被清理。
- 单测：RPC 分帧客户端（含 U+2028/U+2029 不分行用例）、settle 终态回填、续用同 kind 校验与跨 kind 拒绝、rebind 拒绝、孤儿清理、留痕时机（派发时刻写 running）。
- 双端回归：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、adapter-dsh 与 adapter-pi 测试全绿；描述/norms 文案统一后 DSH 工具面行为不变形（adapter-dsh 既有测试为基线）。
- 部署纪律：core/assets/adapter-dsh 的改动按 `repo/deployment` spec 同步构建产物。
- 里程碑各自可独立验收：M1（RPC transport + 后台 + settle/留痕 + title）、M2（续用 + steering）、M3（描述层/norms 统一 + ADR-0006 修订）。

## Alignment Decisions

### 已定（两轮用户确认，2026-09-09）

- 整改方向 = C 全量对齐（含 P8 steering 与 P7 title），独立任务与 skill-packages-scan 并行。
- 架构 = **R（RPC 常驻 child）**：每派发 spawn `pi --mode rpc --session-dir <专用> --name [<KindLabel>] <title>`；后台 = prompt 命令接受即返回（childId = pi 会话 id），settle = 监听终态事件回投报告；续用 = 同 child 再发 prompt（存活时）或 `--session <id>` 重启（不存活时）；steering = `steer` 命令。RPC 客户端自写严格 `\n` 分行。`--no-extensions` 与按需 `-e` 保留。架构 S（resume spawn）否决：无法交付 P8。
- sessions 布局 = **A：`.workloom/sessions/pi/`**（runtime 命名空间，gitignore，任务归档时清理；DSH 子会话由宿主自有存储管理，此目录仅 Pi 侧写入；未来 runtime 加兄弟目录）。否决 B（平铺+文件名前缀：清理/排查靠约定）与 C（顶层 pi-sessions：runtime 写死顶层名）。
- 报告回投：customType `workloom-executor-report`、`display: true`、失败仅 WARNING（与 DSH notice 降级同口径）。
- 孤儿回收：主会话结束联动 SIGTERM 全部存活 child，未完成派发回填 failed（摘要注明 host session ended）；pi 重启不收养孤儿，启动时清理残留进程表。
- 留痕口径：与 DSH 完全同口径——childId = pi 会话 id、派发时刻写 dispatches(running)、settle 回填终态、失败也留痕；Pi 侧模块命名 executor-settle（同名同职责）。
- 描述层统一时机：任务完成时一次统一，无过渡文案；title 的 DSH-only 标注删除。
- 任务拆分：单任务，design/implement 按 M1→M2→M3 里程碑推进，不拆子任务（三个里程碑强耦合于同一批文件，拆分制造合并冲突）。
- 验收口径：见 Acceptance Criteria（真机清单 + 单测 + 双端回归）。
- parity 对照沉淀为 `docs/research/pi-dsh-executor-parity.md`（已落盘）。

### UI 与 test-first 适用性

- UI：不适用（无前端呈现物，纯 runtime/adapter 层改造）。
- test-first：不强制整任务 test-first；单测随里程碑交付（Acceptance 已列必测面），行为验收以真机 pi TUI 清单为准——改造对象是进程编排与事件时序，真机信号优先于先行测试种子。

### 收敛摘要

- 覆盖节点：目标与价值（P1–P8 消除 + ADR 修订）、范围与非目标、环境约束（pi 0.84.2 基线已具备全部 CLI 能力、RPC 成帧约束、trust 语义不变）、可观察验收、UI/test-first 适用性、关键决策（架构 R、布局 A、回投/孤儿/留痕/文案时机/拆分）、边界路径（主会话不在、孤儿、失败派发、跨 kind 续用、rebind、重启残留）。
- 用户确认：第 1 轮方向 C + 8 项推荐（2026-09-09）；第 2 轮 sessions 布局 A（2026-09-09）。无剩余开放节点。

<!-- workloom:open-nodes=none -->

## Notes

- 约束：ADR-0006 两条设计初衷改造后必须仍成立——fresh prompt（首派上下文全量内联语义不变）；child 零再派发（`--no-extensions` 与按需 `-e` 保留，RPC child 同样不加载 workloom 扩展）。
- 关联：`docs/research/pi-dsh-executor-parity.md`（事实基线与决策记录）、`docs/research/pi-web-subagent-support.md`（交付时需复核其 §5：PI_BIN 依赖形态在 RPC 常驻架构下的变化）。
- 并行任务：tasks/09-09-skill-packages-scan 挂起中（第 1 轮 8 个开放节点待用户回答），与本任务无耦合。
