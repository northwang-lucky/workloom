# executor foreground 移除真机验证清单（pi TUI）

本轮（删除 executor 专属 `foreground` 参数与前台链路）的 Pi 真机验证清单。
派发面已由主会话在真机 pi TUI 中执行并勾选（`adapter-pi/verify` 规定：
真机清单由主会话执行，dispatch subagent 的自述不构成真机证据）。

## 验证项

### ST-A. 扩展激活与命令面（本轮已执行）

- [x] **1. 扩展在 pi 真机加载且协议握手通过**
  新 scratch 目录启动 pi TUI 并加载仓库源扩展
  （`pi -e packages/adapter-pi/src/index.ts`）：无激活报错、无协议版本不匹配，
  `/workloom-init` 正常落盘 `.workloom/` 全套骨架。
  观察点：TUI 无 fail loud 输出；`ls .workloom` 见 tasks/spec/workspace/config.json。
  证据：会话面板原文 "Workloom initialized at /tmp/wl-pi-fg-<rand>." +
  "Created: .workloom, .workloom/tasks, .workloom/spec, .workloom/workspace, …"。
  说明：本项覆盖 workflow 契约版本 20 → 21 的真机握手（core 常量与 assets 同步 bump）。

### ST-B. 派发面（主会话已执行）

- [x] **2. 参数面不含 `foreground`（unknown 参数被 schema 拒绝）**
  在带可派发任务的 workloom 项目里，让主会话模型显式调用
  `workloom_execute({ kind, prompt, title, foreground: true })`。
  观察点：工具调用在 schema 校验阶段被拒（unknown/additional property），
  而不是"静默忽略后照常后台派发"；错误文案由 Pi 的参数校验产出。
  证据：Pi TUI 面板显示 `Validation failed for tool "workloom_execute":`
  与 `root: must not have additional properties`，收到参数中包含
  `"foreground": true`。

- [x] **3. 后台派发立即返回 childId + receipt**
  主会话调用 `workloom_execute`（不传 `foreground`）。
  观察点：工具结果立即返回 `{kind: "background", childId, receipt}`，不阻塞主会话；
  receipt 含生效 model/effort 来源 + injection 四元组（bytes/inlined/truncated/pointed/toolsAllowed）；
  `task.json` 的 `dispatches` 当刻即写入 `status: running`。
  证据：Pi TUI 面板显示 `Dispatched in background; child session:
  01a0a01b-79db-75c7-a1f3-d6dc8279dc23`，receipt 为
  `[workloom executor] model: fake-openai/fake-model (config: fallback);
  injection: 3.1KB, 1 inlined, 0 truncated, 0 indexed, 4 tools allowed`。

- [x] **4. 完成报告异步回投，且不存在前台阻塞分支**
  child 跑完后主会话收到 `customType: workloom-executor-report` 的完成通知
  （终文 + `[workloom executor report] executor completed (<kind>)`）。
  观察点：报告经通知送达（工具返回值不是报告）；`dispatches` 回填 `completed`；
  派发期间主会话可继续其它工具调用（无前台等待）。
  证据：同一派发先出现后台 receipt 与 `PARENT_DONE_10`，随后另起
  `[workloom-executor-report]` 块，内容为 `CHILD_BG_DONE` 与
  `[workloom executor report] executor completed (check)`；scratch `task.json`
  对应记录回填 `status: "completed"`。

- [x] **5. `continue_executor` 续用仍可用（同 kind）**
  对刚完成的 child 再调 `workloom_execute({ continue_executor: 'latest', … })`。
  观察点：投递进同一 child 会话（childId 不变），工具仍立即返回后台结果，
  receipt 标 `(reused)` 与 spawn 绑定值。
  证据：Pi TUI 面板显示 `Continued executor; child session:
  01a0a01b-79db-75c7-a1f3-d6dc8279dc23`，随后收到
  `[workloom-executor-report]`，内容为 `CHILD_CONTINUE_DONE`；scratch
  `task.json` 续用记录 `childId` 与首次成功派发相同，`modelSource: "spawn"`。

## 环境要求

- tmux 会话 + 全新 `/tmp` scratch 项目（避免污染真实项目）。
- 扩展从仓库源加载：`PI_BIN=$(which pi) pi -e packages/adapter-pi/src/index.ts`。
- ST-B 需要一个已 start 的 workloom 任务（派发链路要求活跃任务），
  建议在 scratch 项目内 `workloom_task_create` → 填 prd → `workloom_task_align` →
  `workloom_task_start` 后执行。
- 每次改代码后重启 pi 宿主再跑（扩展快照取自进程启动时刻）。
- 存活判定用 `ps -p <pid>`（`pgrep -f` 会自匹配验证命令本身）。

## 结果记录

| # | 结果 | 备注 |
|---|------|------|
| 1 | PASS | pi 0.84.2 真机：扩展加载无报错；`/workloom-init` 落盘全套骨架（面板原文见 ST-A 证据）；会话已 kill、scratch 已清理 |
| 2 | PASS | Pi TUI schema 校验拒绝 `foreground: true`，报 `root: must not have additional properties` |
| 3 | PASS | 不传 `foreground` 时立即返回后台 receipt，childId 为 `01a0a01b-79db-75c7-a1f3-d6dc8279dc23` |
| 4 | PASS | 后台工具结果后异步收到 `[workloom-executor-report]`，scratch `task.json` 回填 completed |
| 5 | PASS | `continue_executor: 'latest'` 续用同一 childId，续用记录 `modelSource: "spawn"` |

## 观察

- 本轮为纯删除（前台链路整体移除 + settle 恒定回投），后台派发与续用链路未改语义；
  ST-B 已确认宿主兑现 schema 拒绝，完成报告保持单份异步回投。
- 真实 pi 会话需先建任务才能派发：ST-B 通过 scratch 任务与 fake-openai 本地模型
  服务验证宿主工具管线，不依赖真实外部模型凭据；验证后 tmux 会话、scratch 目录、
  临时 Pi config 与本地 fake 模型服务均已清理。
