## Goal

落地五项需求：config.yaml 注释迁移到 config.example.yaml、workloom 提问行为规范（用户语言/选项不进题/文字分批/禁交互工具）、子代理标题语义化。

## Requirements

1. 配置精简（仓库内 + init 模板同步）：
   - 本仓库 `.workloom/config.yaml` 只保留生效配置，删除全部说明注释；
   - 全部说明注释迁入 `.workloom/config.example.yaml`，example 重组为「真实生效值 + 每字段说明注释」、覆盖全部配置字段（session_commit_message/context_injection/prompt_injection/hooks/packages/default_package/subagents 的 string/map 双形式/executor.gate/config.local.yaml 深合并语义），成为唯一权威说明源；
   - init 模板同步：core `init.js` 的 CONFIG_TEMPLATE 改为无注释最小模板，并新增 example 模板，init 新项目时同时生成 `config.yaml`（无注释）与 `config.example.yaml`（全注释），两文件一并写入。
2. 提问行为规范（workflow.md 1.1 总纲 + `packages/assets/skills/workloom-brainstorm/SKILL.md` 改写，约束所有提问一视同仁，含固定问题与 brainstorm/grilling 探索提问）：
   - 用用户习惯的语言提问，语言判定交给模型自行判断；
   - 选项内容不进题目：题目只陈述问题，选项以编号列表单独呈现；
   - 任何 runtime 禁止使用交互式提问工具（ask_user_question 等），一律文字输出提问；
   - 禁止逐个提问：每阶段把当前已识别的全部待定问题一次性编号列出，用户自由逐条回答。
3. 子会话标题语义化（仅 DSH；Pi 的 child pi 为 --no-session 进程、无子会话标题概念，不适用）：adapter-dsh executor 的 startContinuable `label` 从 `workloom <kind>` 改为 `[Workloom <KindLabel>] <任务 title>`（Research/Implement/Check），title 取 task.json 的 title、完整不截断（UI 自行截断展示）。
4. workflow.md 因语义变更升 version 2 → 3。
5. executor 派发参数与配置冲突提示：主代理显式传入 model/effort 且与配置（config.yaml + config.local.yaml 深合并后、按 runtime 解析的生效值）不一致时，首次调用中断派发并返回提示（说明配置值、传入值与 force 用法）；执意使用时须带 `force: true` + `reason`（reason 必填，缺省报错），覆盖记录写入 task.json 的 `overrides` 字段（与既有 force 审计约定一致）。冲突判定用归一化比较：model 拆分 provider/model 后两者各自相等才视为一致（裸 id 与带前缀 id 因 provider 一侧缺失仍算冲突）；effort 字符串相等视为一致。字段独立判定（model/effort 各自触发）；配置无该 kind 条目时不触发。workloom_execute 参数面扩展 `force`/`reason`，两 adapter 同步。

## Acceptance Criteria

1. 仓库 `.workloom/config.yaml` 无注释，`loadConfig` 正常解析（subagents 前缀与 executor.gate 保持生效）；`.workloom/config.example.yaml` 覆盖全部字段并含说明注释与真实示例值。
2. init 新项目同时生成无注释 config.yaml 与全注释 config.example.yaml（测试断言模板内容）。
3. workflow.md 1.1 与 workloom-brainstorm SKILL.md 不再有「one question at a time」「Do not batch questions」等旧表述；含四条新规范（用户语言/选项不进题/禁交互工具/分批编号提问）；test-first 固定问题不再内嵌选项（语义保留、选项拆分呈现）。
4. adapter-dsh executor 派发的子会话标题为 `[Workloom Implement] <title>` 形式（测试断言，含 Research/Check 同理）。
5. 冲突提示：显式参数与配置不一致时首次调用中断并返回提示；`force: true` + `reason` 重试可覆盖并写入 task.json overrides；reason 缺失报错；归一化比较口径生效。
6. 验证全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core 与 adapter-dsh 的 `node --test`、adapter-pi 的 `bun test`。

## Notes

- 语言判定交给模型（Q1 C）；标题完整不截断（Q7 A）；中英混排标题接受（Q8）。
- 提问规范落地在契约与 skill 文案（软约束），不硬拦截提问工具（与 bash 绕过边界的既有哲学一致）。
- grilling 是运行时外部 skill，靠 workflow.md 1.1 总纲约束，不在本任务内改写其内容。
- 契约英文（assets 语言规范）；config example 注释英文（与既有风格一致）。
