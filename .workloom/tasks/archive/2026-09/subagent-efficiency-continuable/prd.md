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
2. **多阶段复用（E）**：`workloom_execute` 支持续用参数（主会话显式传入），复用
   task.json `dispatches` 记录的同一 kind executor 会话（经 DSH `followup` 续用），
   后续阶段不再重新 spawn；跨 kind 不续。
3. **上下文注入（A）**：executor seed 组装（`buildExecutorPrompt`）自动注入任务目录
   `research/*.md` 产物全文（合计 >20K 字符时截断尾部，保留标题区 + 锚点区）。
4. **上下文包（D+F 的 workloom 形态，归属 T3）**：research 产物解析为结构化锚点索引
   （节标题/要点/`文件:行号`/代码摘录），按 git rev 落盘任务目录
   （`.workloom/tasks/<task>/context/`），spawn 时命中注入。
5. **prompt 模板（C）**：dispatch prompt 模板固化「先读上下文物料、禁止全局
   recon」指令；「最小依赖文件清单」由锚点索引**自动生成**注入模板段（主会话 prompt 可覆盖）。
6. **research-facts 格式（B）**：`EXECUTOR_CONTRACT_BY_KIND.research` 纪律段增强
   （结构化块：节标题/要点/`文件:行号`/代码摘录，供 implement 直接消费）+
   `.workloom/spec/` 新增格式标准 + `packages/assets/templates/` 新增研究产物模板资产
   （与 spec-detail/spec-index 同模式）；用户级 `~/.agents/skills/research`（搜索技能）
   **不属本任务范围**。
7. **不做兼容开关**：新行为直接生效（回滚靠 git revert / 分支回退），不引入配置开关。
8. **多阶段复用交互（C）**：恢复 continuable 即开放 UI follow-up 能力；同时 `workloom_execute`
   支持续用（复用 dispatches 记录的 executor 会话，经 DSH `followup` 发后续指令）。
9. **拆分（已确认，按 grilling 调整）**：3 个子任务：`T1` 上下文注入与 prompt 模板（A+C）、
   `T2` executor 可继续化与复用（恢复 continuable 派发 + followup 续用）、
   `T3` research-facts 格式规范与上下文包（B+格式解析器+锚点索引落盘）。
10. **生效（已确认）**：各子任务完成并经 check 后 `pnpm -r build` →
    `~/dsh/bin/dsh-sync-workloom`（先 `--dry-run`）；DSH web 重启由用户执行。
11. **等待语义（grilling）**：恢复 startContinuable 后 `workloom_execute` 保留前台等待
    （`whenIdle` + `finalAssistantOutput` + drain），对外行为不变，仅子代理生命周期变 durable。

## Acceptance Criteria

1. **可继续化可验证**：`workloom_execute` 派发后，子代理会话为 continuable（DSH 会话
   记录 mode=continuable；客户端 composer 可写）；经续用参数/task.json dispatches 触发
   的 followup 消息进入**同一**会话（会话 id 不变、消息串行）。
2. **注入可验证**：executor seed 文本包含 `research/*.md` 全文（超限时按截断规则）；
   seed 模板段含「禁止全局 recon + 先读材料」指令与自动生成的 files 清单（清单与
   锚点索引一致，主会话 prompt 可覆盖）。
3. **上下文包可验证**：T3 交付后，任务目录生成 `.workloom/tasks/<task>/context/` 锚点
   索引/上下文包；git rev 变化时自动失效重建；解析器可从现有 research 产物
   （cardx 任务样本）产出结构化结果。
4. **回归**：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`packages/adapter-dsh`
   `node --test test/*.test.js`、`packages/core` `node --test test/*.test.js` 全绿；
   修改文件 LSP diagnostics 干净；`workloom_execute` 对主会话的返回形态
   （输出 + receipt + 异常文本）不回归。
5. **效率证据（dogfooding）**：T1+T2 上线后，容器任务自身后续 dispatch 的 executor
   子代理，recon 工具调用（bash+glob+grep+read，会话日志统计）占比 < 30%
   （cardx 基线：50%~80%）。
6. **部署**：`pnpm -r build` + `dsh-sync-workloom --dry-run` 通过；用户重启 DSH web
   后新行为生效（凭用户观察确认，主会话不代验）。

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
4. 拆分：3 个子任务 T1（上下文注入与上下文包）/ T2（executor 可继续化与复用）/ T3（research-facts 格式规范）。
5. 复用交互：恢复 continuable 开放 UI follow-up + 调度层支持自动续用。
6. 不做兼容开关：直接改行为，回滚靠 git revert。
7. 生效：`pnpm -r build` → `dsh-sync-workloom`（`--dry-run` 先行）；DSH web 重启由用户。
8. 续用决策：主会话显式（`workloom_execute` 续用参数 + 工具描述引导），工具不自动续用。
9. 复用边界：仅同 kind 续用（implement→implement、check→check），跨 kind 不续。
10. research 注入额度：全文注入；超 20K 字符截断尾部，保留标题区 + 锚点区。
11. 流程：进入 1.1c grilling 压测。
12. grilling 第 1 轮（全按推荐）：D 挪入 T3；workloom_execute 保留前台等待；research
    锚点格式用结构化块（标题/要点/文件:行号/代码摘录）；最小依赖清单由锚点索引自动
    生成；验收用 dogfooding（容器任务自身 dispatch 的 executor 统计 recon 占比）。

