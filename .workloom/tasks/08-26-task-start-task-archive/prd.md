## Goal

在工具层为 workloom 流程增加硬性卡点，杜绝"跳过 1.1 对齐 / 1.3 配置 / 2.2 check 直接 start → implement → archive"的抄近道行为（源于会话 session-f98c8040 的复盘）。

## Requirements

- 卡点强度：**默认硬阻断 + force 豁免**。校验失败直接报错拒绝执行；提供 force 参数（或配置项）作为显式豁免出口，hotfix 场景可绕过但需留痕。
- `workloom_task_start` 校验范围：**prd.md + implement.jsonl + check.jsonl 三者都必须有实际内容**（prd 四小节脱离 placeholder；两个 jsonl 各至少一条非 `_example` 的有效记录）。没有 spec 可引用的任务走 force 豁免。
- `workloom_task_archive` 校验凭据：**新增 `workloom_task_check` 工具**，2.2 通过后由主会话显式调用，向 task.json 写入 check 字段（passedAt + summary）；archive 校验该字段存在，以此倒逼 check 环节不可跳过。
- 存量任务兼容：**不区分新旧，archive 统一硬阻断**——无 check 字段一律报错；存量任务要么补跑 check 要么 force 豁免（overrides 留痕）。不引入 schema 版本标记，避免永久豁免口子。
- force 豁免留痕：**task.json 增加 `overrides` 数组**，每次 force 调用追加一条 `{gate, tool, at, reason?}` 记录，支持事后审计哪些任务绕过过关卡。
- 测试先行：**是（A）**，接缝纳入对齐范围，先写失败测试再实现。

## 设计决策（grilling 结论）

1. ~~新旧任务判定~~（已废弃：统一硬阻断后无需区分新旧，不引入 `schemaVersion` 字段）。
2. prd placeholder 判定：小节正文 trim 后与骨架 placeholder 文本完全一致才算未填写；逐小节判定，任一小节未填即校验失败。
3. `workloom_task_check`：参数 `summary`（必填）+ `taskPath`（可选）+ `force`（可选）；要求任务处于 `in_progress`；重复调用覆盖 check 字段并刷新 passedAt；check 字段结构 `{passedAt, summary}`。
4. `overrides` 元素结构：`{gate, tool, at, reason?}`；三个卡点工具（start / check / archive）均支持 force，统一记录。
5. task_check 防绕过：要求 check.jsonl 存在有效记录才允许写 check 字段（可用 force 豁免）；"必须真跑过 check executor"跨会话无法可靠校验，接受残余风险，summary 留痕供审计。
6. start 与 archive 卡点均不区分新旧任务，统一硬阻断。

## Acceptance Criteria

1. `workloom_task_start` 在 prd.md 任一 `##` 小节仍为 placeholder、或 implement.jsonl / check.jsonl 无有效记录（仅 `_example` 种子行不算）时返回错误并拒绝执行；携带 force 参数时放行并向 task.json `overrides` 追加记录。
2. `workloom_task_archive` 在 task.json 无 check 字段时返回错误并拒绝（不区分新旧任务）；force 参数放行并记录 overrides。
3. 新增 `workloom_task_check` 工具：向当前任务 task.json 写入 check 字段（passedAt 自动生成 + summary），adapter-dsh 与 adapter-pi 均注册。
4. 测试先行接缝（均已覆盖，先失败后实现）：prd placeholder 判定、jsonl 有效记录判定、startTask 门禁集成、archiveTask 门禁集成（含 force 放行与 overrides 记录）、taskCheck 写字段。
5. `pnpm lint`、`pnpm -r typecheck`、`packages/core` 与两个 adapter 的测试命令全部通过。

## Notes

- 校验逻辑落在 core（runtime 无关层，legacy 纯 JS 模块），adapter-dsh / adapter-pi 仅做参数透传与工具注册。
- 同步更新 `packages/assets/workflow/workflow.md` 契约（1.4/2.2/3.1 补 workloom_task_check 环节说明）与 surface.ts 的工具描述/状态提示文案。
- 交付物含设计阶段 grilling 结论（design.md）。
