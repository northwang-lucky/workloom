# adapter-pi executor 自研派发行为规格

> 决策依据：docs/adr/0006-pi-executor-self-spawn.md。本规格是 adapter-pi 去掉 pi-subagents 依赖、自研 spawn child pi 的实现依据。
> 已实证事实（2026-08-26 真机，Pi 0.84.2 + qwen-token-plan-cn/qwen3.6-flash）：
> 1. `pi --mode json -p <prompt> --no-session --no-extensions --thinking <level> --model <m>` 输出**逐行 JSONL** 事件流，事件类型依次为 `session`（header）、`agent_start`、`turn_start`、`message_start/message_update/message_end`（assistant 的 thinking/text/toolcall 增量与完整 content）、`tool_execution_start/update/end`、`turn_end`、`agent_end`；
> 2. `--thinking` 档位 off/minimal/low/medium/high/xhigh/max 原生；`--append-system-prompt <text>` 追加角色说明；`--no-extensions` 子代理仅内置工具；key 经环境变量继承；子代理为独立进程，`--no-session` 不落会话盘。

## 1. 目标与范围

- 把 `workloom_execute` 的派发从 pi-subagents 事件总线改为自研 spawn：child `pi --mode json`，流式解析 JSONL，提取 assistant 最终文本返回工具。
- 本期范围：前台派发、文本结果、取消（AbortSignal）、错误路径；timeout/turn budget 不设（与 DSH 对齐，后续按需）。
- 范围外：结构化输出、后台派发、external-runs 登记（Phase 3 可选）。

## 2. 模块划分（packages/adapter-pi）

| 文件 | 职责 |
| --- | --- |
| src/pi-args.ts（新增） | 纯函数组装 child pi CLI 参数：buildChildPiArgs(params) → string[] |
| src/pi-events.ts（新增） | 事件流解析纯函数：parsePiEventLine(line, state) 与聚合器，文本提取、终止判定、错误行跳过 |
| src/executor.ts（改造） | dispatchAndWait 替换为 spawn（node:child_process）+ readline 解析 + 提取 + 取消/错误处理 |
| src/agent-definitions.ts（改造） | 删除 pi-subagents 类型 import（RuntimeAgentDefinition 本地化：仅保留 description/systemPrompt/公共字段形状） |
| src/agents.ts（删除） | 文件写入逻辑与 resolvePiAgentDir 整体移除 |
| src/constants.ts（改造） | 删除 NODE_ID_PREFIX/OWNER_RUN_ID_FALLBACK（pi-subagents 身份概念）；AGENT_ERR_PREFIX 按需保留 |
| src/delegation.ts（删除） | pi-subagents 协议投影移除（effortToThinking 逻辑并入 pi-args） |
| src/index.ts（改造） | registerExecutorAgents 调用移除 |
| package.json | peerDependencies 删 pi-subagents；delegation/agents import 清零 |
| test/（改造） | pi-args 与 pi-events 的 node:test 用例；agents.test.ts 改为测 agent-definitions 数据；delegation.test.ts 删除 |

## 3. pi-args：参数组装（纯函数）

```ts
export interface BuildChildPiArgsParams {
  prompt: string           // buildExecutorPrompt 产物
  kind: string             // research/implement/check（取角色说明用）
  model?: string
  effort?: string          // core 档位，调用方已 assertEffort
}
export function buildChildPiArgs(params: BuildChildPiArgsParams): string[]
```

行为：
1. 固定序列：`['--mode', 'json', '-p', prompt, '--no-session', '--no-extensions']`。
2. `--append-system-prompt` + 角色说明：取 EXECUTOR_AGENT_DEFINITIONS[kind].systemPrompt（kind 无定义抛错，ERR_PREFIX.executor）；说明文本**直接作为参数值**（几百字符级，命令行可承载，不落临时文件）。
3. effort 存在时追加 `--thinking <effort>`（同名直通）；model 存在时追加 `--model <model>`。
4. cwd 不进 args（spawn options 的 cwd 字段承载）。

## 4. pi-events：事件流解析（纯函数，可喂样例 JSONL 单测）

```ts
export interface PiEventState {
  textParts: string[]        // 已捕获的 assistant 文本块
  done: boolean              // agent_end 已见
  exitPending: boolean       // 进程已退出待判定
}
export function parsePiEventLine(line: string, state: PiEventState): void
export function extractExecutorText(parts: string[]): string   // 空 → EMPTY_OUTPUT_TEXT
```

行为：
1. 逐行 JSON.parse；解析失败或非对象行**静默跳过**（流可能混入非事件输出）。
2. `message_end` 且 `message.role === 'assistant'`：遍历 `message.content`，`type === 'text'` 的块把 `text` 追加进 `state.textParts`（thinking/toolCall 块忽略）。
3. `agent_end`：置 `state.done = true`。
4. 其余事件（agent_start/turn_*/message_start/update/tool_execution_*/session）不消费。
5. 提取：`textParts.join('')`，trim 后为空 → EMPTY_OUTPUT_TEXT。

## 5. executor：spawn 编排

1. executeTool 前段不变（cwd/root/assert/taskRelPath/buildExecutorPrompt，复用 core）。
2. 派发：
   - `spawn(process.env.PI_BIN ?? 'pi', buildChildPiArgs(...), { cwd, stdio: ['ignore','pipe','pipe'] })`（PI_BIN 环境变量便于测试/自定位 pi 路径）；
   - stdout 经 readline 逐行喂 parsePiEventLine；stderr 收集尾部（错误报告用，上限 4KB）；
   - 子进程 exit 后：`state.done` 为 true → 成功（提取文本）；否则 → 抛错（`workloom executor: child pi exited with code N` + stderr 尾部摘要）。
3. 取消：ctx.signal aborted → `child.kill('SIGTERM')` 并立即以 AbortError 结束工具（不等待 exit）；signal 在 spawn 前已 aborted → 不发请求直接抛（同现状）。
4. 返回：`{ content: [{type:'text', text}], details: { kind: 'foreground', runId: child.pid, status: 'completed' } }`。
5. 禁止再派发：child 用 `--no-extensions`，无 workloom_execute 工具（天然禁止，无需深度控制）。

## 6. agent-definitions 本地化

- 删除 `import type { RuntimeAgentDefinition } from 'pi-subagents/agents'`，本地定义 `ExecutorAgentDefinition { description: string; systemPrompt: string }`（公共字段 systemPromptMode/inheritProjectContext/maxSubagentDepth 是 pi-subagents 目录协议概念，随文件注册一并废弃；「不继承项目上下文」由 `--no-extensions --no-session` + fresh prompt 保证，「禁止再派发」由 §5.5 保证）。
- 三个 kind 的定义文案不变（英文、自写、禁照抄）。

## 7. 测试清单（node:test）

1. pi-args：effort 五档 → --thinking 同名；model 可选稀疏；固定参数序列完整；kind 无定义抛错（约 4 例）。
2. pi-events：样例 JSONL（含 text/thinking/toolCall 块的 message_end + agent_end）→ 文本提取；多轮 message_end 拼接；空输出 → EMPTY_OUTPUT_TEXT；坏行跳过；无 agent_end 不 done（约 5 例）。
3. agent-definitions：三 kind 完整、文案非空含 workloom 身份与禁止再派发（保留现有用例改类型）。
4. executor 静态：EXECUTOR_TOOL 描述不变（1 例，可选）。

## 8. 验证

`pnpm lint`、`pnpm format:check`、`pnpm -r typecheck`、`pnpm -r build`、`cd packages/adapter-pi && pnpm test` 全绿后 commit（中文 message）。随后真机重验：tmux 交互 + workloom_execute 派发（research 子代理真实运行）、cancel/错误路径、无 pi-subagents 依赖（`pi --no-extensions -e adapter` 下 executor 仍可用）。
