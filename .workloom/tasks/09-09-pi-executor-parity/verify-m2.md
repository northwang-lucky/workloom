# M2 真机验证清单（pi TUI）

M2 里程碑（续用 + steering + reinject）的真机验证清单。
每项留待主会话安排真机 pi TUI 环境后勾选。

## 验证项

- [ ] **1. continue_executor = latest 续用**
  主会话先派发一个 executor（后台），完成后调用 `workloom_execute` 带
  `continue_executor: "latest"`，应续用同一 child 会话（不新建），
  child 收到增量指令并执行。

- [ ] **2. continue_executor = 显式 childId 续用**
  主会话调用 `workloom_execute` 带 `continue_executor: "<childId>"`，
  应续用指定 child 会话。

- [ ] **3. 跨 kind 拒绝**
  主会话派发 implement 后，用 `continue_executor: "<childId>"` + `kind: research`
  调用，应返回拒绝文案（cross-kind reuse rejected），不派发。

- [ ] **4. rebind 拒绝**
  主会话调用 `workloom_execute` 带 `continue_executor: "latest"` + `model: "x/y"`，
  应返回拒绝文案（continue_executor cannot be combined with model/effort），不派发。

- [ ] **5. reinject 全量重注入**
  主会话调用 `workloom_execute` 带 `continue_executor: "latest"` + `reinject: true`，
  child 应收到全量 buildExecutorPrompt 上下文（非仅增量指令）。

- [ ] **6. mid-run steering 送达**
  child 处于 streaming 状态时，主会话调用 `workloom_execute` 带
  `continue_executor: "latest"`，增量指令应经 RPC `steer` 命令注入
  （当前回合工具执行完、下次 LLM 调用前送达）。

- [ ] **7. 不存活 child 重启续用**
  child 进程已退出后，主会话调用 `workloom_execute` 带
  `continue_executor: "latest"`，应自动 `pi --session <id> --mode rpc` 重启续接
  （--name 保持原标题），child 收到增量指令并执行。

## 环境要求

- pi 0.84.2+（支持 `--mode rpc`、`--session`、`steer` 命令）
- 项目已 `workloom init`（含 `.workloom/` 目录）
- `PI_BIN` 环境变量指向 pi 可执行文件（或 pi 在 PATH 上）

## 结果记录

| # | 结果 | 备注 |
|---|------|------|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
