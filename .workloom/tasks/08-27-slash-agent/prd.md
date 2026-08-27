## Goal

slash 命令（init/continue/finish）失败时不再把原始错误文本直接弹给用户，而是触发模型回合，由 Agent 用自然语言转述错误原因与建议操作，降低报错的理解成本。

## Requirements

- 失败呈现通道：**不再弹红错，全部由 Agent 转述**。命令失败时通过 followup（DSH）/ sendUserMessage（Pi）注入错误上下文触发模型回合；DSH 返回 success 结果（文本简述已转交模型），Pi notify 用 info 级别。
- 成功路径同样由 Agent 收口：continue/finish 成功本已触发模型回合（指引资产即注入内容），维持现状；**init 成功时也注入模型回合**，由 Agent 转述初始化结果与后续建议。
- 转述模板归属：**core surface 常量 + 拼装函数**（如 `buildErrorRelayText(command, errorText)`），两 adapter 共享；不为一句话模板引入 assets 文件。
- 转述范围：**全部失败统一转述**——业务校验失败（脏文件、无活跃任务）与内部错误（missing asset、git 失败、cwd 为空）同一出口，注入文案保留原始错误消息。
- 测试先行：**是（A）**。接缝：1) 转述文案拼装函数；2) core 编排失败/init 成功的返回形态；3) adapter-dsh 投影（失败不再 error kind、触发 followup）；4) adapter-pi 投影（失败不再 notify error、触发 sendUserMessage）；5) 成功文案更新。

## 设计决策

1. 转述拼装函数放 core surface 层，签名 `buildErrorRelayText(command, errorText)` 与 `buildSuccessRelayText(command, resultText)`（成功/失败两个函数，语义各自独立）；编排层签名不变，adapter 拿到 err/text 后自行拼装注入。
2. init 成功注入内容 = init 结果原文 + 转述指令（说明初始化了什么、建议下一步）。
3. 注入模型的指引文本用英文（运行时文案惯例），指令要求模型按用户语言回复。

## Acceptance Criteria

1. 三个命令任一失败时：DSH 不返回 error kind（改 success，文本说明已转交模型）且触发模型回合；Pi 不再 notify error（改 info）且 sendUserMessage 触发回合；注入文案含命令名与原始错误消息。
2. init 成功时：两 adapter 均注入模型回合，注入文案含 init 结果原文。
3. continue/finish 成功路径行为不变（指引资产注入 + 成功提示）。
4. 五条测试接缝全部先失败后实现，覆盖两 adapter。
5. `pnpm lint`、`pnpm -r typecheck`、core 与两 adapter 测试命令全绿。

## Notes

- 转述拼装逻辑放 core（runtime 无关），adapter 仅投影；两 adapter 行为对称。
- 改动面：core surface.ts（模板常量 + 拼装函数）、adapter-dsh/commands.ts、adapter-pi/commands.ts，及各自测试。command-ops 编排签名不变。
- 不新增 assets 文件；workflow.md 契约不受本特性影响（命令行为细节不进契约）。
