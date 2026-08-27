# 设计：配置注释迁移、提问行为规范与子代理标题语义化

## 1. 配置精简与 example 重组

- **仓库 `.workloom/config.yaml`**：删除全部注释，只留生效值（packages/subagents/executor.gate 等现状值不变）。
- **仓库 `.workloom/config.example.yaml`**：以本仓库生效值为基，重组为「带值示例 + 每字段说明注释」，覆盖全部配置字段：session_commit_message/max_journal_lines/session_auto_commit/context_injection/prompt_injection/hooks/packages/default_package/subagents（string 与 map 双形式）/executor.gate；头部注释说明 config.local.yaml 深合并语义与缺 runtime key fail loud。成为唯一权威说明源。
- **core init.js 模板拆分**：
  - `CONFIG_TEMPLATE` 改为无注释最小内容（空内容模板，仅写文件占位）；
  - 新增 `CONFIG_EXAMPLE_TEMPLATE`：通用默认值形态的带值示例 + 全字段注释，与 `DEFAULT_CONFIG` 逐项对齐（沿用「模板与默认值对齐」既有约定）；
  - `initWorkloom` 同时生成 `config.yaml`（无注释）与 `config.example.yaml`（全注释），`created` 清单包含两个文件；
  - FILE_NAMES 增加 example 文件名常量。
- 仓库 example 与 init example 允许内容不同（前者是仓库专属生效值，后者是通用默认值），但 init example 须逐项覆盖 DEFAULT_CONFIG 字段（测试断言）。

## 2. 提问行为规范（契约与 skill 文案）

- **workflow.md 1.1** 新增/改写四条规范（英文）：
  1. 用用户习惯的语言提问（语言由模型判断）；
  2. 选项内容不进题目：题目只陈述问题，选项以编号列表单独呈现；
  3. 任何 runtime 禁止使用交互式提问工具，一律文字输出提问；
  4. 禁止逐个提问：每阶段把当前已识别的全部待定问题一次性编号列出，用户自由逐条回答。
- test-first 固定问题语义保留，但不再内嵌选项；1.4 的 design/implement 问题同理拆分。规范适用于全部提问（固定问题与探索提问一视同仁）。
- **workloom-brainstorm/SKILL.md** 改写：「one question at a time」「Do not batch questions」反转为分批编号提问；固定问题部分同步拆分选项与语言要求。
- workflow.md version 2 → 3（语义变更，消费端不比较 version，已验证安全）。

## 3. 子会话标题语义化（adapter-dsh）

- executor.ts 的 startContinuable `label` 从 `` `workloom ${params.kind}` `` 改为 `[Workloom <KindLabel>] <task title>`：
  - KindLabel 常量映射：research→Research、implement→Implement、check→Check（枚举，禁 Magic String）；
  - title 取 `readTask(root, taskRelPath)` 的 `task.title`（taskRelPath 已在 resolveTaskRelPath 拿到）；title 缺失/读取失败时回退原 label（防御）。
- Pi 不适用（--no-session 无标题概念）。

## 4. executor 派发参数与配置冲突提示（core + 两 adapter）

- **core 新增纯函数**（放 legacy/config.js 就近或 executor-context.js）：`detectExecutorConflicts(config, kind, overrides, runtime)`：
  - 仅当 `sources.model === 'param'`（显式传入）且配置该 kind 有条目时比较：归一化（splitProviderModel）后 provider 与 model 各自相等才算一致；undefined provider 只匹配 undefined provider（裸 id vs 带前缀 → 冲突）；
  - effort：显式传入且配置有条目且字符串不等 → 冲突；
  - model/effort 独立判定，返回冲突清单（如 `[{field: 'model', configured: '...', passed: '...'}]`）。
- **中断与 force 流程**（core 组装提示文案，英文）：有冲突且 `force !== true` → 工具返回提示文本（不派发），文案含配置值/传入值/force+reason 用法；`force === true` 且 reason 缺失 → 报错；`force === true` + reason → 放行派发并记录。
- **记录**：task-gates.js 的 GATES 新增 `EXECUTOR_MODEL_EFFORT` 门（gate/tool 枚举配套），task-store.js 新增 `recordExecutorOverride(root, taskRelPath, reason)` 向 task.json overrides 追加 `makeOverride(...)`；由 adapter 在 force 放行后调用（记录失败 WARNING 不阻塞派发）。
- **参数面**：workloom_execute 增加 `force: boolean`（默认 false）与 `reason: string`，PARAM_DESCRIPTIONS 补文案（英文），两 adapter 的 schema（DSH 注册面 / Pi TypeBox）同步；TOOL_SNIPPETS.executor 同步更新。
- **receipt**：force 放行时 receipt 行来源标注追加 `(forced)` 标记，便于审计可见。

## 5. 测试缝（test-first）

1. core：detectExecutorConflicts 归一化比较/独立判定/无配置条目不触发；recordExecutorOverride 写入与 reason 缺失报错路径。
2. adapter-dsh：label 组装（KindLabel 映射、title 缺失回退）；force/reason 参数面校验与中断提示接线。
3. core init：双模板生成（无注释 config.yaml + 全注释 example，example 覆盖 DEFAULT_CONFIG 字段）。
纯文案资产（workflow.md/SKILL.md/config 文件）不适用红绿循环，用 lint 与既有断言覆盖。
