# 执行器指令冲突治理：契约 stage 正交化与 fork 接续兜底

## Goal

消除 workloom 给主会话与执行器的提示词之间三处指令相抵的缺口：①"主会话不得写实现代码"的无条件全称与"check 阶段可直修"的字面相抵（曾致主会话派发 prompt 写出"只读审查"，check 执行器在两条强义务指令间空转 70+ 步——session-4bff0f6c 实证）；②权威声明只裁决"谁赢"、未给"裁决后如何行动"，冲突下模型陷入权衡循环；③fork 分身接续源会话 executor 必然失败且错误文案无引导（session-35cb4f6a 实证 belongs to another parent session）。

## Requirements

1. 契约 v15→v16，stage 正交化四处（英文定稿措辞见 design.md §2）：
   - norms Dispatch：Hard constraint 加 `(stage implement)` 限定；Exception 加 `(stage check)` 并明确 "including implementation code — without a fix dispatch"；
   - §2.1 Hard constraint 句加同款 stage 限定；
   - [workflow-state:in_progress]："Route implementation through workloom_execute" 加 implement 限定，check 修复窗口补 "including implementation code"；
   - principle 4（B 案）：补 "the main session fixes check-stage findings per 2.2"。
2. core 权威声明（AUTHORITY_DECLARATION，全 kind 生效）追加冲突终结句：冲突时遵循本节、在报告首行声明一次该冲突、继续执行、禁止反复权衡该服从哪一方。
3. 契约 §2.2 主会话派发指引后补中性告知句：若派发指令与执行器纪律相抵，执行器按纪律执行并在报告首行声明冲突（透明闭环）。
4. adapter-dsh：`workloom_execute` 在 `continue_executor` 接续失败（上游错误 "belongs to another parent session"，fork 场景）时转译为引导文案——"该执行器属于派发它的会话而非当前会话（通常因 fork），请改为全新派发并把所需上下文写进 prompt"；Pi 无 continue 路径，不涉及。
5. 保持并行任务 v15 的 LSP 五场景句原样不动；LSP norms 段保持通用（权限归 Dispatch 管、工具偏好归 LSP 管，不加 stage 限定）。

## Acceptance Criteria

- 契约 v16：version 断言 15→16；norms/§2.1/in_progress 的 stage 限定与 "including implementation code" 断言；principle 4 新句断言；§2.2 中性告知句断言；LSP 五场景句原样保留断言。
- core：AUTHORITY_DECLARATION 含冲突终结句（实现常量与测试逐字一致）；注入文本末尾仍为权威声明。
- adapter-dsh：continue 接续失败返回引导文案（含 "dispatch a fresh executor" 语义），常规派发不受影响；用例覆盖。
- 全量：lint/typecheck/build + core/adapter-dsh/adapter-pi 测试全绿。

**test-first 接缝**：S1 `contract-asset.test.js`（v16 措辞断言）；S2 `executor-context.test.js`（冲突终结句）；S3 `adapter-dsh/test/executor.test.js`（转译用例）。

## Notes

- 根因证据：session-4bff0f6c（check 空转：派发 prompt "不要修改任何文件，只报告" 与纪律段 "P2 不修即失职" 相抵，权威声明未给收敛行为）；session-35cb4f6a（continue_executor 在 fork 分身被 DSH parent 严格校验拒绝，accd4e2c/e13a5497 的 parentSession 均为 session-69a64898）。
- 根治不纳入：DSH parent 校验放宽到 fork 谱系需上游能力调研，列后续独立任务。
- 转译匹配上游错误字符串有脆性，实现处注释标注依赖。
