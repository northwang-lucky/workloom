# Kimi Code runtime 适配 spike 报告

- 验证日期：2026-08-28
- 验证方式：podman 容器内真机验证（kimi v0.39.0，原生 x86-64 glibc 二进制）
- 验证模型：`kimi-code/kimi-for-coding`（全部显式 `-m` 指定，未依赖 config 默认 `kimi-code/k3`）
- 关联：`docs/research/kimi-code-plugin-support.md`（调研基线，第 9 节开放问题）

## 0. 环境与安装方式

- **容器方案**：podman 4.3.1 + podman-compose 1.6.0（无 docker）。容器 `kimi-spike`，基镜像 `node:26-trixie-slim`，
  `userns_mode: keep-id` + `user: 1001:1001`（宿主机 UID/GID 即 1001:1001，与 keep-id 映射一致）、
  `command: ["sleep","infinity"]` 保活、`working_dir: /work`、`HOME`/`KIMI_CODE_HOME`/`XDG_DATA_HOME` 重定向、
  外网经宿主 mihomo 代理 `host.containers.internal:7890`（http/https 大小写双写 + `NO_PROXY` 不含 external）、
  宿主机目录挂载加 `Z` 标签。compose 见 `.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/compose.yml`。
- **kimi CLI 安装**：宿主机 `~/.kimi-code/bin/kimi` 为 **182MB 原生 x86-64 glibc 二进制**（非 npm 包；官方 npm 包名 `@moonshot-ai/kimi-code`）。
  为避免容器内重复下载与 glibc 兼容问题，spike 采用**直接将宿主机 kimi 二进制只读挂载为容器内 `/usr/local/bin/kimi`**。
  **版本 0.39.0**。运行库：`libstdc++6`、`libgcc-s1`（影像在 `Containerfile.kimi` 中安装）。
- **登录状态**：容器内自建干净 `$KIMI_CODE_HOME=/home/tester/.kimi-code`，只从只读挂载的 `/host-kimi-code`（宿主机 `~/.kimi-code`）
  拷贝 `credentials/`、`oauth/`、`device_id`、`region`；`config.toml` 由宿主机副本剔除 `[[hooks]]` 生成（宿主机 hooks 指向容器内不存在的 flux 路径）。
  容器内 kimi **无需重新登录** 即可调用（登录态拷贝生效，见 V1 成功调用）。
- **模型约束**：config.toml 默认 `default_model = "kimi-code/k3"`；本任务全部显式 `-m kimi-code/kimi-for-coding`。

### 关键踩坑（适配器实现须注意）

- **`-p` 参数顺序**：`kimi -p <prompt>` 的 `-p/--prompt` 必须紧跟其值；把 `-m` 放在 `-p` 之后会被当作 prompt 值，
  使模型串被识别为未知子命令（`unknown command 'kimi-code/kimi-for-coding'`）。正确写法：
  `kimi -m kimi-code/kimi-for-coding --output-format stream-json -p "<prompt>"`。
- **hook/脚本可执行位**：kimi 的 hook `command` 是**直接 exec**（非 `bash file`）。脚本须有 `+x` 位，否则 hook 静默失败（fail-open），
  没有任何日志提示。注册 hook 前务必 `chmod +x`。

## 1. V1 —— `kimi -p --output-format stream-json` 输出协议

> 命令：`kimi -m kimi-code/kimi-for-coding --output-format stream-json -p "<prompt>"`

### 事实结论

- 输出为**换行分隔的 JSONL**，每行一个**完整消息事件**，并非逐 token 流式 delta。
- 判别字段是 **`role`**（非 `type`）：`role ∈ {meta, assistant, tool}`；单轮任务中**未出现 `role:"user"` 回显**。
- `role:"meta"` 事件带 `type` 字段，观察到两类：
  - `system.version`（首行，恒在）：`{"role":"meta","type":"system.version","version":"0.39.0"}`
  - `session.resume_hint`（成功时末行）：`{"role":"meta","type":"session.resume_hint","session_id":"...","command":"kimi -r <sid>","content":"To resume this session: kimi -r <sid>"}`
- 文本/工具事件的判别：
  - `{"role":"assistant","content":"<全文>"}` —— 一段完整 assistant 文本
  - `{"role":"assistant","tool_calls":[{"type":"function","id":"tool_<id>","function":{"name":"<工具名>","arguments":"<json串>"}}]}`
  - `{"role":"tool","tool_call_id":"tool_<id>","content":"<工具输出>"}` —— 应答前一条 tool_calls
- **无独立 reasoning/thinking 事件**：即便 `[thinking] enabled`，stream-json 也不输出单独的思考事件（或思考被并入最终 content，或未输出）。
- **退出码**：成功 0；失败 1。失败时 stdout 仍会先输出 `system.version` 元行，错误消息在 **stderr**：
  `error: failed to run prompt: Model "xxx" is not configured in config.toml.` + `See log: <path>`。

### 证据摘录

```
$ kimi -m kimi-code/kimi-for-coding --output-format stream-json -p "Reply with exactly the word: pong"
{"role":"meta","type":"system.version","version":"0.39.0"}
{"role":"assistant","content":"pong"}
{"role":"meta","type":"session.resume_hint","session_id":"session_...","command":"kimi -r session_...","content":"To resume this session: kimi -r session_..."}
```

工具调用场景（Write + Bash）：

```
{"role":"assistant","tool_calls":[{"type":"function","id":"tool_X","function":{"name":"Write","arguments":"{\"path\":\"...\",\"content\":\"hello\"}"}}]}
{"role":"tool","tool_call_id":"tool_X","content":"hello"}
{"role":"assistant","content":"The current working directory is `/work`, ..."}
```

错误场景（无效模型）：

```
$ kimi -m kimi-code/nonexistent-model --output-format stream-json -p "hi"; echo $?
1
stdout: {"role":"meta","type":"system.version","version":"0.39.0"}
stderr: error: failed to run prompt: Model "kimi-code/nonexistent-model" is not configured in config.toml.
```

### 对 adapter-kimi 设计的影响（executor 解析器）

- 解析器应**忽略 `role:"meta"`**（版本元行与 resume_hint），提取最终 `role:"assistant"` 的 `content` 作为交付文本。
- 工具循环需链式处理：收集 `assistant.tool_calls[]` → 匹配 `role:"tool"`（按 `tool_call_id`）→ 直到无 `tool_calls` 的 `assistant` 消息为终态。
- 判定失败：无最终 `assistant.content` 且退出码非 0 → 失败；错误消息从 **stderr** 取（stdout 只有版本元行），必要时解析日志路径。
- `stream-json` 非逐 token，**无法做增量 TUI 流式**，但足够 executor 一次性解析。

## 2. V2 —— `UserPromptSubmit` hook

> 经 config.toml `[[hooks]]` 或 plugin manifest `hooks` 注册；命令须可执行。

### 事实结论

- **payload（stdin JSON）字段结构**：
  `{"hook_event_name":"UserPromptSubmit","session_id":"...","cwd":"/work","client_type":"kimi_code_cli","prompt":[{"type":"text","text":"<用户输入>"}],"is_steer":false}`
  - 事件名字段是 **`hook_event_name`**（非 `event`）。
  - `prompt` 是**内容块数组**（`[{type:"text",text:"..."}]`），非纯字符串。
  - `is_steer` 为布尔（false）；`cwd` 为当前会话项目目录（`/work`）。
- **stdout 附加文本确实进入上下文**：hook stdout 被 kimi 附加 **`"UserPromptSubmit hook\n\n"` 前缀**后注入，模型可见并可遵循。
  （实测：模型首个 assistant 行回显 `UserPromptSubmit hook\n\nHOOK_INJECT_<tag>`，随后正常作答。）
- **仅 `UserPromptSubmit` 的 stdout 进入上下文**：同测的 `SessionStart`/`Stop` hook 的 stdout（`HOOK_INJECT_*`）未进入模型上下文。
- **subagent 回合不触发 `UserPromptSubmit`**：实测用 `Agent` 工具委派 `explore` 子代理，仅父会话触发 1 次
  `UserPromptSubmit`，子代理回合未触发（子代理回合走 `SubagentStart`/`SubagentStop` 事件，见调研报告 §2.4）。
- **stdout 长度上限**：未单独验证，payload/dump 无截断迹象；官方文档未明示上限。建议适配器侧对注入文本做保守裁剪。

### 证据摘录

```
$ kimi -m kimi-code/kimi-for-coding --output-format stream-json -p "Reply with the exact word: alpha"
{"role":"assistant","content":"UserPromptSubmit hook\n\nHOOK_INJECT_v2clean"}
{"role":"assistant","content":"alpha"}
```

（hook-dump.sh 以 normal 模式回显 `HOOK_INJECT_v2clean`；模型首行回显被注入文本——证明进入上下文。）

Subagent 委派（只出现一次 UserPromptSubmit）：

```
工具调用：Agent  {"description":"List /work top-level files","subagent_type":"explore","prompt":"..."}
UserPromptSubmit dumps 数 = 1（仅父会话 prompt）
```

### 对 adapter-kimi 设计的影响

- breadcrumb / session-context 注入**可靠路线是 `UserPromptSubmit` hook stdout**，但：
  - 触发粒度是**用户提交消息**（非每个模型回合）。
  - **executor 子会话（spawn 的 child kimi）不会触发 `UserPromptSubmit`**，因此子会话内无法靠该 hook 注入 breadcrumb/session-context。
- 适配器应把注入文本裁剪并去掉会被 kimi 追加的前缀，避免污染，建议实现侧自行用 `hookSpecificOutput` 或仅注入纯文本。

## 3. V3 —— `PreToolUse` hook

### 事实结论

- **payload 字段结构**：
  `{"hook_event_name":"PreToolUse","session_id":"...","cwd":"/work","client_type":"kimi_code_cli","tool_name":"<工具名>","tool_input":{...},"tool_call_id":"tool_<id>"}`
- **写工具确切名称与 `tool_input` 结构**：
  - `Write` → `{"path":"...","content":"..."}`（新建/覆盖文件）
  - `Edit` → `{"path":"...","old_string":"...","new_string":"..."}`
  - `Read` → `{"path":"..."}`
  - `Bash` → `{"command":"..."}`
- `matcher` 是对 `tool_name` 的正则；省略 matcher 时实测 `Write`/`Bash`/`Read`/`Edit` 均被捕获。
- **`exit 2` 阻断生效**：阻断后文件**未创建**，且 **stderr 内容作为阻断原因回传给模型**（模型获知 "the Write tool was blocked by the environment hook `hook-dump` with the message `BLOCK v3block`"）。
- **fail-open 生效**：hook 崩溃（`exit 1`）或超时（睡眠超过 config `timeout`）均**放行**（write 成功创建文件）。

### 证据摘录

```
Write 触发：{"tool_name":"Write","tool_input":{"path":".../v3-hello2.txt","content":"hello2"},"tool_call_id":"tool_..."}
Edit  触发：{"tool_name":"Edit","tool_input":{"path":".../v3-edit.txt","old_string":"Hello World","new_string":"Goodbye World"},"tool_call_id":"tool_..."}
Bash  触发：{"tool_name":"Bash","tool_input":{"command":"ls /work | head -3"},"tool_call_id":"tool_..."}
```

阻断/放行验证：

```
block  : exit 2 → v3-block.txt 未创建；模型回复 "...the Write tool was blocked by the environment hook `hook-dump` with the message `BLOCK v3block`..."
crash  : exit 1 → v3-crash.txt 已创建（内容 crashdata）
timeout: 睡眠 8s，config timeout=2 → v3-timeout.txt 已创建（内容 timeoutdata）
```

### 对 adapter-kimi 设计的影响

- **executor.gate 可经 `PreToolUse`（matcher `Write|Edit`，`exit 2`）阻断写**，实测有效；阻断原因（stderr）会回传给模型。
- **fail-open 是确定边界**：脚本崩溃/超时即放行，不能作为唯一安全防线（与调研 §2.4 一致）——与 DSH gate 的 bash 绕行同级风险，文档需声明。
- 注意 **hook 命令须可执行**，否则静默 fail-open（见 §0）。

## 4. V4 —— plugin manifest `mcpServers`（stdio MCP）

> 探针 plugin `workloom-spike` 在 manifest 声明 `mcpServers.workloom`（`command: node`），MCP server 为手写 JSON-RPC over stdio 的 echo 工具。

### 事实结论

- **MCP server 会随 plugin 加载**（协议 `2025-11-25`，客户端 `kimi-code`），工具对模型可见可调用。
- **node 入口必须在 `KIMI_PLUGIN_ROOT` 内**：manifest 的 `args` 指向插件根之外的绝对路径时报
  `MCP error -32000: Connection closed / Plugin node entry must be inside KIMI_PLUGIN_ROOT: <path>`。
  应把 server 放进插件目录并用**相对路径**（如 `./mcp-server/mcp-echo-server.mjs`）。
- **默认 cwd = 插件根目录**：实测 `process.cwd()` = `<KIMI_CODE_HOME>/plugins/managed/workloom-spike`，
  **不是**会话项目 `/work`。（过程环境 `PWD=/work` 为旧值，`process.cwd()` 才是权威。）——core 需借 cwd 定位 `.workloom`，
  故 adapter 必须在 `mcpServers` 里**显式 `cwd`** 指向 workloom 项目目录。
- **工具命名**：模型可见工具名为 **`mcp__plugin-<plugin-id>_<server>__<tool>`**（实测
  `mcp__plugin-workloom-spike_workloom__echo`），**并非** `mcp__<server>__<tool>`。
- **manifest `env` 字段透传**：server 进程 env 中出现
  `"KIMI_CODE_PROBE":"set-via-manifest"`。控制面注入的 env 有 `KIMI_CODE_HOME`、`HOME`、`KIMI_CODE_BASE_URL`（`https://api.kimi.com/coding/v1`）。
- **禁用/启用**：把 `plugins/installed.json` 中该 plugin 的 `enabled:false`，MCP server 不再加载（无 server 日志、模型答"工具不可用"）。
  `/plugins` TUI 的 mcp disable/enable 与此等价；非交互无法调 `/plugins`。

### 证据摘录

```
server.log.jsonl（server 收到的流量与 cwd/env）：
{"dir":"recv","msg":{"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"kimi-code","version":"0.0.0"}},"jsonrpc":"2.0","id":0}}
{"dir":"info","cwd":"/home/tester/.kimi-code/plugins/managed/workloom-spike","env":{"KIMI_CODE_HOME":"/home/tester/.kimi-code","HOME":"/home/tester","PWD":"/work","KIMI_CODE_BASE_URL":"https://api.kimi.com/coding/v1","KIMI_CODE_PLUGIN_MARKETPLACE_URL":null,"KIMI_CODE_PROBE":"set-via-manifest"}}
{"dir":"recv","msg":{"method":"tools/call","params":{"name":"echo","arguments":{"text":"PROBE2"}},"jsonrpc":"2.0","id":2}}
```

（禁用在插件根的路径外时）：

```
ERROR mcp server unavailable server=plugin-workloom-spike:workloom transport=stdio status=failed reason="MCP error -32000: Connection closed\nstderr: Plugin node entry must be inside KIMI_PLUGIN_ROOT: /work/.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/probes/mcp-echo-server.mjs"
```

模型调用结果（工具名 + 返回值）：

```
工具调用：mcp__plugin-workloom-spike_workloom__echo  →  返回 ECHO:PROBE2
```

### 对 adapter-kimi 设计的影响

- **MCP server 必须随插件打包**（放进 `plugin/` 的 `mcp-server/`，manifest 用相对路径），与研究 §6.1 包结构一致。
- **必须在 manifest `mcpServers.<server>.cwd` 指定 workloom 项目目录**（core 需借 cwd 定位 `.workloom`），否则默认落到插件根目录导致 core 找不到项目。
- **工具命名需带插件前缀**：`surface.ts` 的 9 个模型可见工具映射为 `mcp__plugin-<id>_<server>__<tool>`，模型侧指令/权限规则须据此写。
- **maname `env` 可透传**令牌/配置，但注意敏感信息；`KIMI_CODE_BASE_URL` 已被 kimi 注入。

## 5. V5 —— `sessionStart.skill` 加载形态

> manifest 声明 `{ "sessionStart": { "skill": "contract" } }`，skill 按 **名称**（SKILL.md frontmatter `name`）引用，位于插件 `skills/` 目录。

### 事实结论

- **sessionStart.skill 的正文进入 main agent 上下文并作为指令生效**（并非仅登记为可调用 skill）。
- 实测：contract SKILL.md 正文含指令"任何任务回答前，必须先输出行 `CONTRACT_OBEYED`"；模型在首个 assistant 行输出 `CONTRACT_OBEYED`，
  证明该 skill 正文被加载进 main agent 上下文、模型可遵循。

### 证据摘录

```
prompt:  Call MCP tool mcp__plugin-workloom-spike_workloom__echo with text PROBE3. Report its return value.
模型回复:
CONTRACT_OBEYED
`ECHO:PROBE3`
```

### 对 adapter-kimi 设计的影响

- **workflow 契约可整体经 `sessionStart.skill` 加载**为 always-on 规范化指令（与研究 §6.3.4 一致）。
- 契约正文（约 116 行）远小于 manifest `sessionStart.skill` 无硬性体积问题；但注意所有启用 plugin 的注入预算（调研 §2.1 的 64KB 合计）。
- 由于 skill 正文进入上下文，**契约常态指令会在每个新会话生效**，这是理想的 breadcrumb/norms 承载点；但粒度是"会话启动"，每轮变化仍靠 `UserPromptSubmit` 注入。

## 6. V6 —— plugin commands frontmatter 容错

> 探针命令 `commands/hello.md` 的 frontmatter 含 `name`、`description` 以及未知字段 `title`、`argument-hint`。

### 事实结论

- **未知 frontmatter 字段被容错（忽略）**：安装含 `title`/`argument-hint` 的命令插件后，**未出现任何 diagnostics**，
  同插件的 mcpServers/skill 均正常生效，命令未被拒载。/ 研究中 agent 文件明确忽略未知字段，命令实测同样容错。
- **可观测性边界**：本 spike 非交互，无法调用 TUI 的 `/plugins info` 查看 diagnostics；证据为"加载无报错 + 插件其余功能正常"。
  结论方向与调研 §6.3 一致：命令 frontmatter 收敛为 `name`/`description`，`title`/`argument-hint` 丢弃即可（`argument-hint` 可并入 description）。

### 证据摘录

```
命令文件 frontmatter 含未知字段：
---
name: hello
description: Spike 用命令...
title: 一个多余的未知字段 title 理论上应被忽略
argument-hint: [message]
---
插件加载结果：无 diagnostics；kimi doctor 通过；同插件 mcpServers/skill 均生效。
```

### 对 adapter-kimi 设计的影响

- commands 渲染器无需担心未知字段引发加载失败；但仍建议**严格收敛**为 `name`/`description`，避免未来版本收紧字段校验时回归。

## 7. V7 —— plugin 更新 / 多版本共存

> 通过把 `managed/<id>/` 副本做版本升级（0.1.0 → 0.2.0，新增 `VERSION.txt` 标记）并重跑 `install-plugin.sh`（即 `/plugins install` 的落地行为），观察同 id 再安装。

### 事实结论

- **覆盖安装、单版本共存**：重装后仍只有 `plugins/managed/workloom-spike/` 一个目录，version 更新为 0.2.0，`VERSION.txt` 标记存在。
  未出现 `versions/` 多版本并存目录，也未拒绝安装。
- `plugins/installed.json` 对同一 `id` 保持**单条**记录（root 不变）。

### 证据摘录

```
重装后 managed/workloom-spike/ 结构：
  VERSION.txt   commands/   kimi.plugin.json   mcp-server/   skills/
  kimi.plugin.json .version = 0.2.0；VERSION.txt = "v0.2.0 marker"
仅存在一个 managed/ 子目录：/home/tester/.kimi-code/plugins/managed/workloom-spike/
```

### 对 adapter-kimi 设计的影响

- **插件全局单版本**：升级 adapter-kimi 插件会覆盖已有安装，影响所有项目（调研 §4 gap 行"plugin 版本全局唯一"获实锤）。
  多项目并行时版本唯一；需靠 cwd 自激活判定兜底"非 workloom 项目不注入"。

## 8. V8 —— 项目级 plugin 安装范围（文档调研）

### 事实结论

- **官方文档明确当前无项目级范围**：`kimi-code/zh/customization/plugins.html` —— "Plugin 目前按用户安装，对所有项目生效，暂不支持项目级安装范围。"
- **roadmap（开放式 issue）**：`MoonshotAI/kimi-code` issue **#1749**（2026-07-15 创建，open，2 条评论）
  `feat(plugin): support project-level plugin directories`：提议经工作区本地配置 `.kimi-code/local.toml` 的
  `[workspace] plugin_dir = [./plugins]` 扫描项目级插件，合并项目级 plugin skills 进会话，全局无污染；关联合并 #511。
- 相邻但不同：`MoonshotAI/kimi-cli` issue **#850**（closed，enhancement）—— 会话启动自动加载项目 AGENTS.md/.cursorrules（项目上下文而非插件）。

### 证据摘录

```
MoonshotAI/kimi-code#1749（open）：
"feat(plugin): support project-level plugin directories ... In your project's .kimi-code/local.toml:
[workspace]
plugin_dir = [./plugins]  ... Closes #511"
```

### 对 adapter-kimi 设计的影响

- **当前必须靠 cwd 自激活**（复用 core `findWorkloomRoot`）实现"非 workloom 项目不注入"，因为插件全局生效。
- 若后续 kimi 支持项目级插件（#1749），adapter 可把插件下沉到 `.kimi-code/local.toml` 的项目级 plugin_dir，实现更干净的项目隔离；当前是前瞻项。

## 9. 关键边界与注意事项

- **hook fail-open 是硬边界**：hook 崩溃/超时即放行，不能作为唯一安全防线（实测确认）。
- **hook/脚本须可执行**，否则静默 fail-open 且无日志（实测踩坑，见 §0）。
- **MCP server 入口必须在插件根内**、**默认 cwd=插件根**（须显式 `cwd`）。
- **`stream-json` 是逐消息非逐 token**，无独立 reasoning 事件；executor 解析器据此设计。
- **executor 子会话触发不了 `UserPromptSubmit`/（大概率）插件内 breadcrumb 注入**，需另寻注入通道。
- **模型调用约束**：全部显式 `-m kimi-code/kimi-for-coding`，不依赖 config 默认 `kimi-code/k3`。

## 10. 验证资产

- 容器编排：`.workloom/tasks/08-28-spike-kimi-code-runtime/spike-assets/{Containerfile.kimi,compose.yml}`
- 初始化/探针：`setup-kimi-home.sh`、`install-plugin.sh`、`probes/{hook-dump.sh,config-hooks.sh,mcp-echo-server.mjs}`
- 探针插件：`spike-assets/plugin/`（manifest + skills/contract + commands/hello + mcp-server）
- 一键重跑：`spike-assets/verify-all.sh`（容器内执行，含 V1–V7 断言 PASS/FAIL）
- 复跑步骤与前置条件见 `spike-assets/README.md`。

