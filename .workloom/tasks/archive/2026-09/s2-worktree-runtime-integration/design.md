# S2 设计：worktree runtime 集成面

> 前提：S1 已交付（task.json `worktree_path` 项目根相对路径 + `branch`/`base_branch`；两端 create schema package 必填；容器 R1-Q1 统一注入机制、R1-Q10 指引面纳入）。本设计只覆盖 S2 PRD 需求 1-5，不动 core 生命周期逻辑与 research 守卫。

## 1. executor prompt 注入（core 单点，adapter 零改动消费）

**落点**：`packages/core/src/domain/executor-context.js` 的 `buildExecutorPrompt`（:341）内部——组装链已持有 `root` + `taskRelPath`，新增一次 `readTask(root, taskRelPath)`（复用 `domain/task-store.js` 导出，session-context.ts:20 同款先例）读取任务记录：

- `task.worktree_path` 非空 → 注入 `## Worktree` 纪律段（英文运行时文案），位置在 prd 软指针/artifact 块之后、`## Task prompt` 之前（与 Local directives 同层级的独立段）：
  - worktree 绝对路径 = `resolve(root, task.worktree_path)`（S1-Q1 相对路径在此 resolve）；
  - 纪律要点：所有代码读写/构建/测试命令一律指向该 worktree（bash 用 workdir/绝对路径）；任务元数据（jsonl/context/research/prd 等 `.workloom` 内容）一律写主仓 `.workloom`（注入清单里的相对路径按主仓根解析）；提交发生在 worktree 的任务分支 `task.branch`；
  - 附带 `Branch: <task.branch> (base <task.base_branch>)` 一行。
- `task.worktree_path` 为空 **或 readTask 失败** → 不注入该段，prompt 产物与现状零变化（AC1 回归面；readTask 失败静默降级不 fail loud——prompt 组装对缺失文件本就是宽容语义，见 readTaskFile:706 先例）。
- **参数面零变化**：`BuildExecutorPromptParams` 不加字段——两端 adapter（DSH `executor-injection.ts:44`、Pi `buildExecutorPromptWithPi`）调用点不动即自动获得注入（AC2 = 透传回归，非新接线）。
- 注入统计：纪律段为常量文本，不计入 filesInlined/filesPointed（非文件注入）；字节数自然计入 receipt 的注入总量（现有口径）。

## 2. session-context worktree 行

**落点**：`packages/core/src/service/session-context.ts`——`activeTaskContext`（:273）已 `readTask` 产出任务记录，gitLine（:322）之后新增条件行：

- 条件：活跃任务存在且 `task.worktree_path` 非空；
- 形态：`Worktree: <abs path> (branch <branch>, base <base_branch>)`（abs = `join(root, worktree_path)`；branch/base 空串降级省略对应括注段）；
- 无活跃任务 / worktree_path 空 / readTask 失败 → 行不出现（AC3、AC6 零变化面）；
- `LINE_LABELS` 增 `worktree: 'Worktree: '` 常量（冻结对象加一项，消费方无感）。

## 3. assets 指引面（英文文案，语言分工遵循 language spec）

| 文件 | 更新点 |
| --- | --- |
| `packages/assets/workflow/workflow.md` 2.1 | implement 阶段代码工作发生在任务 worktree（session-context Worktree 行给出路径）；executor 已由注入纪律约束，主会话不得在 implement 阶段写实现代码的既有纪律不变 |
| `packages/assets/workflow/workflow.md` 2.3 | 代码提交在 worktree 任务分支执行（`git -C <worktree>` 或 workdir）；journal/任务元数据的 bookkeeping 提交留主仓；两类提交不混合（commits spec 粒度纪律的 worktree 版表述） |
| `packages/assets/skills/workloom-finish/SKILL.md` | 脏文件检查扩展：主仓 `git status` 之外，活跃任务有 worktree 时补 `git -C <worktree> status --porcelain`（未提交代码提醒先提交/丢弃；worktree 存在性容错——目录缺失只提示不阻塞） |
| `packages/assets/skills/workloom-continue/SKILL.md` | 会话恢复路由：报告活跃任务 worktree 位置与分支状态（存在/缺失/脏），implement/check 阶段的工作目录指向 worktree |

文案改动保持最小 diff：只在既有段落追加 worktree 句，不重排结构。assets 文本断言面核查：`packages/core/test/contract-asset.test.js` 与 adapter 侧对 workflow/skills 文本的既有断言若钉住被改行则同步更新（实现时 grep 核对）。

## 4. AC5 回归核对（create schema，S1 已交付）

不改代码；核对两端 `tasks.ts` schema `required: ['title','package']` 与透传在位 + 各自测试断言存在（adapter-dsh `test/tasks.test.js`、adapter-pi `test/tasks.test.ts`），结论写入报告。

## 5. 测试计划（常规 TDD，S2 无先红接缝——容器 R1-Q7 划定注入为常规实现）

- `packages/core/test/executor-context.test.js` 增：worktree_path 非空 → 产物含 `## Worktree`、绝对路径、branch 行、纪律要点关键词；worktree_path 空/任务缺失 → 产物与基线零 diff（快照对比）；readTask 失败降级不抛。
- `packages/core/test/session-context.test.js` 增：有 worktree 活跃任务 → Worktree 行格式断言；无/空 → 行不出现；主仓 git 行不受影响。
- assets 文案：以既有 contract/文本断言机制为准（若无可断言面，报告文案审查结论即可，不新增脆断言）。
- 全量回归：core/adapter-dsh `node --test`、adapter-pi `bun test`、lint/typecheck/build；`enabled=false` 与无 worktree 任务两态零变化由上述快照对比背书（AC6）。

## 6. 部署与提交

`pnpm -r build` 后 adapter-dsh `dist/` 重建产物与 src 同 commit（deployment spec + AGENTS.md 插件变更流程；push 与 profile 锁重钉归用户在 3.1 后执行，agent 不 push）。core dist 同步入库。

## 7. 非目标

不改 executor 派发 cwd（两端保持主仓根）；不动 research 写守卫；不新增并发闸；不改 S1 生命周期语义；assets 只做最小追加不重写。
