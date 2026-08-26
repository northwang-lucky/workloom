## Goal

让用户能在 `.workloom/config.yaml` 中按 executor 类型（research/implement/check）配置子代理的默认 `model` 与 `effort`, 使派发的 executor 子代理在未显式指定参数时使用配置值, 而无需每次调用工具时重复指定。

## Requirements

1. `config.yaml` 新增顶层字段 `subagents`（snake_case 无关, 字段名即 `subagents`）:

   ```yaml
   subagents:
     research:
       model: deepseek-v4-flash
       effort: high
     implement:
       model: deepseek-v4-pro
       effort: high
   ```

2. 配置 key 为 executor kind（`research` / `implement` / `check`）, 与 core 的 `EXECUTOR_KINDS` 对齐; 一个 kind 的条目内 `model` 与 `effort` 均为可选, 可只配其中一个。
3. 优先级: 工具调用参数 > 配置文件, 且 **model 与 effort 独立合并**——工具参数只覆盖自己出现的字段, 未出现的字段回退到配置值, 配置未配时保持现状（model 回退到父会话模型, effort 不写 header）。
4. 未知 key 容错: `subagents` 下不限 key 集合（不按 kind 白名单拒绝未知 key, 可容纳未来新增 kind / 拼写错误）, 但每个 entry 统一严格结构校验, 结构非法 fail loud。
5. effort 档位校验（`assertEffort`）由 executor 消费端对合并后的 effective effort 统一执行; config 解析只做结构校验（type 为 string）, 避免 `config.js` ↔ `executor-context.js` 循环依赖。
6. 合并逻辑收敛到 core: 新增纯同步函数 `resolveSubagentDefaults(config, kind, overrides)`（放 `legacy/config.js` 或就近模块）, 两个 adapter 只消费结果, 不各自内联合并。
7. 两个 adapter（adapter-dsh / adapter-pi）的 `workloom_execute` 均在派发前 `loadConfig(root)` 并应用合并结果。
8. 更新 `PARAM_DESCRIPTIONS.model` / `PARAM_DESCRIPTIONS.effort` 文案, 反映"默认回退到 subagents 配置"（两 adapter 共享, 同步生效）。
9. 仓库自带的 `.workloom/config.yaml` 增加 `subagents` 注释示例（注释文案英文, 与文件现有风格一致）。

## Acceptance Criteria

1. `loadConfig` 解析 `subagents`: 合法条目正确落入 `config.subagents`; 缺失时默认为空对象 `{}`。
2. 结构校验: entry 非对象 / `model` 非字符串 / `effort` 非字符串均抛 `WorkloomConfigError`（带字段路径 `subagents.<name>.model` 等）; 未知 key 且结构合法时不报错。
3. `resolveSubagentDefaults`: 参数覆盖配置（model、effort 各自独立）、无参数时回退配置、均无时返回 undefined; 不引入对输入的可变修改。
4. adapter-dsh: 有效 model 进入 `agentOptions.model`; 有效 effort 经 PoC P1 通道写入 `reasoningEffort` header（复用现有 writeEffortHeader 路径）; 配置值非法 effort 时 fail loud。
5. adapter-pi: 合并后的 model/effort 进入 `buildChildPiArgs`（`--model` / `--thinking`）。
6. 新增/更新的单元测试全部通过; `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 绿色。
7. 工具参数描述文案更新后, 模型可见的 tool 描述准确反映回退行为。

## Notes

- 消费端 loadConfig: DSH 已在 `findWorkloomRoot` 后拿到 root; Pi 同理（`cwd` → `findWorkloomRoot`）, 每次工具调用读一次 config 文件（与现有 `buildExecutorPrompt` 内部 loadConfig 行为一致, 可接受）。
- effort 写入失败仍为 WARNING 不阻塞（走现有 EFFORT_WARN_PREFIX 通道）。
- `surface.test.js` 仅断言文案非空, 更新描述文案不破坏测试。
- 行为边界: 本机制只作用于 `workloom_execute` 派发的子代理; 其他子代理工具（如有）不适用。
