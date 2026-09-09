# M1 真机验证清单（pi TUI）

M1 里程碑（RPC transport + 后台派发 + settle/留痕 + title + 孤儿回收）的真机验证清单。
每项留待主会话安排真机 pi TUI 环境后勾选。

## 验证项

- [ ] **1. 后台派发立即返回 childId + receipt**
  主会话调用 `workloom_execute`（不传 `foreground`），工具应立即返回
  `childId`（= pi 会话 id）+ `receipt` 行（含生效 model/effort 及注入统计），
  不阻塞主会话。

- [ ] **2. 完成报告经 `workloom-executor-report` 回投且用户可见**
  child 完成后，主会话应收到 `customType: workloom-executor-report` 的
  CustomMessage（`display: true`），内容含终文 + `[workloom executor report]` 尾行。

- [ ] **3. `continue_executor`（latest 与 childId 两种取值）续用**
  注：`continue_executor` 参数面属 M2 范围，本轮仅验证后台派发产生的 childId
  可在 M2 续用。

- [ ] **4. `reinject` 全量重注入**
  注：`reinject` 参数面属 M2 范围，本轮不验证。

- [ ] **5. mid-run steering 送达**
  注：steering 属 M2 范围，本轮不验证。

- [ ] **6. 取消联动 SIGTERM 且留痕**
  主会话在 child 运行中 abort（ctx.signal），child 应被 SIGTERM 终止，
  task.json dispatches 对应条目回填 `status: failed` + 错误摘要。

- [ ] **7. spawn/prompt 失败留痕 failed**
  模拟 spawn 失败（如 PI_BIN 指向不存在路径），task.json dispatches 应留痕
  `status: failed` + 错误摘要，工具抛错 fail loud。

- [ ] **8. child 会话标题 `[<KindLabel>] <title>` 可见**
  在 pi 会话列表中，child 会话的标题应显示为 `[<KindLabel>] <title>`
  （如 `[Implement] fix login bug`）。

- [ ] **9. 主会话退出后孤儿被回收、重启后残留进程表被清理**
  主会话退出（session_shutdown）后，全部存活 child 被 SIGTERM，
  dispatches 回填 `failed`（摘要 `host session ended`）；
  重启后 `.workloom/sessions/pi/registry.json` 被清理（残留条目对应的 pid
  若存活则 SIGTERM，随后清空文件）。

- [ ] **10. registry.json 落盘/移除**
  派发时刻 registry.json 写入条目（pid + sessionId + startedAt）；
  条目移除以 child **进程 close 事件**为准（RPC child 常驻，settle 完成后
  进程仍存活、条目必须保留；主会话结束 SIGTERM 或进程自然退出才移除）。

## 环境要求

- pi 0.84.2+（支持 `--mode rpc`）
- 项目已 `workloom init`（含 `.workloom/` 目录）
- `PI_BIN` 环境变量指向 pi 可执行文件（或 pi 在 PATH 上）

## 结果记录

| # | 结果 | 备注 |
|---|------|------|
| 1 | | |
| 2 | | |
| 3 | | M2 范围 |
| 4 | | M2 范围 |
| 5 | | M2 范围 |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |
