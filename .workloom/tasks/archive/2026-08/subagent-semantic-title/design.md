# 设计：子会话标题语义来源改为模型生成

## 1. 参数面与 title 组装（adapter-dsh）

- `workloom_execute` schema 增加可选 `title`（string，描述文案用 `PARAM_DESCRIPTIONS.titleExecutor` 变体键——`title` 键已被 taskCreate 占用，沿用 taskPathExecutor/forceExecutor 变体先例）。
- `buildChildLabel(root, taskRelPath, kind, title?)` 扩展第 4 参：
  - title 非空字符串 → `[<KindLabel>] <title>`；
  - 缺省 → `[<KindLabel>] <task title>`（既有 readTask 路径）；
  - task title 缺失/空白 → 整体回退 `workloom-<kind>`（连字符形式，刻意调整）。
- 前缀字符串从 `[Workloom ` 改为 `[`（拼装处一处改动，KIND_LABELS 不变）。

## 2. adapter-pi

- EXECUTOR_PARAMS 增加 `title: Type.Optional(Type.String({description: PARAM_DESCRIPTIONS.titleExecutor}))`；接收后不消费（无标题概念），不报错。

## 3. core surface 与契约

- PARAM_DESCRIPTIONS 新增 `titleExecutor`：英文文案，说明「子会话标题的语义部分；缺省回退任务标题；仅 DSH 生效」。
- TOOL_SNIPPETS.executor 加 `title?`。
- workflow.md：step 2.1 附近加一句建议「派发时给出语义化 title」；version 3 → 4。

## 4. 测试

- adapter-dsh：title 传入组装（前缀无 Workloom）、缺省回退 task title、title 缺失回退 `workloom-<kind>`、schema 含 title。
- adapter-pi：schema 含 title 参数。
