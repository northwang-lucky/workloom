# workloom-case-archived PLAN 审查处置记录

## Round 1

- P0-1：已修复。prepareRef 仍只创建分支；新增 activateRef/restoreRef，用户批准后切换到验证分支，worktree 创建后立即恢复原分支。代码脏树拒绝切换，start 失败先恢复再报告。场景 2 新增 worktree HEAD、ref 侧内容与独立指纹检查。
- P0-2：已修复。PRD-only 场景 prompt 补齐初始请求不是批准、启动与 CASE 两次独立批准消息。
- P1-1：已修复。meta 与 RESULT 增加 validationRefSource、validationReason；默认场景明确 default-current-branch，用户 ref 为 user-specified。
- P1-2：已修复。场景 2 新增指定 commit 的 worktree HEAD、base 文件内容和 ref 上重跑指纹的硬检查。
- P2-1：已修复。删除 config.defaultPackage 死分支；有效历史 package 继承，否则唯一包，多个候选返回 null 由用户选择。
- P2-2：已修复。requestedRef 只在 archived-legacy-explicit-ref 写入，其他场景为 null。
- P2-3：已修复。Pi 文件头注释与清单测试标题同步加入 case-archived。
- P2-4：已修复。Target 明确 DSH 内容测试与 Pi 名单/标题的不同改动范围。
- P2-5：已修复。最终验证显式运行 archived-tasks.test.mjs。
- P2-6：已修复。SKILL 边界明确活跃/未归档走正常流程或 case-active，light 走轻量自查。
- P2-7：已修复。场景 4 明确为 selection-only，选择后只记录并结束，不进入重建或创建任务。
- P2-8：已修复。删除归档遍历中的无效 task.json 分支。
- PRD 同步：R6 增加用户批准后检出、创建后恢复和脏树停止，保持与实现机制一致。

## 主会话补充验证

- 辅助测试 3/3 通过，含 activateRef 切换、restoreRef 恢复和默认不切换。
- 五类夹具全部重新生成成功；runner 通过 bash -n，finalizer 通过 node --check。
- 前三个 prompt 均包含初始请求不是批准与新用户消息；eval JSON 可解析。
- AC1–AC12 的 Covers 完整。

## Round 2

- Round 1 的 12 项发现已由 review 会话核销，辅助测试、五类夹具、runner/finalizer 与 DSH 内容检查均独立复跑通过。
- P2：codeWorktreeClean 同时排除 `.workloom/**` 与 `.pi/**`，与指纹脚本的排除口径一致，避免 Pi session 文件误判脏树。
- P2：meta 拆成创建时字段与 restoreRef 成功后追加的 `previousBranch`、`activationRestored=true`，禁止占位值。
- P2：activate/restore 只在 Step 3.4 描述，Step 2.3 仅负责 prepareRef，消除重复动作说明。

## Round 3

- Round 2 的三个 P2 已由 review 会话核销，辅助测试按当前 plan.md 重跑 3/3 通过。
- 默认不切换分支时，previousBranch 与 activationRestored 保持缺省；只有实际切换并恢复后才出现，避免占位和过期值。
- 三轮累计 15 项发现全部处置，Open issues: none，进入用户启动确认。
