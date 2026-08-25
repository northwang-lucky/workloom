# Pi executor 派发：自研 spawn child pi，不依赖 pi-subagents

adapter-pi 的 executor 派发（W6/W7/W8）由「严格依赖 pi-subagents」改为自研实现：spawn 独立 child Pi 进程（`pi --mode json`），解析其 JSONL 事件流提取最终输出。该决定取代架构决策 #12 的「Pi 严格依赖 pi-subagents」，并撤销 P3 阶段为绕过 registerAgent 缺陷引入的文件式 agent 注册（写入 `~/.pi/agent/agents/`）。

## 背景

P3 真机验证（2026-08-26，Pi 0.84.2 + pi-subagents 0.53.0）暴露两个事实：

1. **registerAgent 跨扩展失效**：Pi 为每个扩展各建 ExtensionAPI 对象（loader.js `createExtensionAPI` 无共享缓存，探针扩展实证两扩展 pi 身份不同），pi-subagents 的 runtime registry 以对象身份做 WeakMap key，跨扩展注册必然 miss，派发报 `Unknown agent: <kind>`。工作区被迫改为文件式注册（写入 `~/.pi/agent/agents/workloom-<kind>.md`，依赖其懒扫描）——虽已实证可用，但把 agent 定义落到用户主目录，副作用不优雅。
2. **delegation 协议无内联 agent 定义通道**：0.53.0 与 0.56.0 的 `SubagentDelegationRequest` 逐行无差异，无 systemPrompt/definition 字段；除 registerAgent 外也无其他内存注册通道。

同时实证：`pi --mode json -p <prompt> --no-session --no-extensions --thinking <level> --model <m>` 输出逐行 JSON 事件流（session/agent_start/turn_start/message_start/update/end/tool_execution_*/turn_end/agent_end），子代理以独立进程运行、使用内置工具、事件格式清晰稳定；`--thinking` 档位原生支持 effort 映射；`--no-extensions` 使子代理只有内置工具（天然不含 workloom_execute，禁止再派发零成本）。pi-subagents 自身即「spawn child Pi + 解析同款事件流」的封装，自研走同一官方机制。

## Considered Options

- 维持 pi-subagents + 文件式注册：已实证可用，但引入重依赖（peer + 版本兼容风险）、agent 定义与运行时状态分离、写用户主目录的副作用，与 DSH 侧（adapter 自管子代理）语义不对称。
- 自研 spawn child pi（本决定）：依赖清零、agent 定义保留在 adapter 内存（`--append-system-prompt` 注入角色说明）、与 DSH 架构完全对称；代价是自维护事件流解析（约 250 行，pi-protocol 稳定，pi-subagents 与 Trellis 均为同路线先例）。
- 混合方案（自研执行 + pi-subagents 的 external-runs 登记做 TUI 展示兼容）：保留部分生态集成，复杂度最高，且仍依赖 pi-subagents 已安装——不采纳为首期，留作 Phase 3 可选增强（external-runs 注册表为全局 Map，不按 pi 身份，若启用可正常协作）。

## Consequences

- adapter-pi 移除 `pi-subagents` peerDependencies 与全部 import（delegation/agents 子模块）；`~/.pi/agent/agents/workloom-*.md` 写入逻辑与 `resolvePiAgentDir` 删除。
- executor 派发参数面固定为：`--mode json`、`-p <buildExecutorPrompt 产物>`、`--no-session`、`--no-extensions`、`--thinking <effort 同名档位>`、`--model <可选透传>`、`--append-system-prompt <角色说明>`、cwd = 会话工作目录、key 经环境变量继承。
- 新增事件流解析模块（adapter-pi 内，纯函数可单测）；取消 = AbortSignal 杀子进程；timeout 首期不设（与 DSH 对齐），turn budget 后续按需。
- 相关文档（architecture.md 决策 #12、architecture-delivery/workflows 的 Pi 列、phase2 规格 §4.7）同步修订；pi-plugin-mechanism.md 保留 registerAgent 兼容性事实与 json 事件流实证记录。
