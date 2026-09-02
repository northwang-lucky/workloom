# 上下文注入优化调研：参考实现机制与 workloom 映射

- 调研日期：2026-09-02
- 结论速览：同类工程框架的通行做法是"元数据-only 推送 + 分层按需拉取 + 交付时过滤"，把注入体积压到指针级；workloom 可借鉴四项机制，预计执行器注入减半且风险有界。

## 1. 参考机制

1. **会话上下文只推元数据与指针**：developer/git 状态/活动任务树/journal 行号（含 nearLimit 预算信号）+"prd.md 请自行读取"指针；不推任何文件正文。推送型宿主经 session-start hook 注入同一紧凑块；拉取型宿主（无 hook）由 skill 按需读取。
2. **分层拉取协议**（写码前 skill）：任务工件 → 包/spec 层地图（脚本 `--mode packages`）→ 相关模块的 spec **index** → 只读被选中的 guideline 文件。"index 不是目标，是指针"；相关性由 agent 判断，但被 index 与前置清单约束。
3. **工作流步骤按需提取**：契约全文不注入；默认只拉紧凑 Phase Index，`--mode phase --step 2.1` 按步提取即将执行的步骤正文；完整指南按需读。平台标签块在交付时按 `--platform` 过滤，agent 不见其他平台文本。
4. **记忆即指针**：journal 只以路径+行数引用，不注入。
5. **变更边界声明**：写码前 agent 声明最小行为差/将改文件/明确不做项，减少无效探索与上下文 churn。
6. **子代理上下文清单化**：每个角色一份 jsonl 清单（implement/check 各一）。宿主有子代理 hook 时，hook 内联清单 curated 的文件并打标记；无 hook 时 agent 按提示词内的加载协议自读 jsonl 与所列文件。内联是宿主能力决定的预取优化，**清单 + 强制加载协议才是可靠性基线**——与角色无关。

## 2. workloom 现状对照

- breadcrumb 每轮推状态全文 + 全量 norms（主会话侧，数 KB）；
- `buildExecutorPrompt` 推 artifacts 全文（prd/design/implement）+ jsonl 引用 spec 全文 + research（实测 28–33KB，上限 128KB）；
- `workloom_step` 工具已存在（按步提取契约正文），但 breadcrumb 未借它瘦身；
- jsonl 条目天然是 (file, reason) 拉取清单，现状却内联正文。

## 3. 可借鉴优化集（按收益/风险排序）

1. **jsonl 清单作可靠性基线，内联降级为预取**：按参考机制 §1.6，两角色统一只注入"路径 + reason + 强制先读后判"（现状全文内联可作过渡期预取保留，或直接撤）；可靠性由强制加载协议保证，不由推送字节保证。
2. **artifacts 关键段提取**：prd 保留验收/需求段全文；design/implement 注入 H2 目录 + 决议关键段，全文按需 read。
3. **breadcrumb 瘦身**：状态文本压缩为状态句 + 指针；步骤正文按需 workloom_step。
4. **交付时按角色过滤**：norms/LSP 句按主会话/执行器与 LSP 可用性过滤，不跨角色注入无关文本。
5. **可靠性护栏**：强制加载协议写进纪律段（参考实现把加载协议直接写进 agent 提示词，并用 marker 让 agent 检测注入是否已发生、避免重复读）；check 报告须引用实读文件（既有纪律已支持）；marker 检测可复用于续接场景（任务 B）：历史已有上下文则跳过重注入。

## 4. 非目标

- 注入预算配置不动（128KB 上限保留作兜底）；纪律段/契约单一来源结构不动。
