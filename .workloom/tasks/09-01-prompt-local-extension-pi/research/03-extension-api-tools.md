# 主题 3：ExtensionAPI / ExtensionContext 中列举当前工具集的接口

> 类型位置：`dist/core/extensions/types.d.ts`（0.84.2，本机路径 `/data00/home/wangyubo.1219/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`）。

## 1. ExtensionAPI（扩展工厂 `export default (pi: ExtensionAPI) => ...` 收到的对象）

有明确的三元组接口可供扩展**运行时探测与修改工具集**：

| 接口（types.d.ts 签名） | 语义 |
| --- | --- |
| `getActiveTools(): string[]` | 当前**激活**工具名列表（实现委托 AgentSession，见下） |
| `getAllTools(): ToolInfo[]` | 全部**已注册**（激活 + 未激活）工具，含参数 schema、prompt 指南、来源元数据 |
| `setActiveTools(toolNames: string[]): void` | 按名替换激活集；registry 中不存在的名字被忽略（对应 AgentSession.setActiveToolsByName） |

配套类型：

```ts
// types.d.ts
export type ToolInfo = Pick<ToolDefinition, "name" | "description" | "parameters" | "promptGuidelines"> & {
    sourceInfo: SourceInfo;
};
export type GetActiveToolsHandler = () => string[];
export type GetAllToolsHandler = () => ToolInfo[];
export type SetActiveToolsHandler = (toolNames: string[]) => void;
```

- `ToolInfo` 的 `sourceInfo: SourceInfo`（`dist/core/source-info.d.ts`）携带工具来源（内置/扩展路径/CLI 等），可供扩展区分工具归属。
- `ToolDefinition` 完整形态见同一文件（`name/label/description/promptSnippet/promptGuidelines/parameters/execute/...`）。
- 底层实现：`ExtensionActions`（types.d.ts 中 `getActiveTools/getAllTools/setActiveTools/refreshTools/...`）由 `ExtensionRunner.initialize()` 注入会话方法——对应 `AgentSession`：`getActiveToolNames()`、`getAllTools()`、`getToolDefinition(name)`、`setActiveToolsByName()`（`dist/core/agent-session.js:608-645`）。

## 2. ExtensionContext（事件处理器第二参数 ctx）

**没有直接列出工具的方法**。`ExtensionContext` 提供的是 `ui/mode/hasUI/cwd/sessionManager/modelRegistry/model/scopedModels/thinkingLevel/isIdle()/getContextUsage()/getSystemPrompt()/...`（types.d.ts）。工具探测只能通过扩展工厂闭包里的 `pi.getActiveTools()/pi.getAllTools()` 或经 `ctx.sessionManager` 读会话状态。

## 3. 时序约束（实现时注意）

- 扩展加载期（工厂函数同步段）注册工具；`ExtensionRuntime` 的 action 在 `runner.initialize()` 之前是 **throwing stubs**（types.d.ts 注释："actions are throwing stubs until runner.initialize()"），即工厂顶层直接调 `pi.getAllTools()` 会抛错。
- 可靠探测时机：**事件处理器内**（如 `session_start`、`agent_start`、`resources_discover`）或命令处理器内（`ExtensionCommandContext`）。
- 且扩展工具注册顺序：内置工具先入 registry，扩展工具随后并入（`agent-session.js:1990-1993` `_refreshToolRegistry`），事件处理器触发时全量已就绪。

## 4. 对 workloom 的意义

- 若未来给 child 挂 LSP 扩展并想验证"本会话工具集"，扩展内 `session_start` 事件后调用 `pi.getAllTools()` 即可拿到全量（含 `read/bash/edit/write/grep/find/ls` + 扩展工具名与来源）。
- 也可用 `pi.getActiveTools()` 拿到 LLM 实际可调用的激活集（默认 4 个）。
- workloom 侧要"探测 child 有什么工具"不需要扩展：`pi --mode json` 会话内可通过 `getActiveToolNames`/`getAllTools` 等方法，但 CLI 层无直接输出开关；更简途径是信任 `--no-extensions` 的静态结论（主题 1）。