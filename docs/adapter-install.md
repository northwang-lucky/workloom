# workloom adapter 安装与验证指南（DSH + Pi）

> 面向 DeepSeek Harness 与 Pi 的 workloom adapter（`@workloom-ai/adapter-dsh` / `@workloom-ai/adapter-pi`）的安装步骤、验证清单与宿主事实教训。全部条目均经真机实证（2026-08-25/26，标注 ✅）。

## 1. 总览

| 面 | DSH | Pi |
| --- | --- | --- |
| 包 | `@workloom-ai/adapter-dsh`（profile bundle） | `@workloom-ai/adapter-pi`（Pi Package） |
| 依赖 | `@workloom-ai/core`、`@workloom-ai/assets`；peer `@deepseek-ai/dsh-*` | 同左；peer `@earendil-works/pi-coding-agent`、`typebox` |
| 安装 | `dsh plugin --profile web add file:<绝对路径>` | `pi install npm:@workloom-ai/adapter-pi`（发布后）；开发期 `-e <绝对路径>` 直载 |
| 激活 | 按会话 cwd 检测 `.workloom/`，自激活；无则静默 | 同左 |
| 模型可见面 | 3 命令（workloom-init/continue/finish）+ 8 工具（5 任务 + execute + step + journal） | 同左（registerCommand/registerTool） |

## 2. DSH 安装

1. 构建：仓库根 `pnpm install && pnpm -r build`。
2. 安装：`dsh plugin --profile web add file:/data00/home/wangyubo.1219/workbench/code-src/github/trellis-hotplug/packages/adapter-dsh`。**add 参数必须是绝对路径**（相对路径按 profile 目录解析会报 `Could not install from ...`）；remove 用**包名**（`dsh plugin --profile web remove @workloom-ai/adapter-dsh`）。
3. 重启 web profile 后 `dsh plugin --profile web ls` 应见 `@workloom-ai/adapter-dsh`，且插件行无 waiting。
4. **部署同步纪律**：profile 的 `file:` 依赖是硬拷贝，工作区 `pnpm -r build` 产出新 dist 后必须执行 `~/dsh/bin/dsh-sync-workloom` 的 rsync 段（core/adapter-dsh 的 dist 与 assets 全包）；dshweb 重启由用户执行。缺同步会在重启后报 `ERR_MODULE_NOT_FOUND`（教训见 `docs/adapter-dsh-postmortem.md` 问题四）。

## 3. Pi 安装

1. 构建：`pnpm -r build`（adapter-pi 的 build = sync-skills，从 assets 拷贝 4 个 skill 目录到包内 `skills/`，产物进 .gitignore）。
2. 开发期直载：`pi --model <模型> --approve -e <仓库>/packages/adapter-pi/src/index.ts`（jiti 直载 TS，无需构建 adapter-pi 自身）。
3. 发布后安装：`pi install npm:@workloom-ai/adapter-pi`——包内 `skills/` 目录由 Pi 官方机制自动发现（渐进式披露）；`-e` 直载形态不覆盖包内 skills 自动发现。
4. executor 派发为自研 spawn child pi（ADR-0006）：child 用 `--mode json --no-session --no-extensions --thinking <effort>`，不依赖 pi-subagents；`PI_BIN` 环境变量可指向包装脚本以便捕获/替换 child pi 命令（测试用）。
5. 真机验证模型：`qwen-token-plan-cn/qwen3.7-plus`（qwen3.6-flash 短指令可用但长会话不稳定；qwen3.6-plus/3.7-plus 需在 token plan 平台开通）。

## 4. 验证清单（双端，全部已实证 ✅）

| 验证项 | DSH | Pi |
| --- | --- | --- |
| 非 workloom 项目无注入（静默） | ✅ | ✅ |
| `/workloom-init <name>` 生成骨架（含 .trellis 迁移/--purge） | ✅ | ✅ |
| breadcrumb 每轮注入（状态块 + overlay + 逃生舱） | ✅ | ✅（before_provider_request 载荷实证） |
| session-context 注入（developer/活跃任务/git/阶段概览） | ✅ | ✅（custom_message 恰好一次） |
| continue 路由 + 触发回合；finish 脏检查拦截 + 干净注入 | ✅ | ✅ |
| 任务五工具（create/start/finish/archive/list）+ 归档自动提交 | ✅ | ✅ |
| workloom_execute 派发（research/implement/check，子代理真实运行） | ✅（P1） | ✅（自研 spawn） |
| effort：DSH reasoningEffort / Pi --thinking | ✅（P1 实证） | ✅（child 命令行实证） |
| workloom_step 步骤详情 | ✅ | ✅ |
| workloom_journal 落盘 + `chore: record journal` 自动提交 | ✅ | ✅ |
| skills：4 个 skill 可用（catalog / 包内自动发现） | ✅ | ⏸（`-e` 直载不覆盖，pi install 形态留待发布后验证） |

## 5. 宿主事实与教训（实现/排障必读）

1. **Pi promptSnippet 必填**：`ToolDefinition` 缺 `promptSnippet` 时工具不进 system prompt 的 Available tools 区，模型「看不到」会拒绝调用（qwen3.6-flash 实测）。workloom 全部工具已补 `TOOL_SNIPPETS`（core surface）。
2. **pi-subagents registerAgent 跨扩展失效**：Pi 0.84.2 每扩展独立 ExtensionAPI 对象 + WeakMap 按对象身份匹配，跨扩展注册必然 miss（探针实证）。workloom 据此自研 spawn child pi（ADR-0006），不依赖 pi-subagents。
3. **DSH profile 硬拷贝**：`file:` 依赖非 symlink，重建不同步会挂（postmortem 问题四）；`dsh plugin` 的 add 用绝对路径、remove 用包名。
4. **DSH 工具 schema 必须标准 JSON Schema**：`{type:'json'}`、缺顶层 `type:'object'` 均被宿主/API 拒绝（postmortem 问题一/二）。
5. **DSH executor 的 maxDepth 语义**：`maxDepth: 1` = 子代理自身深度绝对上限（executor 禁止再派发）；Pi 侧由 `--no-extensions` 天然保证（child 无 workloom_execute 工具）。
6. **会话指针按 runtime 前缀隔离**：DSH `dsh_<agentId>`、Pi `pi_<sessionId>`，同一 .workloom 项目两端并发会话不互相覆盖。
7. **Pi 的 `/new` 会丢 `-e` 扩展的工具注册**：扩展工厂只在进程启动时执行，会话内 `/new` 后 runtime 重建、工具消失；验证时用「重启进程 + resume」而非会话内 `/new`。
