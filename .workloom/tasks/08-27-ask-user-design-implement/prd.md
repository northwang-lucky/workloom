## Goal

workflow 契约中 design.md/implement.md 的编写时机不明确（仅 1.4 括号附带提及 "for complex tasks"），导致 agent 写完 prd.md 后直接停在 review 门禁、不主动产出 design/implement。改进：去掉"复杂任务"模糊判定，改为契约规定在 prd.md 定稿后、交付 review 前主动询问用户是否编写 design.md/implement.md。

## Requirements

### R1 触发前提（已对齐）

仅"涉及实现工作的任务"必问（复用 1.1 已有的"涉及实现工作"概念，与 test-first 固定问题同款前提）；纯文档/调研类任务不询问。

### R2 选项形态（已对齐）

两选项：都写 / 都不写（design.md 与 implement.md 捆绑，不拆粒度）。

### R3 契约位置（已对齐）

不新增步骤编号：改写 1.4 内部顺序为「prd.md 定稿后先询问是否编写 design/implement → 按需编写 → 将全部交付物交给用户 review → 确认后 start」；步骤编号不变，planning 面包屑同步更新。

### R4 改动范围（已对齐）

仅改 `packages/assets/workflow/workflow.md`（1.4 正文 + planning 面包屑）；brainstorm SKILL.md 门禁措辞保持不变（"门禁未过不得写 design/implement" 与新流程不冲突）；core 的 workflow-contract 测试用合成文档，无需改动。

## Acceptance Criteria

(placeholder: list the verifiable acceptance criteria)

## Notes

(placeholder: add notes and constraints)
