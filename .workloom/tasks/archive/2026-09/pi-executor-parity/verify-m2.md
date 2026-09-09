# M2 真机验证清单（pi TUI）

M2 里程碑（续用 + steering + reinject）的真机验证清单。
每项留待主会话安排真机 pi TUI 环境后勾选。

## 验证项

- [x] **1. continue_executor = latest 续用**
  主会话先派发一个 executor（后台），完成后调用 `workloom_execute` 带
  `continue_executor: "latest"`，应续用同一 child 会话（不新建），
  child 收到增量指令并执行。

- [x] **2. continue_executor = 显式 childId 续用**
  主会话调用 `workloom_execute` 带 `continue_executor: "<childId>"`，
  应续用指定 child 会话。

- [x] **3. 跨 kind 拒绝**
  主会话派发 implement 后，用 `continue_executor: "<childId>"` + `kind: research`
  调用，应返回拒绝文案（cross-kind reuse rejected），不派发。

- [x] **4. rebind 拒绝**
  主会话调用 `workloom_execute` 带 `continue_executor: "latest"` + `model: "x/y"`，
  应返回拒绝文案（continue_executor cannot be combined with model/effort），不派发。

- [x] **5. reinject 全量重注入**
  主会话调用 `workloom_execute` 带 `continue_executor: "latest"` + `reinject: true`，
  child 应收到全量 buildExecutorPrompt 上下文（非仅增量指令）。

- [x] **6. mid-run steering 送达**
  child 处于 streaming 状态时，主会话调用 `workloom_execute` 带
  `continue_executor: "latest"`，增量指令应经 RPC `steer` 命令注入
  （当前回合工具执行完、下次 LLM 调用前送达）。

- [x] **7. 不存活 child 重启续用**
  child 进程已退出后，主会话调用 `workloom_execute` 带
  `continue_executor: "latest"`，应自动 `pi --session <id> --mode rpc` 重启续接
  （--name 保持原标题），child 收到增量指令并执行。

## 环境要求

- pi 0.84.2+（支持 `--mode rpc`、`--session`、`steer` 命令）
- 项目已 `workloom init`（含 `.workloom/` 目录）
- `PI_BIN` 环境变量指向 pi 可执行文件（或 pi 在 PATH 上）

## 结果记录

真机环境同 verify-m1.md（pi 0.84.2 TUI @ /tmp/pi-verify，2026-09-09，认证快照 `327969c`/`f5080a6`/`4d0bd8d`）。

| # | 结果 | 备注 |
|---|------|------|
| 1 | PASS | latest 定位同 childId、同存活进程（pid 无变化），增量指令送达（a2 steer 轮） |
| 2 | PASS | 显式 childId 续用同进程（pid 2308050 无重启），EXPLICIT-CHILDID-OK 回投（a3 轮） |
| 3 | PASS | 拒绝文案 `cross-kind reuse rejected: session "…" belongs to a research dispatch…`，零脏留痕 |
| 4 | PASS | 拒绝文案与 DSH 逐字一致（`continue_executor cannot be combined with model/effort…`），零脏留痕 |
| 5 | PASS | receipt 注入统计 2.9KB/1 inlined（全量上下文规模），child 回显注入标记行（a4 轮） |
| 6 | PASS | child streaming（bash sleep）中续用经 steer 注入，STEER-RECEIVED/STEER2-RECEIVED 两轮实证；缺陷 6 修复后双 running 条目一次 agent_end 全部回填 completed |
| 7 | PASS | 外部 kill child 后条目随 close 移除；续用自动 `--session <id>` 重启：新 pid 2330585、同 sessionId、RESTART-OK、`--name` 保持（a5 轮） |
