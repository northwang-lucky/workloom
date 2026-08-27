## Goal

workflow 契约中 design.md/implement.md 的编写时机不明确（仅 1.4 括号附带提及 "for complex tasks"），导致 agent 写完 prd.md 后直接停在 review 门禁、不主动产出 design/implement。改进：去掉"复杂任务"模糊判定，改为契约规定在 prd.md 定稿后、交付 review 前主动询问用户是否编写 design.md/implement.md。

## Requirements

### R1 触发前提

仅"涉及实现工作的任务"必问（复用 1.1 已有的"涉及实现工作"概念，与 test-first 固定问题同款前提）；纯文档/调研类任务不询问。

### R2 选项形态

两选项：都写 / 都不写（design.md 与 implement.md 捆绑，不拆粒度）。

### R3 契约位置

不新增步骤编号：改写 1.4 内部顺序为「prd.md 定稿后先询问是否编写 design/implement → 按需编写 → 将全部交付物交给用户 review → 确认后 start」；步骤编号不变，planning 面包屑同步更新。

### R4 改动范围

仅改 `packages/assets/workflow/workflow.md`（1.4 正文 + planning 面包屑）；brainstorm SKILL.md 门禁措辞保持不变（"门禁未过不得写 design/implement" 与新流程不冲突）；core 的 workflow-contract 测试用合成文档，无需改动。

### R5 询问语义（grilling G1）

契约保持 runtime 无关：只写通用语义 "ask the user whether to author design.md/implement.md"，不点名具体工具；DSH 映射到 ask_user_question、Pi 映射为文本提问，由各 adapter 自行落地。

### R6 答"都写"后的顺序（grilling G2）

先写完 design.md 与 implement.md，再将 prd+design+implement 作为完整 review 包一次性交付用户 review。

### R7 推荐标注（grilling G3）

契约只定义两个选项与后续动作，不强制推荐标注；是否标推荐、推荐哪个由 agent 按任务情况决定。

### R8 completion criteria（grilling G4）

1.4 完成判据补充：对涉及实现工作的任务，design/implement 询问已作答；加上原有的 status 为 in_progress、用户已确认 review。

### R9 测试策略（固定问题）

不涉及实现工作，常规交付；验证靠 workflow-contract 解析测试与 pnpm 验证命令。

## Acceptance Criteria

1. `packages/assets/workflow/workflow.md` 的 1.4 正文改为：涉及实现工作的任务在 prd.md 定稿后询问用户是否编写 design/implement（两选项：都写/都不写）；答"都写"则先写两份文档；随后将全部交付物交给用户 review，确认后 `workloom_task_start`。文中不再出现 "for complex tasks" 模糊判定。
2. 1.4 completion criteria 含三条：design/implement 询问已作答（涉及实现工作的任务）、用户已确认 review、task.json status 为 in_progress。
3. planning 面包屑文案与新 1.4 顺序一致（含"询问是否编写 design/implement"环节）。
4. 契约保持 runtime 无关：不出现 ask_user_question 等具体工具名。
5. `cd packages/core && node --test test/*.test.js` 与 `cd packages/adapter-dsh && node --test test/*.test.js` 全绿；`pnpm lint`、`pnpm -r typecheck` 通过。

## Notes

- 编辑面向 Agent 的文档前加载 writing-for-agents skill。
- 遵循 `.workloom/spec/repo/deployment/`：assets 改动后按部署同步纪律处理 adapter 分发产物。
- 1.2 Research 跳过：事实已在会话内查清（契约文本、adapter 消费方式、测试布局均已确认）。
