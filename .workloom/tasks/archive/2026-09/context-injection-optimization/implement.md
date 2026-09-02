# Implement：test-first 切片计划

按 ⑤→①→②→③→④ 顺序，红→绿逐切片。③ 内含"先测"步骤，测量数据落任务 Notes。

## 切片 1：⑤ 护栏（加载协议句 + marker 回声）

- 红：契约资产测试逐字断言——执行器纪律段含强制加载协议句与"报告首行回显注入标记"要求；执行器注入测试断言注入文本含唯一 marker token（同任务两次派发 token 不同）。
- 绿：`workflow.md` 契约版本号 17→18 + 纪律句；`executor-context.js`（或派发侧）生成并注入 token；执行器契约渲染纳入回显要求。

## 切片 2：① jsonl 纯指针

- 红：注入输出断言——两角色（implement/check）注入只含"路径 + reason + 先读后判"指针行；断言无清单文件全文进入注入；stats 口径更新（指针行不计 inlined）有断言。
- 绿：`materializeJsonlEntries` 改造，撤全文内联与预取；截断/索引降级逻辑按指针模式简化；预算兜底不动。

## 切片 3：② artifacts 提取

- 红：断言 prd Requirements/Acceptance 全文保留、Goal/Notes 只留标题指针；design/implement 只进 H2 目录 + 文件指针；research/*.md 只给路径不内联正文。
- 绿：artifact 组装逻辑按节提取改造。

## 切片 4：③ 主会话注入先测后瘦

- 测：量化主会话注入各块字节数（状态块字段、norms、Local directives、Guidelines），数字记任务 Notes。
- 红：被瘦部分的压缩断言 + norms 段逐字未动断言（防误伤纪律）。
- 绿：只改测量证实有收益的部分；若无收益，交付测量报告 + "不动"结论。

## 切片 5：④ 交付时过滤

- 红：无 LSP 工具的环境注入不含 LSP 段；平台标签块只含当前平台（adapter-dsh 测试不见 Pi 文本）。
- 绿：注入组装侧按能力/平台过滤。

## 回归与验收

- 回归：`pnpm -r build`、三包测试、`pnpm lint`、`pnpm -r typecheck`、改动文件 LSP diagnostics。
- 验收测量：用任务 A 的 receipt 注入统计，对同一夹具任务做优化前后同 kind 派发，实测数字记任务 Notes（S6 口径：测试只断言口径存在可对比，真实数字进验收报告）。
- 禁止 commit/push/workloom check，固定格式报告。
