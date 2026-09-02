# 设计文档：执行器指令冲突治理

## 1. 问题与方案总览

三个缺口（证据见 research/current-state.md）：

1. 措辞相抵：norms/§2.1 的"主会话不得写实现代码"是无条件全称，与 §2.2 的 check 阶段修复窗口字面相抵；主会话据此写出"只读审查"派发指令，check 执行器在两条强义务指令间空转。
2. 权威声明只裁决"谁赢"，没有"裁决后如何行动"的指令——冲突下模型陷入权衡循环。
3. fork 分身接续源会话 executor 被 DSH parent 严格校验拒绝，错误文案无引导。

方案：契约 v16 措辞正交化（引导层）+ core 权威声明冲突终结句（强制层）+ adapter-dsh 转译文案（兜底层）。

## 2. 契约 v16 英文终稿（workflow.md）

1. front-matter `version: 15 → 16`。
2. norms Dispatch 两句替换为：
   - `- Hard constraint (stage \`implement\`): while the task stage is \`implement\`, the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent.`
   - `- Exception (stage \`check\`): while the task stage is \`check\`, the main session may fix issues directly — including implementation code — without a fix dispatch; re-dispatch the check executor for a full re-review afterwards.`
3. §2.1 Hard constraint 句（L89 句尾）替换为：
   - `Hard constraint (stage \`implement\`): while the task stage is \`implement\`, the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent.`
4. [workflow-state:in_progress]（L130）："Route implementation through \`workloom_execute\`." 替换为：
   - `While the task stage is \`implement\`, route implementation through \`workloom_execute\`. While the task stage is \`check\`, the main session may fix issues directly — including implementation code; after fixing, re-dispatch the check executor for a full re-review before recording the pass.`
5. principle 4（L17）替换为：
   - `Commit authority stays in the main session: subagents implement and check; the main session fixes check-stage findings per 2.2; git commits happen only in the main session's Phase 2.3 and Phase 3.`
6. §2.2 主会话派发指引段（L104）句尾追加中性告知句：
   - `If a dispatch prompt conflicts with the executor discipline anyway, the executor follows the discipline and states the conflict in the first line of its report.`
7. norms LSP 段（L159-161）与契约其余 LSP 五场景句原样保留，不加 stage 限定（权限归 Dispatch 管、工具偏好归 LSP 管）。

## 3. core 权威声明冲突终结句（executor-context.js）

`AUTHORITY_DECLARATION` 现文之后追加（同常量，全 kind 生效）：

> When an earlier instruction conflicts with this section, follow this section, state the conflict once in the first line of your report, and proceed — do not deliberate on which to obey.

测试常量（`executor-context.test.js` 的 `AUTHORITY_DECLARATION` 与 `CONTRACT_TAIL`）逐字同步；注入结构与其余去重语义不变。

## 4. adapter-dsh：continue 接续失败的引导转译

1. 落点：`executor.ts` 的 followup 调用段（`locateContinueChildId` 定位成功后的真正接续步）——上游在该步抛 "belongs to another parent session"（child.parentSession ≠ 当前会话，fork 场景必然命中）。
2. 处理：捕获 message 含 `belongs to another parent session` 的错误，转为引导文案（保持 isError 语义）：
   - `Cannot continue the recorded executor: it belongs to the session that dispatched it, not this one (typically because the current session is a fork). Dispatch a fresh executor instead, carrying the needed context in the prompt.`
3. 匹配上游错误字符串存在脆性（文案变更即失效）：实现处注释标注该依赖；定位函数 `locateContinueChildId` 的提示面（非本次改动）已有各自的引导语义，不动。
4. Pi 无 continue 路径（已核实），不涉及。

## 5. 测试面（S1/S2/S3）

- `contract-asset.test.js`（S1）：version 16；norms/§2.1/in_progress 的 stage 限定与 "including implementation code" 断言；principle 4 新句断言；§2.2 告知句断言；LSP 五场景句保留断言。
- `executor-context.test.js`（S2）：`AUTHORITY_DECLARATION` 含冲突终结句；注入末尾仍为权威声明。
- `adapter-dsh/test/executor.test.js`（S3）：followup 抛 belongs 错误 → 工具结果为引导文案（含 "Dispatch a fresh executor"）且 isError；常规派发与 locate 失败路径不回归。

## 6. 边界与风险

1. 措辞改动面向模型提示词，纯文本域——不落库、gate 已移除无涉及、doctor 不动。
2. 上游错误字符串匹配有脆性：DSH 文案变更会让转译退化为原样透传（fail loud 仍在，只是少了引导），注释标注。
3. 权威声明加长（两句话）——注入预算影响可忽略（总 prompt 占比极小），不改预算配置。

