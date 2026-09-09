# Implement 计划：Pi 侧 executor 对齐 DSH

按 design.md 的 M1→M2→M3 推进；每个里程碑一轮 implement 派发 + 独立验收 + 独立提交（repo/commits）。实现前先读 implement.jsonl 所列 spec 与 parity 调研；所有新运行时文案英文、注释中文（repo/language）；重复字符串立常量（repo/code-style）；改动 TS 文件 LSP 诊断干净。

## M1：RPC transport + 后台派发 + settle/留痕 + title + 孤儿回收

1. 新增 `packages/adapter-pi/src/pi-rpc.ts`：严格 `\n` 分帧 reader（StringDecoder+buffer，处理尾部 `\r` 与 end 冲刷）；`createRpcConnection(child)`——sendCommand（递增 id、response 关联、success:false 抛错）、onEvent、close；坏行静默跳过。
2. 新增 `packages/adapter-pi/src/pi-child-registry.ts`：进程内活着表 + `.workloom/sessions/pi/registry.json` 落盘（core file-atomic 原子写）；扩展加载时孤儿清理（存活 pid SIGTERM、清空表）；主会话结束联动 SIGTERM。
3. 新增 `packages/adapter-pi/src/executor-settle.ts`：agent_end（成功终文，复用 extractExecutorText 语义）与 close/error（stderr 尾部 4KB 摘要）终态监听；core settleExecutorDispatch 回填（200 字符截断口径同 DSH）；`workloom-executor-report` 回投（display:true，失败 WARNING；前台不回投）。
4. 改造 `pi-args.ts`：`--mode rpc --session-dir <root>/.workloom/sessions/pi --no-extensions --name "[<KindLabel>] <title>"`；移除 `-p`；`-e`/`-t`/`--model`/`--thinking` 追加逻辑保持；KindLabel 口径对齐 DSH。
5. 改造 `executor.ts` 派发时序：spawn → get_state 取 sessionId → recordExecutorDispatch（running+childId+绑定）→ prompt 命令 → 默认后台立即返回 { childId, receipt }；`foreground: true` 等 settle 终文直接返回；ctx.signal → abort 命令 + SIGTERM；spawn/get_state/prompt 失败留痕 failed + fail loud。
6. `pi-events.ts`：保留行解析纯函数，移除 createInterface 绑定（由 pi-rpc reader 喂入）。
7. EXECUTOR_PARAMS 增加 `foreground`（M1 需要；continue_executor/reinject 留到 M2/M3 以免描述先行漂移）。
8. 单测：RPC 分帧（U+2028/U+2029 不分行、`\r\n`、end 冲刷）、response 关联与 success:false、settle 回填、留痕时机（running 先于 prompt）、孤儿清理；`pnpm --filter @workloom-ai/adapter-pi test`/typecheck 全绿。
9. 真机（pi TUI）：后台派发→报告回投可见→foreground 阻塞→取消→失败留痕→title 可见→主会话退出孤儿回收；结果记 task 目录 `verify-m1.md`。

## M2：续用 + steering + reinject

1. 新增 `packages/adapter-pi/src/executor-continuation.ts`：continue_executor 定位（latest/childId、同 kind 校验、跨 kind 拒绝、无记录 fail loud）；rebind 拒绝（与 DSH 逐字同文案，M2 先本地常量、M3 迁 core）；三分支投递（存活 idle→prompt；存活 streaming→steer；不存活→`--session <id>` 重启续接后 prompt）；reinject:true 重发全量 buildExecutorPrompt，默认增量。
2. EXECUTOR_PARAMS 增加 `continue_executor`/`reinject`。
3. 续用轮留痕：dispatches 追加条目（绑定字段按 DSH spawnBinding 语义标首派值）；settle/回投复用。
4. 单测：同 kind 校验、跨 kind 拒绝、rebind 拒绝、latest 定位、重启续接参数组装（--session id + --name 保持）。
5. 真机：continue_executor（latest/childId）→ reinject → mid-run steering 送达 → 不存活 child 重启续接；记 `verify-m2.md`。

## M3：文案统一 + norms + ADR 修订 + 归档清理

1. core `surface.ts`：titleExecutor 删 DSH-only 尾注；续用/rebind 拒绝文案上移共享常量；adapter-dsh executor.ts 改 import core（行为零变化）。
2. assets `workflow/workflow.md` norms Dispatch 段措辞 runtime 中性化（"subagent notice"→不绑定 DSH 机制的表述）；核对 2.1/2.2 步骤正文同源措辞。
3. ADR-0006 修订：adapter-pi executor.ts/agent-definitions.ts 头注释更新（动因/保持/否决，指向两份 research 文档）；parity 文档 §4 追加修订记录行。
4. transcript 归档清理：adapter-pi 在归档命令路径按 dispatches childId 对账清理 `.workloom/sessions/pi/` 关联 transcript（失败仅 WARNING）；core 归档流程不感知 runtime 文件。
5. `.workloom/sessions/pi/` gitignore 守护：核实 workloom init 的 gitignore 模板，有则同步，无则 registry 目录内放 `.gitignore`。
6. 双端回归：pnpm lint / -r typecheck / -r build / 双 adapter 测试全绿；adapter-dsh dist 重建 + 按 repo/deployment rsync 同步（dshweb 重启归用户）。
7. 复核 `docs/research/pi-web-subagent-support.md` §5：RPC 常驻下 PI_BIN 表述是否需更新。
8. 真机：DSH 侧工具面行为不变形抽查 + Pi 侧全链路复跑；记 `verify-m3.md`。

## 边界提醒

- child 无 workloom 扩展的结构性保证在每一步改造后必须保持（--no-extensions + 按需 -e 不动）。
- 首派 prompt 全量内联语义不变（fresh prompt 初衷）；续用默认增量、reinject 例外。
- 所有失败路径 fail loud 或 WARNING 降级，口径逐条对照 design §2–§4，禁止静默吞错。
