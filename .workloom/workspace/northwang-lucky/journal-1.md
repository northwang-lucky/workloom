## 仓库迁移至 workloom 工作流并去 Trellis 化

- Time: 2026-08-26T11:03:54.954Z
- Commit: 1d746be
- Summary: dogfooding：初始化 .workloom、8 主题 spec 沉淀、AGENTS.md 重写为项目指南、删除 docs 与 .agents/skills、AGENTS.local.md 承载个人红线、core 注释去历史溯源表述（迁移功能保留）；spec 索引注入与会话收尾链路全程实证。

## init 生成 .workloom/.gitignore 并收敛忽略策略

- Time: 2026-08-26T12:21:48.706Z
- Commit: 1d529da
- Summary: init 幂等生成 .workloom/.gitignore（.runtime/ + .developer 两条目），本仓库忽略策略从根 .gitignore 收敛至自包含文件；全程 test-first，部署同步已确认生效。

## 修复 task-store 归档旧格式任务 hooks 崩溃

- Time: 2026-08-26T14:21:45.216Z
- Commit: 3c5bb84
- Summary: 排查 dsh session-f98c8040 的 after_archive 报错：旧格式 task.json 缺 hooks 字段导致 readTask 后 task.hooks 为 undefined。在 readTask 统一归一化补齐空数组并补回归单测，构建产物已同步至 profile（重启 dshweb 由用户确认）。

## task_start/task_archive 流程硬卡点

- Time: 2026-08-27T01:45:20.739Z
- Commit: 30253b0
- Summary: 复盘 DSH 会话 session-f98c8040 跳过 workloom 流程的根因（软约束无硬卡点），落地 task_start/task_archive 流程硬卡点：新增 task-gates 模块与 workloom_task_check 凭据工具、force/overrides 豁免留痕、两 adapter 注册、workflow 契约同步（core a8fe374 / adapter 8b55eff / 契约 b74c9a8 / 交付物 30253b0）；全程走通 1.1 对齐（brainstorm+grilling）→1.3 配置→1.4 评审→2.1 TDD 实现→2.2 check→2.3 提交→3.1 归档。另发现 after_archive 空指针为旧部署版本问题，仓库已修复。

## design/implement 编写改为主动询问用户

- Time: 2026-08-27T03:23:56.075Z
- Commit: 88d6e20
- Summary: workflow 契约 1.4 改为 prd 定稿后主动询问用户是否编写 design/implement（两选项捆绑），去掉 "for complex tasks" 模糊判定；completion criteria 与 planning 面包屑同步；构建产物已 rsync 到 DSH web profile（未重启 dshweb）。

## slash 命令失败由 Agent 转述

- Time: 2026-08-27T03:43:34.303Z
- Commit: 076ff99
- Summary: slash 命令（init/continue/finish）失败不再弹红错，统一改由 Agent 转述：core 新增 buildErrorRelayText/buildSuccessRelayText 拼装函数与 COMMAND_FAILURE_ACK 常量；DSH followup 注入 + success 回执、Pi sendUserMessage 注入 + notify info；init 成功也注入模型回合（core cd84aae / adapter 076ff99 / 交付物 38f3d23）；产物已同步 web profile（重启归用户）。

## executor 派发约束与模型配置可观测性

- Time: 2026-08-27T06:09:32.765Z
- Commit: db3a3ae
- Summary: 强化 executor 派发约束与模型配置可观测性：契约 v2 强制派发、跨 provider 修复、model 按 runtime 拆分、config.local.yaml、写文件硬门禁与 receipt 摘要

## 配置注释迁移、提问行为规范与子代理标题语义化

- Time: 2026-08-27T07:41:01.345Z
- Commit: 5260552
- Summary: config.yaml 注释迁入 example 并重组、提问行为四条规范（用户语言/选项不进题/禁交互工具/分批编号）、子会话标题语义化、派发参数冲突提示与 force 覆盖审计

## 子会话标题语义来源改为模型生成

- Time: 2026-08-27T09:12:05.420Z
- Commit: abc3aca
- Summary: workloom_execute 新增 title 参数支持模型语义化子会话命名，前缀精简为 [Implement]，契约建议派发时给出语义 title（version 4）

## workloom_execute 的 title 参数改为必填

- Time: 2026-08-27T09:35:50.581Z
- Commit: 534c706
- Summary: workloom_execute 的 title 参数改为必填（两 adapter required + minLength 1），杜绝派发方不传导致子会话标题雷同

## always-on 行为规范注入会话上下文快照

- Time: 2026-08-27T12:42:13.293Z
- Commit: 414a3a6
- Summary: 契约新增 [workflow-norms] always-on 规范块并注入每轮重组装的会话上下文快照（两 runtime 共享 core 链路），契约升级后下一轮自动生效

## 任务创建决策权移交用户：Agent 仅推荐，prd 强制 H1

- Time: 2026-08-27T13:48:58.691Z
- Commit: 0991524
- Summary: 契约 v8：任务创建改为「Agent 推荐 → 用户确认 → 才建任务」（1.0/no_task/completed 三处，保留纯问答豁免）；prd.md 骨架强制 H1 标题，start 门禁新增校验；contract 测试 v8 断言与 H1 门禁用例全绿。

## executor 子代理切换 one-shot(禁止用户 follow-up)

- Time: 2026-08-28T04:10:45.783Z
- Commit: f0affe9
- Summary: workloom executor 子代理切换为一次性(one-shot)派发:DSH 侧经 ctx.subagents.start 派发,用户无法再对其发送消息;DSH 侧 effort 通道完全移除,core 共享逻辑与 Pi 保持不动;构建产物已同步 DSH profile(重启归用户)。

## Kimi Code 适配调研与 podman spike 验证

- Time: 2026-08-28T11:01:31.305Z
- Commit: d3f32aa
- Summary: 调研并 spike 验证 workloom 支持 Kimi Code 的可行性：调研报告 + podman 容器真机验证 V1–V8 + 回填开放问题，结论为需自研 wrapper（adapter-kimi = plugin + MCP server + hooks），待创建实施任务。

## 契约新增前端 UI 设计对齐流程（1.1b + workloom-ui-design）

- Time: 2026-08-29T07:32:53.899Z
- Commit: 4f15b4c
- Summary: 契约 v9：1.1 新增固定问题（Does this task involve frontend UI presentation?），yes 强制进 Phase 1.1b UI 设计对齐（新 skill workloom-ui-design，七轴讨论，产物 prd.md UI Design 小节 + 复杂任务 design.md 章节），grilling 顺延 1.1c；双 adapter 登记，术语表与 vendored 注记同步，测试全绿。

## 新增前端实现 executor（frontend agent）与派发审计门禁

- Time: 2026-08-29T09:11:08.050Z
- Commit: fd32f1a
- Summary: 新增第 4 个 executor kind frontend（前端实现 Agent）：四要素角色定义、契约 v10 强制前端任务经 frontend 派发、task.json dispatches 派发审计（四 kind 一视同仁、仅成功记录）、check 门禁核验（有 UI Design 小节无 frontend 派发则拒绝，force 豁免留痕）；核心 280/dsh 51/pi 40 全绿。

## 子任务机制落地与首次拆分实战

- Time: 2026-08-29T10:31:29.087Z
- Commit: 2732f88
- Summary: workloom 子任务机制三面落地（契约/工具/提示）并首次拆分子任务实战：主任务容器 + P0-P3 四子任务完整生命周期。

## gate 堵漏与 doctor 命令落地

- Time: 2026-08-29T11:46:49.866Z
- Commit: fdcb6ea
- Summary: executor gate 堵住 fork 绕行 + workloom-doctor 健康检查命令（8 类检查/3 类机械修复/--fix/结构化输出），双任务完整生命周期并已同步部署。

## 写门禁仅拦截工作目录内的文件

- Time: 2026-08-29T12:02:30.091Z
- Commit: 89e0831
- Summary: 放宽 adapter-dsh 写门禁：仅拦截工作目录内的文件，工作目录之外放行；实现 + 测试 + 复核全绿并归档。

## DSH adapter 支持 effort 通道：映射 reasoningEffort 派发给 executor 子代理

- Time: 2026-08-30T07:27:32.660Z
- Commit: 1bc33da
- Summary: 从一次真实会话分析定位 effort 被 DSH 侧丢弃的问题；对齐需求（同名直通/schema 恢复/冲突门+receipt/不引入 off）后 test-first 交付 6 接缝，独立 check 通过，产物已同步至 web profile，待用户重启 dshweb 体验。

## 分析 dsh 会话 skill 报错并修复契约名对齐

- Time: 2026-08-30T08:27:08.344Z
- Commit: a3ad825
- Summary: 定位 session-3a0aaafc 的 skill "brainstorm" 未知报错根因为契约短名与注册名不一致；统一为 workloom-brainstorm（version 10→11）并同步部署 DSH profile（跳过 dshweb 重启）。

