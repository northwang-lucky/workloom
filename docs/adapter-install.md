# adapter-dsh 安装与 PoC 验证指南

> 面向 DeepSeek Harness 的 workloom adapter 插件（`@workloom-ai/adapter-dsh`）的本地安装步骤与 PoC 实证清单。验证对象是「插件装上后，四条通道是否按规格生效」：注入（breadcrumb/会话上下文）、命令、executor、skills。

## 1. 构建与安装

1. 构建全部包：在仓库根执行 `pnpm install && pnpm -r build`（assets 无构建，core/adapter-dsh 产出 dist）。
2. 添加插件：`dsh plugin --profile web add <适配器包路径或 npm 名>`。本地验证阶段用 `file:` 路径或 link 引用本仓库 `packages/adapter-dsh`（尚未发布 npm 名，勿直接 add 不存在的包名）。
3. 重启 web profile：让插件随 profile 重新加载（动态 Cordis 插件行只在启动时装配）。
4. 确认插件行已挂载且无 pending：`dsh plugin --profile web ls` 应看到 `workloom-dsh`；若依赖服务缺失（inject 列表含 systemPrompt/agents/commands/tools/subagents/skills），插件会停在 waiting，需检查宿主是否提供对应服务。

## 2. 验证清单

- [ ] **无 .workloom 项目：无注入（静默）**。在任意非 workloom 目录发起会话，breadcrumb 与 session-context 均不注入，无报错日志。
- [ ] **初始化**。`/workloom-init <name>` 生成 `.workloom/` 骨架，返回 created 清单；在含旧 `.trellis/` 的项目里执行时返回 legacy 检测提示。
- [ ] **breadcrumb**。创建任务后每轮注入对应状态块（no_task/planning/in_progress/completed 之一）；`.workloom/workflow.override.md` 的 overlay 合并生效；消息含逃生舱关键词（no-workloom）时跳过注入。
- [ ] **会话上下文**。context 快照含 developer、活跃任务、git 状态、工作流阶段概览；无任务时快照降级为无任务形态。
- [ ] **命令**。`/workloom-continue` 按 status + artifacts 路由下一步并触发模型回合；`/workloom-finish` 在存在脏文件时拦截并退回 2.3，工作树干净时注入收尾指引。
- [ ] **executor**。`workloom_execute` 支持 kind（implement/check/research）与 model/effort 参数；传入 effort 后，子代理建立即写入 request/header，其首请求 header 含 `reasoningEffort`（PoC P1 实证点）。
- [ ] **skills**。模型侧 catalog 可见 `workloom-brainstorm` / `tdd` / `grilling` / `writing-for-agents` 四个 skill（自有 brainstorm 的 description 触发词生效）；`workloom_step` 工具可用，按 stepId（如 1.1）返回契约步骤详情，未找到时抛英文错误。

## 3. PoC 风险点提示

- **header 写入时序**：effort 必须在子代理「inbox 收 prompt 后、回合开始前」写入（executor 利用 `startContinuable` 返回后 `whenIdle()` 前的窗口）；若宿主在子代理建立时即预取 header，写入窗口会失效，表现为首请求不带 reasoningEffort——该点需要实证确认窗口宽度。
- **initiator 并发会话**：breadcrumb/会话上下文按「组装上下文里的 agent 优先、回退发起链」解析；同一 cwd 下多个并发会话共享项目根与指针文件，活跃任务指针按会话 contextKey 隔离，需验证并发会话不互相覆盖。
- **skill 注册的失败容忍**：任一 SKILL.md 缺失/解析失败/注册抛错只 console.warn 跳过，不阻塞插件；验证时若 catalog 缺某个 skill，先看插件日志中的 `workloom skill: registration skipped:` 行。
