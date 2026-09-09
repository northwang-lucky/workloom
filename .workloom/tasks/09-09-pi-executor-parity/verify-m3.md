# M3 真机验证清单（pi TUI）

M3 里程碑（session 存储治理三件套：归档清理 + gitignore 守护 + shutdown 清表）的真机验证清单。
每项留待主会话安排真机 pi TUI 环境后勾选。

## 验证项

### ST-A. 工具描述两端统一

- [x] **1. workloom_execute 描述两端逐字相同且 Pi schema 兑现**
  主会话读取 `workloom_execute` 工具描述，确认与 DSH 端逐字相同（含
  `continue_executor`/`reinject`/`foreground` 语义），且 Pi 的 EXECUTOR_PARAMS
  实际支持这三个参数（照描述传参不被 schema 拒绝）；`title` 描述无
  "only effective on the DSH adapter" 残留。

- [x] **2. norms Dispatch 段无 DSH 机制绑定名词**
  主会话 session-context 的 norms Dispatch 段无 "subagent notice" 类
  DSH 专属机制名词（改为 runtime 中性表述），纪律语义完整。

### ST-B. 一次后台派发冒烟

- [x] **3. 后台派发返回 childId + receipt**
  主会话调用 `workloom_execute`（默认后台），应立即返回 `{kind: "background", childId, receipt}`，
  不阻塞主会话。receipt 含 injection 统计（bytes/inlined/truncated/pointed/toolsAllowed）。

- [x] **4. child 完成回投报告**
  child 执行完毕后，主会话收到 `workloom-executor-report` custom message，
  含终文 + receipt 尾行。

- [x] **5. 注册表落盘**
  派发后 `.workloom/sessions/pi/registry.json` 存在且含 `{entries: [{ownerPid, pid, sessionId, startedAt}]}`。

### ST-C. 归档清理 + shutdown 清表

- [x] **6. 归档后 transcript 删除**
  主会话完成一个任务（create → start → check → archive），归档命令返回成功后：
  检查 `.workloom/sessions/pi/` 目录，被归档任务 dispatches 中 childId 关联的会话文件
  （pi 真实落盘名 `<时间戳>_<childId>.jsonl`，如 `2026-09-09T12-00-00-000Z_01a0….jsonl`）
  应被删除；未关联的文件保留。

- [x] **7. 归档清理失败不阻塞归档**
  人为制造清理异常（如删除 sessions 目录权限），归档命令仍应返回成功
  （清理失败仅 WARNING，不阻塞归档主路径）。

- [x] **8. shutdown 后 registry 空表**
  主会话退出（触发 session_shutdown 联动）后，`.workloom/sessions/pi/registry.json`
  应为 `{entries: []}`（空表），无残留条目。

- [x] **9. workloom init 的 .gitignore 含 sessions/ 条目**
  新执行 `workloom init`，检查 `.workloom/.gitignore` 含 `sessions/` 条目
  （Pi child session transcripts 不被 git 追踪）。

## 环境要求

- pi 0.84.2+（支持 `--mode rpc`、`--session`、`steer` 命令）
- 项目已 `workloom init`（含 `.workloom/` 目录）
- `PI_BIN` 环境变量指向 pi 可执行文件（或 pi 在 PATH 上）

## 结果记录

真机环境：pi 0.84.2 TUI（tmux）@ /tmp/pi-verify-m3（全新目录，含 workloom-init），扩展经 `-e packages/adapter-pi/src/index.ts` 加载仓库源码；2026-09-09 执行，认证快照 `dbe7e67`（ST-A/B/C 与缺陷 1–7 修复全部落地后）。

| # | 结果 | 备注 |
|---|------|------|
| 1 | PASS | rebind 拒绝文案真机捕获（Pi schema 解析 continue_executor+model 并返回与 DSH 逐字一致的拒绝文案）；"only effective on the DSH adapter" 全库零残留（ST-A check 已核） |
| 2 | PASS | 重启后注入的 Dispatch norms 第一条为 "arrives asynchronously in the main session"，无 DSH 机制绑定名词 |
| 3 | PASS | 后台派发立即返回 childId + receipt（injection 2.9KB / 1 inlined / 5 tools allowed） |
| 4 | PASS | `workloom-executor-report` 回投 TUI 可见，含注入标记行 + receipt 尾行，终文 M3-SMOKE-OK |
| 5 | PASS | registry.json 含 {ownerPid, pid, sessionId, startedAt}；sessions/pi/ 自守护 `.gitignore` 同步落盘（ST-C P2 兜底真机实证） |
| 6 | PASS | 归档（force+reason 留痕）后 transcript `<时间戳>_<childId>.jsonl` 被删除，registry.json 与 .gitignore 保留——后缀匹配对账真机生效 |
| 7 | PASS | chmod 500 制造 EACCES：归档照常成功，stderr 出英文 WARNING（workloom pi-child-registry: WARNING: failed to remove session file …），transcript 保留 |
| 8 | PASS | TUI SIGTERM → 运行中 child 被回收、registry.json 落盘空表（P3 打磨真机实证）、dispatches 回填 failed + `host session ended`；TUI 延迟数秒优雅退出属正常 |
| 9 | PASS | 全新目录 /workloom-init 后 `.workloom/.gitignore` 含 `sessions/` 条目（带注释） |

观察项（非缺陷）：pi 会话启动早于 init 时 session-context 快照不注入（inject 静默跳过，预期行为），重启会话后正常注入；非 git 目录归档时 auto-commit WARNING（git 本地化报错嵌入）不阻塞，行为正确。
