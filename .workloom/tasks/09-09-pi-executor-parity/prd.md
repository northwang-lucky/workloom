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

### 开放节点（第 1 轮 frontier，均附推荐）

1. **架构选择 R vs S**（影响范围/验收/不可逆成本的核心决策）：
   - R = RPC 常驻 child（`pi --mode rpc --session-dir <专用> --name <title>`）：P1–P8 全部可对齐（steering 走 `steer` 命令）；代价是 child 生命周期管理（存活表、settle 监听、孤儿回收）+ 自写严格分行的 RPC 客户端。
   - S = resume spawn（去掉 `--no-session`，续用 = `pi --session <id> --mode json -p <增量>`）：改动小，title 可对齐（--name 在 -p 模式可用），但 **P8 steering 无法交付**。
   - 推荐：R——方向 C 的目标就是全量对齐，S 缺一角；且后台派发本来就需要 child 存活表与 settle 机制，R 一次建齐。
2. **child 会话存储与清理**：专用 session-dir 放哪、是否 gitignore、何时清理？
   - 推荐：`<root>/.workloom/sessions/`（项目内、gitignore），transcript 随任务归档时清理（dispatches/jsonl 已承载审计摘要，全量 transcript 无长期保留价值）。
3. **报告回投语义**：customType 命名、display 与否、主会话已不存在时的行为？
   - 推荐：新 customType `workloom-executor-report`、`display: true`（用户可见报告到达）；回投失败仅 WARNING（与 DSH notice 失败降级同口径）。
4. **孤儿回收**：主会话退出/重载/崩溃时常驻 child 的处置？
   - 推荐：主会话结束联动 SIGTERM 全部存活 child，未完成派发的 dispatches 回填 failed（摘要注明 host session ended）；跨 pi 进程重启不收养孤儿（启动时清理残留进程表文件）。
5. **留痕对齐细节**：childId 用 pi 会话 id；spawn/prompt 失败也写 failed 留痕——确认与 DSH 完全同口径（含 modelSource 字段语义）？
   - 推荐：完全同口径，settle 等价模块命名 executor-settle（与 DSH 同名同职责，降低双端维护心智）。
6. **描述层统一时机**：TOOL_DESCRIPTIONS/norms 的 runtime 漂移（P4/P5）在任务完成时一次统一（Pi 参数面补齐后恢复「两 adapter 逐字相同」，title 的 DSH-only 标注删除），任务期间不做过渡文案？
   - 推荐：一次统一，不做过渡——任务周期内漂移维持现状，可接受。
7. **任务拆分**：交付块 ≥3（M1 RPC transport + 后台 + settle/留痕 + title；M2 续用 continue/reinject/steering；M3 描述层/norms 统一 + ADR-0006 修订）——单任务分里程碑还是拆子任务？
   - 推荐：单任务、design/implement 按 M1→M2→M3 里程碑推进——三个里程碑强耦合于同一批文件（executor/pi-args/pi-events/core surface），拆分反而制造合并冲突。
8. **验收口径**：真机 pi TUI 验证清单（后台派发→报告回投→continue_executor 续用→reinject→steering→取消→失败留痕→title 可见）+ 单测（RPC 分帧客户端、settle 回填、续用同 kind 校验、孤儿清理）+ DSH 侧回归（描述文案统一后 DSH 工具面不变形）？
   - 推荐：按此清单，真机部分沿用 repo 既有「真机验证」惯例记录进 task 目录。

<!-- workloom:open-nodes=pending -->

## Requirements

（待对齐收敛后按 P1–P8 逐项填写目标行为。）

## Acceptance Criteria

（待对齐收敛后填写，基线为开放节点 8 的清单。）

## Notes

- 约束：ADR-0006 两条设计初衷改造后必须仍成立——fresh prompt（首派上下文全量内联语义不变）；child 零再派发（`--no-extensions` 与按需 `-e` 保留，RPC child 同样不加载 workloom 扩展）。
- 关联：`docs/research/pi-dsh-executor-parity.md`（事实基线）、`docs/research/pi-web-subagent-support.md`（pi-web 场景下 spawn transport 的 PI_BIN 依赖，本任务完成后该依赖形态可能变化，交付时需复核 §5）。
- 并行任务：tasks/09-09-skill-packages-scan（第 1 轮 8 个开放节点同样待用户回答）。
