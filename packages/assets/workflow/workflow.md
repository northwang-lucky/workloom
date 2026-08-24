---
version: 1
states:
  - no_task
  - planning
  - in_progress
  - completed
---

# workloom 工作流

## 总则

1. 一步一状态：任何时刻有且只有一个活跃任务；任务状态由任务管理工具维护，breadcrumb 反映当前状态。
2. 先对齐后实现：需求未达到“无灰区”标准（每条需求可判定、无歧义、无未决假设）前，不得编写实现代码。
3. 产物落盘：需求、设计、研究、会话记录一律写入 `.workloom/tasks/` 与 `.workloom/workspace/`，对话会压缩，文件不会。
4. 提交权在主会话：子代理实现与检查，git 提交只发生在主会话的 Phase 2.3 与 Phase 3。

## Phase 1 规划

#### 1.0 创建任务

用户表达值得做的工作后，创建任务（`workloom_task_create`），任务进入 `planning` 状态。
完成判据：任务目录存在，`task.json` 的 `status` 为 `planning`。

#### 1.1 需求对齐

先加载 brainstorm skill 逐题探索需求，澄清“要什么、约束是什么、验收怎么判”；含设计决策的任务接着加载 grilling skill，用 design-tree 方式轮次拷问方案，每问给出推荐答案。含实现工作的任务必须问固定问题：实现策略是否要求 test-first（A. 是：seams 并入对齐范围；B. 否：常规实现；C. 仅关键路径）。选 A/C 时，seams 确认结果写入 prd.md 验收标准。
完成判据（硬性 gate）：最终对齐的需求无灰区——每条需求可判定、无歧义表述、frontier 无未决假设。

#### 1.2 研究（可选）

需要代码/技术调研时派发 research 执行体；每个主题一个文件写入任务目录的 `research/`，只回报文件路径与一行摘要。
完成判据：调研结论落盘，且被 1.3 的上下文清单引用或明确不引用。

#### 1.3 配置上下文

为 implement.jsonl 与 check.jsonl 填入真实条目（`{"file": "<路径>", "reason": "<为什么>"}`），只放 spec 与 research，不放代码路径。
完成判据：两个 jsonl 各至少一条真实条目（seed 的 `_example` 行不算）。

#### 1.4 评审与启动

把 prd.md（复杂任务含 design.md/implement.md）交给用户评审，获确认后 `workloom_task_start`，任务进入 `in_progress`。
完成判据：`task.json` 的 `status` 为 `in_progress`，且评审已获用户确认。

## Phase 2 执行

#### 2.1 实现

派发 implement 执行体（模型与 effort 按任务配置），上下文由派发方注入（spec、research、prd/design/implement）。子代理写代码、跑 lint 与 typecheck，禁止 git commit。test-first 任务按 tdd skill 的 red-green 循环执行。
完成判据：改动完成、lint 与 typecheck 通过、按固定格式回报文件清单与验证结果。

#### 2.2 检查

派发 check 执行体对照 spec 与任务产物自查自修，跑 lint 与 typecheck；任务最后一次检查必须全量范围。
完成判据：对照结果无未解决问题，lint 与 typecheck 全绿。

#### 2.3 提交

主会话分批提交：每个逻辑改动一个 commit，message 用 `<type>(<scope>): <描述>` 格式。
完成判据：`git status` 无本任务相关脏文件。

## Phase 3 收尾

#### 3.1 归档与记录

执行 `workloom_finish`：检查脏文件 → 归档任务（`workloom_task_archive`）→ 记录会话（journal）。归档与记录各自产生自动提交。
完成判据：任务在 `archive/` 下且 `status` 为 `completed`，journal 已记录本次会话。

[workflow-state:no_task]
当前没有活跃任务。用户表达新需求时：先判断是简单问答还是值得建任务的工作；值得建任务的工作走 Phase 1.0 创建任务，再按 planning 指引推进。
[/workflow-state:no_task]

[workflow-state:planning]
任务处于规划阶段。按 Phase 1 推进：需求对齐（brainstorm + grilling，无灰区 gate）→ 可选研究 → 配置上下文 → 用户评审后启动。未获评审不得写实现代码；对齐未达无灰区不得进入文档编写。
[/workflow-state:planning]

[workflow-state:in_progress]
任务实现中。按 Phase 2 推进：实现 → 检查 → 提交。子代理产物落盘，主会话控制提交；未完成 2.2 检查不得宣布完成。
[/workflow-state:in_progress]

[workflow-state:completed]
任务已归档。用户继续提需求时，评估是否新建任务（走 1.0）；不要修改归档目录下的任务。
[/workflow-state:completed]
