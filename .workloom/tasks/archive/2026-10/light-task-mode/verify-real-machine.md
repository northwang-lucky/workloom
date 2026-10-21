# 真机验证清单：light-task-mode（adapter-pi 派发门禁与注入切换）

范围：验证本任务对 adapter-pi 执行器行为的改动——light 任务派发前门禁（spawn 前阻断）、force 豁免留痕、full 任务回归，以及注入切换（概览行与状态文案来自 workflow-light.md、norms 出自主契约）。

## 环境

- tmux 会话 `pi-verify-light`，结束后 kill。
- 全新 `/tmp/pi-verify-light` 临时项目目录。
- 扩展从任务 worktree 源码加载：`PI_BIN=$(which pi) pi -e /data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/10-21-light-task-mode/packages/adapter-pi/src/index.ts`，工作目录为临时项目。
- pi TUI 内先 `/workloom-init` 初始化临时项目。

## 验证项

1. **light 任务创建**：让 pi 建一个轻量任务。断言：task.json 的 `mode` 为 `"light"`。观察点：pi 回执文本 + `cat .workloom/tasks/*/task.json | grep mode`。
2. **派发前拦截**：对活跃 light 任务派发 implement 执行器。断言：返回拒绝文案（轻量任务由主会话包办语义），无子会话创建。观察点：pi 回执文本；task.json `dispatches` 无新增记录。
3. **force 豁免留痕**：同派发带 `force: true` 与 reason。断言：派发成功（回执正常），task.json `overrides` 含 `light_dispatch` 与所给 reason。观察点：回执文本 + task.json。派出的子代理用平凡提示词，立即结束即可。
4. **full 任务回归**：建缺省 mode 任务并派发。断言：task.json `mode` 为 `"full"`；派发不被 light 门禁拦截（回执正常）。观察点：task.json + 回执文本。
5. **注入切换**：light 任务活跃时，让 pi agent 引用其上下文中的 Workflow 概览行与当前状态指引首句。断言：概览行为轻量步骤集（`1.0 Start task | 2.1 Implement | 2.2 Self-check and record | 2.3 Commit | 3.1 Archive and record`），状态指引为轻量文案；norms 段含主契约派发硬约束及轻量豁免句。观察点：pi agent 的引用回复（模型引用上下文文本作为观察手段，允许措辞噪声，核对关键串）。

## 结果表

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 1 | PASS | create 回执含「模式：light（轻量任务，由主会话自己实现和自检，不派发执行器）」；task.json 落 `"mode": "light"` |
| 2 | PASS | 拒绝原文：「light task: executor dispatch is not available because the main session handles light tasks end to end (implementation, self-check, and commit) (pass force: true with a non-empty reason to bypass…)」；task.json `dispatches` 保持空数组 |
| 3 | PASS | force+reason 派发成功（子会话 01a15d94 completed）；task.json `overrides` 落 `{gate: "light_dispatch", tool: "workloom_execute", reason: "真机验证 force 豁免通道"}` |
| 4 | PASS | full 任务 task.json `mode: "full"`、`overrides` 空、派发正常记录 completed，light 门禁不误伤 |
| 5 | PASS（附注） | breadcrumb（before_agent_start，按轮动态）逐字切到 light 的 in_progress 文案（pi agent 引用确认）；快照装配在新投影链路下渲染正常（full 概览行逐字正确、No active task 行正确）；light 概览行受 pi session_start 一次性注入限制无法中途观察（既有设计，非本任务回归），mode 切换由 session-context/workflow-service 单测接缝覆盖 |

附带验证：light 任务 start 在无对齐凭证、无 jsonl、无 marker 下通过（planning → in_progress），轻量 start 门在 pi 真机同步生效。

## 观察记录

- pi 侧 session-context 快照仅 session_start（reason startup/new）注入一次：会话中途建/启任务快照不刷新（既有设计，本任务 diff 未触碰挂载点）。
- `/exit` 不是 pi TUI 的退出命令（会把后续输入当 prompt）；重建会话用 `tmux kill-session`。
- 中文 title 无法自动推导 kebab-case slug，需显式传 slug（既有行为）。
- 临时项目非 git 仓时 start 报 worktree 错，验证用 `worktree.enabled=false` 规避（与 light 门禁无关）。
