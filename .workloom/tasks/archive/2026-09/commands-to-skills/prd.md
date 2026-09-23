# continue/finish 命令改造为 skill 并收紧自动提交工具 slug 约束

## Goal

1. 把 `/workloom-continue`、`/workloom-finish` 从 slash 命令彻底改造为 skill 形态：命令入口从双 adapter 移除，模型按 skill description 自动触发；core 中为命令服务的动态编排（`buildContinueGuidance` 的任务状态路由、`buildFinishGuidance` 的脏文件检查）随命令一起删除，流程指引改写为 skill 静态指令，由模型自行读取 task.json / git status 判断。
2. 收紧自动提交类工具：`workloom_task_archive`、`workloom_journal` 必须显式传入任务标识才能执行，并把 git 暂存范围从整个 `.workloom` 收窄到该任务相关路径，杜绝归档/记录日志时卷入其他在途任务的脏文件。

## Requirements

1. **新增两个 skill 资产**：`packages/assets/skills/workloom-continue/SKILL.md` 与 `packages/assets/skills/workloom-finish/SKILL.md`。
   - `workloom-continue`：承载原 continue 命令的路由指引（planning 无 prd → 1.1；planning 有 prd → 判断轻重/产物齐备 → 1.4 待评审；in_progress 未实现 → 2.1；已实现未 check → 2.2；check 通过 → 2.3 → 3.1），路由判断改写为「模型自行读取活跃任务 task.json 状态与 git 状态」的静态指令；description 覆盖「继续任务/会话恢复/continue/resume」类触发词。
   - `workloom-finish`：承载原 finish 命令的收尾指引（脏文件检查与分类处置 → 归档活跃任务、其他已完成任务一次性确认后归档 → `workloom_journal` 记录会话 → 提出 spec 候选），脏文件检查改写为「模型自行执行 git status 判断」的静态指令；description 覆盖「收尾/wrap up/finish/归档记录」类触发词。
2. **移除两个 slash 命令**：adapter-dsh 与 adapter-pi 的 `commands.ts` 删除 continue/finish 注册与处理函数；core 删除 `buildContinueGuidance`、`buildFinishGuidance`、`routeNextStep`（含 route-service 模块）、`ASSET_COMMAND_CONTINUE`、`ASSET_COMMAND_FINISH` 及 `COMMAND_NAMES`/`COMMAND_DESCRIPTIONS` 中对应条目；删除 `packages/assets/commands/workloom-continue.md`、`workloom-finish.md` 资产；清理上述内容的全部测试。
3. **skill 注册**：adapter-dsh 的 skills 清单（`SKILL_ASSETS`）加入两个新 SKILL.md；adapter-pi 的 `sync-skills.mjs` 的 `SKILL_SOURCES` 加入两个新 skill 目录。
4. **slug 必填**：`workloom_task_archive` 的 `taskPath` 参数改为必填（接受 `tasks/<slug>` 或裸 `<slug>`，复用现有解析）；`workloom_journal` 新增必填 `taskPath` 参数（同解析规则）；缺参时工具报错拒绝执行。双 adapter 的 schema、`TOOL_DESCRIPTIONS`/`TOOL_SNIPPETS`/`PARAM_DESCRIPTIONS` 文案同步。
5. **暂存范围收窄**：`gitAddCommit` 不再固定 `git add -- .workloom`；archive 只暂存该任务相关路径（`tasks/<slug>` 的删除、`archive/<slug>` 的新增、活跃任务指针等状态文件），journal 只暂存本次写入的 journal 文件；其他在途任务的脏文件零接触。
6. **契约与文案同步**：`workflow.md` step 3.1 与收尾段的 `/workloom-finish` 命令引用改为「加载 workloom-finish skill」；`TASK_ARCHIVE_NOTE` 等 surface 文案同步；adapter 注释中命令数量/资产路径描述同步。

## Acceptance Criteria

1. 双 adapter 不再注册 continue/finish 命令；core 的公开导出中不存在 `buildContinueGuidance`/`buildFinishGuidance`/`routeNextStep`/`ASSET_COMMAND_CONTINUE`/`ASSET_COMMAND_FINISH`；`packages/assets/commands/` 下无 continue/finish 资产。
2. `packages/assets/skills/` 下存在 `workloom-continue/SKILL.md` 与 `workloom-finish/SKILL.md`（front-matter 含 name/description，正文为完整静态指引）；DSH 注册清单与 Pi 同步脚本均包含二者；`pnpm -r build` 后 `packages/adapter-pi/skills/` 出现两个新 skill 目录。
3. `workloom_task_archive` 缺 `taskPath` 调用即报错拒绝；`workloom_journal` 缺 `taskPath` 调用即报错拒绝。
4. 构造两个在途任务（各有未提交变更），对其中一个执行 archive/journal 的 auto-commit 后，另一个任务的脏文件保持未提交原样。
5. `packages/assets/workflow/workflow.md` 与 core surface 文案中不再引用 `/workloom-finish`、`/workloom-continue` 命令。
6. `/workloom-init`、`/workloom-doctor` 命令行为不变。
7. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`packages/core` 与双侧 adapter 测试全部通过。

## Notes

- 根因事实：`packages/core/src/legacy/git.js` 的 `gitAddCommit` 固定执行 `git add -- .workloom`，把整个 `.workloom` 目录全部暂存；其他在途任务的 task.json/jsonl 变更因此会被 archive/journal 的 auto-commit 卷入。
- 连带死代码：`packages/core/src/service/route-service.ts`（`routeNextStep`）仅被 `buildContinueGuidance` 消费，continue 命令移除后成为死代码，一并清理（含其测试与 core 导出）。
- 范围纪律：`/workloom-init`、`/workloom-doctor` 保持 slash 命令形态不变；skill 触发基础设施（DSH `ctx.skills.register` 清单、Pi `sync-skills.mjs` 的 `SKILL_SOURCES`）按现有 6 skill 先例扩展，不改机制本身。
- 双 runtime parity：adapter-dsh 与 adapter-pi 必须同步落地，行为一致。
- UI：本任务无前端 UI 呈现，UI 设计节点不适用。Test-first：不适用，按仓库既有测试纪律更新/新增必要测试（命令删除波及测试清理、slug 必填与提交范围收窄的行为测试）。
- 不拆分说明：本任务仅「命令转 skill」与「slug 约束+范围收窄」两个交付块，且共享 workflow.md、surface.ts、双 adapter 等文件，耦合紧密，不满足 3+ 独立交付件的拆分条件。

## Alignment Decisions

### 已收敛

1. **建任务执行**：改动跨 assets/core/双 adapter，走完整 workloom 生命周期（用户确认选项 A）。
2. **命令入口处置**：彻底移除 `/workloom-continue`、`/workloom-finish` 两个 slash 命令，纯靠 skill 的 description 让模型自动触发，同 `workloom-alignment` 的模式（用户确认选项 B）。
3. **动态编排归属**：core 的 `buildContinueGuidance`/`buildFinishGuidance` 删除，流程改写为 skill 里的静态指令，由模型自己读 task.json / git status 判断（用户确认选项 B）。
4. **slug 约束对象**：自动提交类工具为 `workloom_task_archive` 与 `workloom_journal` 两个（fact check 确认仅此两个工具触发 `gitAddCommit`），二者都必须显式传入任务标识才能执行。
5. **skill 拆分与命名**：两个独立 skill `workloom-continue`、`workloom-finish`，与原命令语义同构、触发精度最高（用户确认选项 A；备选合并为单 skill 因触发词混杂、内聚性差被否决）。
6. **slug 参数形态**：复用现有 `taskPath` 参数改必填（archive），journal 新增必填 `taskPath`；不引入同义 slug 参数（用户确认选项 A；备选双参数并存因需额外冲突优先级规则被否决）。
7. **暂存范围收窄**：archive 只暂存本任务相关路径，journal 只暂存本次 journal 文件，其他任务脏文件零接触（用户确认选项 A；备选仅加参数不收窄因不根治卷入问题被否决）。

### 待决节点

无。

### 收敛摘要

设计树 8 个根节点全部走完：目标与价值、范围与非目标（init/doctor 不动、触发机制不动）、环境约束（双 runtime parity、仓库 spec）、可观测验收（7 条）、UI/test-first（均不适用）、关键决策（上述 7 项）、边界与失败路径（死代码清理、未知命令行为、其他任务脏文件零接触）、收敛确认。三轮问答后前沿为空，无遗留灰色地带。

<!-- workloom:open-nodes=none -->
