# Executor 子代理禁止再委派:按深度裁剪上下文与工具面

## Goal

workloom 工作流中,主会话（delegationDepth=0）经 `workloom_execute` 派出的 executor 子代理（深度 1）仍能获取"继续派发子代理"的上下文（session-context norms、breadcrumb、`workloom_step` 契约文本均含 dispatch 指令），并且在 `workloom_execute` 被 `maxDepth: 1` 拦截后改用 DSH 原生 `subagent_with_model` 通道成功派发 depth-2 孙代理。本任务按方案 C 修复：对 delegationDepth>0 的 executor 子代理，按深度裁剪注入上下文（契约文本兜底），并在 spawn 时用 `toolFilter` 硬屏蔽编排与委派类工具（工具面屏蔽），两层防线杜绝"继续委派"。

## Requirements

### R1 深度判定来源

1. 注入与兜底均以 agent 的持久化 delegationDepth（`agent.session.header.delegationDepth`，经 `delegationDepthOf(agent)` 读取）为准，缺失视为 0（顶层）。
2. workloom_step 兜底以工具执行上下文 `exec.agent` 读同一深度。

### R2 工具面硬屏蔽（adapter-dsh executor spawn）

1. `executeExecutor` 的 spawn 请求增加 `toolFilter: { deny: [...] }`。
2. deny 清单 = workloom 自有 9 个工具（TOOL_NAMES 全量）+ DSH 原生委派类工具候选集（subagent、subagent_with_model、subagent_fork、list_agents、send_message、interrupt_agent、ralph、workflow、ralph-loop）与运行时可见工具名（`ctx.tools.schemas()` 返回名集合）的交集；候选名不存在于可见集合时不得硬编码进 deny（未知名字会使 restrict fail）。
3. 求交源说明：`ctx.tools.schemas()` 为全局层视图（dsh-cordis-host-runner 的 sandbox facade 按插件自身作用域无参调用）；agent-plane（preset standing-mount 层）委派工具名不在该视图内、不可枚举，故不在本仓库可屏蔽范围（见 Notes 的 B 部署层兜底与 C 上游跟进）。
3. spawn 前校验 provider capability：`toolFilter` 为 false 时 fail loud（抛清晰英文错误，指明需部署支持该 capability），不静默丢弃。
4. 现有 `maxDepth: 1` 保留不变。

### R3 注入文本按深度裁剪（core + adapter-dsh）

1. `assembleSessionContext` 与 `assembleBreadcrumbSync` 入参增加 `delegationDepth`（缺省 0，向后兼容）。
2. 深度>0 时：session-context 的 Always-on norms 段整体替换为 core 静态常量 "executor norms"（5~8 条英文实施纪律：叶子执行器禁止派发/编排、按任务 artifact 实施、test-first 纪律、验证与不提交等，零派发语义）；workflow 步骤概览行保留；breadcrumb 完全不注入（返回 null）。
3. 深度=0 时行为与现状逐字一致（现状测试不得改动）。
4. 所有新增运行时文本英文。

### R4 workloom_step 契约文本兜底（adapter-dsh）

1. `executeStepTool` 在 `delegationDepthOf(exec.agent) > 0` 时，不返回契约步骤原文，改返回固定"叶子执行器"提示文本（英文，含 stepId 回显与"你是 executor，直接实施，不得派发"语义）。
2. 深度=0 时返回原文（现状不变）。

### R5 executor 首条 prompt 兜底（core）

1. `buildExecutorPrompt` 组装的 prompt 末尾追加一行英文叶子规则："You are a leaf executor subagent: implement directly; never dispatch subagents or call workloom orchestration tools."
2. 对所有 kind 一致生效；防重复：组装时检查 userPrompt 是否已含叶子规则关键词（"leaf executor"），已含则不追加。

### R6 范围

1. 本次仅改 adapter-dsh 与 core；adapter-pi 的同步改造另立任务（本任务 Notes 记录评估结论）。
2. 不改 assets/workflow.md 契约；不引入新依赖。

### R7 test-first seams（全部先红后绿）

1. seam-1 core `assembleSessionContext` 深度分支：depth>0 输出 executor norms 段、depth=0 输出现状 norms。
2. seam-2 core `assembleBreadcrumbSync` 深度分支：depth>0 返回 null、depth=0 返回现状 breadcrumb。
3. seam-3 adapter-dsh `executeStepTool` 深度分支：depth>0 返回叶子提示、depth=0 返回契约原文。
4. seam-4 adapter-dsh executor spawn：请求携带 toolFilter deny 清单（与运行时可见工具求交）、provider 无 toolFilter capability 时 fail loud。

## Acceptance Criteria

1. 四个 seam 的红绿证据完整（测试先失败后通过，输出与提交说明对应）。
2. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 通过；core 与 adapter-dsh 全量单测通过（现有深度=0 用例零改动零回归）。
3. 端到端复核（人工/文档说明）：按 08-31 会话场景回放 —— 深度 1 的 executor 首轮上下文不含任何 dispatch 指令（norms 为 executor 版、无 breadcrumb、workloom_step 只回叶子提示、首条 prompt 附叶子契约行）；其可见工具集不含 workloom_execute/workloom_step/workloom_task_*/workloom_journal，也不含全局层委派类工具名（含 08-31 事故通道 subagent_with_model）；尝试调用任一被禁工具得到"不可见/拒绝"结果而非成功派发。agent-plane 委派工具（subagent_fork/ralph/workflow/list_agents/send_message/interrupt_agent 等）不在本仓库可屏蔽面，其兜底为 Notes 的 B（部署层 maxDepth）——本验收不覆盖该层，B 落地后由部署侧复核。
4. 无新增第三方依赖；运行时新增文本全部英文；prd/设计/实现文档中文。

## Notes

- 触发源复盘（本任务背景）：主会话 turn24 以 workloom_execute 派发 implement 执行器 fb157d57（深度 1）；其上下文含 session-context（norms 的 dispatch 条目）、breadcrumb（in_progress 文案含 dispatch workloom_execute 指引）；它主动调用 workloom_step 2.1 拿到 "Dispatch the implement executor..." 契约；workloom_execute 再派被 adapter maxDepth:1 拒绝后，其改用 subagent_with_model 成功派发 2 个 depth-2 孙代理（第三个被并发上限拦截）。
- 根因定性：① 编排契约与编排工具对子代理完全透明可及，且契约文本不感知委托深度；② 深度上限只作用在 workloom_execute 单一工具上，subagent_with_model 通道无深度检查，形成绕过路径。本任务以"注入裁剪（A）+ 工具面屏蔽（B）"双防线修复，其中 A 兜底 B 失效/不生效的场合（如 provider 缺 toolFilter capability 时部署降级）。
- adapter-pi 评估：pi executor 经 pi-args/executor 组装 child 上下文，若同样注入 breadcrumb/norms 与可派发指令则同构问题成立；本任务不修，另立任务时按 R3/R5 同策略迁移。
- 深度读取依赖 `@deepseek-ai/dsh-subagent/depth` 的 `delegationDepthOf`（现有依赖，无需新增）。
- 深度读取实现注：`@deepseek-ai/dsh-subagent/depth` 无 ./depth 导出子路径，adapter 按既有惯例从主入口 `@deepseek-ai/dsh-subagent` 导入 `delegationDepthOf`（同一符号，现有依赖）。
- B（部署层兜底，本仓库外，评审后确认采纳）：在 DSH 委派类工具行配置 `maxDepth: 1`（dsh-tool-subagent 及其 fork/ralph/workflow 等同类工具配置均支持；语义为 child 深度不得超过 1，顶层派发 depth-1 放行、depth-1 再派 depth-2 被拒），把"深度>0 再派发"从工具层通用切断，覆盖 agent-plane 委派工具（subagent_fork/ralph/workflow/list_agents/send_message/interrupt_agent）与全局层（subagent_with_model）。落地位置为部署 profile 的委派工具 config（不在本仓库内），由部署 owner 执行并在 B 落地后复核 AC3 的 agent-plane 部分。
- C（上游跟进，不阻塞）：向 DSH 提出为 spawn 侧暴露子代理 prospective 工具视图，或放宽 `tools.restrict` 未知名字语义为忽略/告警 —— 使 adapter 能把 agent-plane 候选精确入 deny；实现后可将 R2.3 求交源升级为父代理视图。
- 部署同步提醒：本机运行中的 DSH 加载的是 trellis-hotplug 旧 checkout（无 toolFilter 代码）；归档前按 repo/deployment spec 执行 sync + 用户侧 restart 确认。
