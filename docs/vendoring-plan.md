# 第三方 skill vendoring 改写清单

Vendoring 来源：mattpocock/skills（MIT, Copyright 2026 Matt Pocock）。目标位置：`assets/third-party/mattpocock-skills/`。通用约定：文件头加来源标注；本地改动处加 `workloom:` 前缀注释标注偏离；上游更新按 diff 同步。

## tdd（skills/engineering/tdd）

1. 署名与许可：SKILL.md/tests.md/mocking.md 加 frontmatter `license: MIT` + 来源标注。
2. description 触发分支：保留原文触发词，追加“workloom 任务中 prd.md 明确要求 test-first 交付时”。
3. Seams 节锚定：seams 确认并入 Phase 1.1b grilling 对齐，确认结果写入 prd.md 验收标准，无灰区 gate 对 seams 同样生效。
4. 引用改写（不留外部依赖）：
   - “call the Skill tool with codebase-design” → “接口形态本身存疑时，把 seam 归属作为 design-tree 的一个 frontier 节点纳入 Phase 1.1b grilling 拷问”。
   - “see the code-review skill” → “refactoring 归 review 阶段：workloom 中即 W8 check（对照 spec 与验收标准自查自修）”。
5. agents/openai.yaml：加注释“面向 Claude Code/Codex；workloom 的 DSH/Pi adapter 不消费”，原样保留供 diff 同步。
6. 不改：tests.md/mocking.md 正文、CONTEXT.md 读取约定、skill 名 `tdd`。

## grilling（skills/productivity/grilling）

1. 署名与许可标注。
2. 文件头加一句锚定：“workloom 中由 Phase 1.1b 驱动；通用方法正文不改”。

## writing-for-agents（skills/productivity/writing-for-agents）

1. 署名与许可标注。
2. description 触发分支扩展：“workloom 中所有面向 agent 的文档（prd/design/implement/spec/journal）”。
3. 正文不改。

## Phase 1.1b 固定 frontier 问题（workflow 指引，非第三方文件）

含实现工作的任务必问，纯文档/调研类跳过：

> **实现策略**：实现阶段是否要求 test-first（TDD red-green）交付？
> - A. 是：seams 并入本次对齐范围，实现按 red-green 循环执行。
> - B. 否：常规实现，按 lint/typecheck 验证。
> - C. 仅关键路径：只对 prd 中标注的核心逻辑约定 seams。

原则：seams 确认规则正文只存在于 tdd skill 一处；workflow 指引（W7）只放 pointer，不复述规则。
