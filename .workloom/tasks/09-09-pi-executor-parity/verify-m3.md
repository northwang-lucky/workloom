# M3 真机验证清单（pi TUI）

M3 里程碑（session 存储治理三件套：归档清理 + gitignore 守护 + shutdown 清表）的真机验证清单。
每项留待主会话安排真机 pi TUI 环境后勾选。

## 验证项

### ST-A. 工具描述无 DSH-only 残留

- [ ] **1. workloom_execute 描述无 continue_executor/continuable 承诺**
  主会话读取 `workloom_execute` 工具描述，确认不含 `continue_executor`、`continuable`、
  `reinject` 等 DSH-only 参数承诺（Pi schema 无此参数，模型照描述传参会被拒）。

- [ ] **2. 子会话工具描述无 DSH-only 残留**
  派发一个 child pi，检查 child 可见的工具描述中无 DSH-only 机制名词。

### ST-B. 一次后台派发冒烟

- [ ] **3. 后台派发返回 childId + receipt**
  主会话调用 `workloom_execute`（默认后台），应立即返回 `{kind: "background", childId, receipt}`，
  不阻塞主会话。receipt 含 injection 统计（bytes/inlined/truncated/pointed/toolsAllowed）。

- [ ] **4. child 完成回投报告**
  child 执行完毕后，主会话收到 `workloom-executor-report` custom message，
  含终文 + receipt 尾行。

- [ ] **5. 注册表落盘**
  派发后 `.workloom/sessions/pi/registry.json` 存在且含 `{entries: [{ownerPid, pid, sessionId, startedAt}]}`。

### ST-C. 归档清理 + shutdown 清表

- [ ] **6. 归档后 transcript 删除**
  主会话完成一个任务（create → start → check → archive），归档命令返回成功后：
  检查 `.workloom/sessions/pi/` 目录，被归档任务 dispatches 中 childId 关联的会话文件
  （`<childId>.json` / `<childId>.jsonl` 等）应被删除；未关联的文件保留。

- [ ] **7. 归档清理失败不阻塞归档**
  人为制造清理异常（如删除 sessions 目录权限），归档命令仍应返回成功
  （清理失败仅 WARNING，不阻塞归档主路径）。

- [ ] **8. shutdown 后 registry 空表**
  主会话退出（触发 session_shutdown 联动）后，`.workloom/sessions/pi/registry.json`
  应为 `{entries: []}`（空表），无残留条目。

- [ ] **9. workloom init 的 .gitignore 含 sessions/ 条目**
  新执行 `workloom init`，检查 `.workloom/.gitignore` 含 `sessions/` 条目
  （Pi child session transcripts 不被 git 追踪）。

## 环境要求

- pi 0.85.x+（支持 `--mode rpc`、`--session`、`steer` 命令）
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
| 8 | | |
| 9 | | |
