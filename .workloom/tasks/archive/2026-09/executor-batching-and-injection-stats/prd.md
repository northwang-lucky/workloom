# 执行器批处理纪律与注入体积可观测

## Goal

砍执行器的"碎步数税"（workloom check 实测 39.7 分钟：37 分钟推理、2.5 分钟工具，145 次碎粒度 bash），抑制每步上下文累积撑出的 200k-token 请求；让注入体积可观测，大任务顶格预算时立即可见。提供商佐证：deepseek-v4-flash-0731 在 2026-09-02 的 18 小时内 710 次调用、4 次限流、大量输入达 200k token 的请求。

## Requirements

1. **批处理纪律**（core `EXECUTOR_CONTRACT_BY_KIND`，implement/check 同句，命令式、无弱化词，逐字采用）：
   `Combine verification and comparison commands that do not depend on each other's output into a single shell invocation; one command per invocation wastes a reasoning round each.`
2. **工具输出紧凑纪律**（同位置、implement/check 同句，命令式）：
   `Keep tool outputs compact: read targeted ranges instead of whole files, cap search and list output, and prefer summaries over full dumps.`
3. **receipt 注入统计**：receipt 同行追加 `; injection: 18.3KB, 7 inlined, 0 truncated, 0 indexed`（KB 一位小数、四项数字；总字节取注入文本长度）；core `buildExecutorReceipt` 接收 stats，两 adapter 传参（DSH `executor.ts` 新派发与 `executor-continuation.ts` 续接、adapter-pi `executor.ts`）；续接派发同样显示。
4. 注入结构与预算不动（瘦身挂起，等可观测数据）。

## Acceptance Criteria

- `executor-context.test.js`：implement/check 纪律段含两句新纪律（逐字断言）。
- `adapter-dsh/test/executor.test.js`：新派发 receipt 含注入统计四元组；续接 receipt 同含。
- adapter-pi receipt 对称（其 receipt 测试若存在则同步断言）。
- lint/typecheck/build + 三包全量测试绿；`workflow.md` 不动。

**test-first 接缝**：S1 `executor-context.test.js`（纪律句）；S2 `adapter-dsh/test/executor.test.js` + core receipt（stats 传参）。

## Notes

- 证据：39.7 分钟拆解（推理 37 / 工具 2.5）；注入实测 17–33KB 未顶格（预算 128KB）；提供商 710/4/200k。
- 任务 B（`09-02-executor-background-and-continuation`，P1 待启动）：后台模式 + 派发时即记录 + 续接只传增量 + 派发 prompt 不复述上下文。
