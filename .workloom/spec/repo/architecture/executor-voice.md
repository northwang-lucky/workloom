# executor voice

纪律文本分层：core 持 runtime 无关的 prompt 组装，dsh-workloom 持 runtime 纪律文本。

- rule: `packages/core/src/injection/prompt-compose.ts` 拥有 prompt 组装（runtime 无关，不含 lsp_ 与宿主专属字样）；`packages/dsh-workloom/src/dispatch/discipline-text.ts` 拥有 DSH 纪律文本（含 lsp_* 提及）；角色或纪律变更时两侧与测试同改
- rule: kind 指令常量过渡期栖身 core 的 dispatch/executor-kinds.ts，子任务四成组切换为角色枚举
- counter-example: 在 core 写 lsp_ 纪律字样，或在 dsh-workloom 重复实现组装逻辑
