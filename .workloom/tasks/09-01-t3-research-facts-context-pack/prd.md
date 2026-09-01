# T3 research-facts 格式规范与上下文包

## Goal

为 research 产物的「供 implement 直接消费」格式立标准、增强 research agent 契约，
并交付 research 产物 → 锚点索引的解析器与任务级上下文包（T1 的 files 清单消费源）。

## Requirements

1. **research 契约增强**：`EXECUTOR_CONTRACT_BY_KIND.research`（executor-context.js
   95-97）追加结构化块要求：节标题（`##` + 要点句）、每条结论带 `文件:行号` 锚点、
   关键代码摘录（代码围栏）；保留"ground every conclusion / cite file paths /
   separate verified findings"根。
2. **spec 标准**：`.workloom/spec/repo/research-facts/`（index.md 索引 + detail 文件，
   按 `packages/assets/templates/spec-index.md` 形态）规定：结构化块语法、锚点语法
   （`路径:行号`，路径相对任务相关仓库根）、摘录边界、解析器契约。
3. **模板资产**：`packages/assets/templates/` 新增 `research-facts.md`（产物模板，
   含结构化块示例），spec 引用之。
4. **解析器（core，legacy 纯 JS + JSDoc 约定）**：解析任务目录 `research/*.md` →
   锚点索引（每节：标题/要点/锚点列表/代码摘录）；兼容 cardx 样本现有形态
   （表格「主题|事实（带路径）」+ `路径:行号` + go 代码块）；无法解析的结论标记
   unverified（不丢信息）。
5. **上下文包落盘**：解析结果按 `git rev`（任务所在仓库 HEAD）写
   `.workloom/tasks/<task>/context/`（锚点索引 + files 清单，文件格式实现定）；
   git rev 变化自动失效重建；无 research 产物时产物为空（不报错）。
6. **消费接口**：提供读取 API（含 files 清单）供 T1 注入使用（T1 实现空位，T3
   交付后 T1 补测）。

## Acceptance Criteria

1. research 契约文本含结构化块三要素（节标题/锚点/摘录）要求。
2. spec 索引 + detail + 模板资产落地，团队会话 guidelines 清单可见（注入验证）。
3. 解析器单测：cardx 样本（`08-31-cardx-auth-refresh/research/`）可解析出
   结构化节 + `文件:行号` 锚点 + 代码摘录；坏行/缺锚点结论标 unverified 不丢。
4. 上下文包落盘 + git rev 失效重建单测（改 HEAD 后重解析）；无产物空包不报错。
5. files 清单为去重文件路径数组（相对路径），供 T1 seed 注入。
6. 回归：`packages/core` `node --test test/*.test.js`、`pnpm -r typecheck`、
   `pnpm lint`、`pnpm -r build`；LSP 诊断干净。

## Notes

- 用户级 `~/.agents/skills/research`（搜索技能）不在本任务范围（容器裁决）。
- spec 组织参考：现有 `repo/code-style` 等索引形态（无 front-matter 的 index.md +
   detail 文件）；cardx 样本是格式范本（423 行：表 + `路径:行号` + 代码块）。
- 解析器随 core legacy 模块约定（JSDoc、纯 JS、node --test），不引第三方。
- 容器已定：不做兼容开关；20K 截断由 T1 实现，本任务只保证锚点区在文档头部可截。
