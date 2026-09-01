# 子代理效率优化：上下文注入 + 可继续化

## Goal

在 workloom 仓库内（DSH 仓库零改动）消除 executor 子代理的重复仓库摸底，并恢复子代理的可继续能力：

1. executor 子代理恢复为 continuable 派发（durable child id，可 follow-up 继续），
   替代当前 one-shot 派发；
2. implement/check/research 子代理启动时获得完整任务上下文（research 产物 + 锚点 +
   最小依赖清单），不再全局扫描仓库重建现状。

## Requirements

1. **可继续化（恢复历史路线）**：`workloom_execute` 由 `ctx.subagents.start`（one-shot）
   改回 `startContinuable` 路线，产生 durable `childId`；保留当前 HEAD 已有增强
   （toolFilter 硬屏蔽、effort 走 agentOptions.reasoningEffort、subagent_profiles、
   receipt、写门禁豁免适配），不恢复已失效的 effort header hack。
2. **多阶段复用（E）**：任务可配置/参数化复用同一 executor 会话（经 DSH `followup`
   续用），后续阶段不再重新 spawn。
3. **上下文注入（A）**：executor seed 组装（`buildExecutorPrompt`）自动注入任务目录
   `research/*.md` 产物全文。
4. **上下文包（D+F 的 workloom 形态）**：research 产物解析为 `文件:行号` 锚点索引，
   按 git rev 落盘任务目录（`.workloom/tasks/<task>/context/`），spawn 时命中注入。
5. **prompt 模板（C）**：dispatch prompt 模板固化「先读上下文物料、禁止全局
   recon、最小依赖文件清单」指令。
6. **research-facts 格式（B）**：`.workloom/spec/` 新增格式标准 + research skill
   模板对齐产出（锚点 + 代码摘录）。
7. **兼容开关**：新行为默认开启，提供配置项可关闭。

## Acceptance Criteria

(placeholder: 行为断言 + 回放对照，见 Notes)

## Notes

### 已侦察事实（输入，非决议）

1. 观测会话：`session-2c383763`（cwd `works/cardx-cli-work`），7 个 executor 子代理全部以
   `bash: git status/log` + `glob` 扫目录 + 批量 `read` 开场；recon（bash+glob+grep+read）
   占每个子代理工具调用的 50%~80%，且子代理间重复（同一 commit、同一批文件）。
2. 任务 `08-31-cardx-auth-refresh` 已有 research 产物
   `research/cardx-auth-refresh-code-facts.md`（423 行，声明"供 implement 子代理直接消费"），
   但 executor seed 仅注入 `prd.md + design.md + implement.md + 主会话 prompt`，research 产物未进上下文。
3. workloom 历史：`1920d32 refactor(adapter-dsh): executor 子代理切换为一次性(one-shot)派发`
   把 `startContinuable`（返回 durable childId）换成了 `ctx.subagents.start`（one-shot，
   run.result + dispose）；其父版本（`1920d32^`）即「可继续」实现：`startContinuable` →
   `agents.get(childId)` → `whenIdle` → `finalAssistantOutput` → `drainContinuableChildren`。
4. 当前全局 DSH（`@deepseek-ai/dsh@0.1.1-rc.2`）服务面仍完整保留：
   `SubagentRuntime.startContinuable`、`followup(parent, childId, content)`、
   `interrupt`、`drainContinuableChildren`、`ctx.agents.get` —— 改回可继续**无需动 DSH**。
5. DSH `tool-subagent` 存在 `backgroundMode: 'one-shot' | 'continuable'`（默认 one-shot），
   但 workloom executor 不走该工具，直接经 subagents 服务派发，不受其默认值影响。
6. `session_projcache.json`（`~/.dsh/storages/`）现只存会话 stats；本任务不做 DSH 侧缓存，
   以「任务级上下文包」workloom 形态替代（F 的载体）。

### 已定裁决（用户确认）

1. 只动 workloom 仓库，DSH 仓库零改动。
2. 可继续化 = 恢复 `1920d32^` 的 startContinuable 历史路线（effort header hack 除外）。
3. A/B/C/D/E 全部在 workloom 侧落地；F 以「任务级上下文包」形态落地，不做 DSH projcache。

