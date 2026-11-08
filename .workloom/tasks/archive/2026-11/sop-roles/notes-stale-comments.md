# 注释清理登记（notes-stale-comments）

步骤 16 产物：R13 点名注释修正记录、剩余注释候选与过期 spec 条目登记（供归档时登记增补记录；spec 侧经 workloom-update-spec 流程更新，归子任务七，评审 #17）。

## 一、本任务已修正项（随被改文件落地，核查无残留）

| 对象 | 修正 | 落点步骤 |
| --- | --- | --- |
| dsh src/constants.ts:1-3 头注释 | 消费方清单补 tooling/tasks.ts（四常量 PLUGIN_NAME/SOURCE_PLUGIN/CONTEXT_KEY_PREFIX/DISPATCH_WARN_PREFIX 的实际消费面） | 16 |
| dsh cordis.patch.yml:2 | 删「点 7-12 逐步填充」句，改为插件行职责自述 | 16 |
| executor.ts 五处 startContinuable 注释 + plugin.ts:14 一处 | 改 startActivation（实际 API；grep dsh src 零命中） | 6 |
| executor-injection.ts:52 assertKind 注释 | KIND_LABELS 块整体退役（改消费 core ROLE_LABELS），注释随删 | 6 |
| discipline-text.ts:206 assertKind 注释 | 改 assertRole（并注 schema enum 边界） | 6 |
| executor-dispatch.ts:35 runtime='dsh' 过期注释 | 改「NATIVE_TOOLS 原生候选 ± tools 配置」实际语义 | 13 |
| executor-toolface.ts:26 「与 research 写守卫同一约定」 | 改 researcher | 6 |
| state-machine.ts:667 「机制细分归子任务五」旧任务编号 | 改「多子任务集成机制待父子编排细化」（现 state/guards.ts） | 2 |
| prompt-compose.ts:361 「子任务四按角色重接」旧任务编号 | 删除该句（角色重接已完成） | 3 |
| guards.ts:587 「子任务四按角色重接」 | 改「查询点在 checker 派发入口与 checking 迁移边」 | 5 |
| config.d.ts:174-184/211-217 已退役 runtime? 参数与 map 形式注释 | 签名与注释同步实际实现（无 runtime 参数、model 仅 string） | 8 |
| config-subagent.ts:291/438/496 JSDoc `@param kind` 旧五值列举 | 改 `@param role` 新五值 | 8 |
| main-model.ts 「画像 whenMain 匹配」注释 | 语义复原（plugin 注入接线恢复）；「兜底/旧 subagents」改「兜底条目或宿主默认」 | 9 |
| dispatch-binding.js:5-7 Pi 共用过期注释 | 文件迁 dsh，头注释改写为 dsh 派发绑定构造职责 | 12 |
| executor-settle.ts:20 「如 check 报 FAIL」阶段词 | 改「如 Checker 报 FAIL」 | 16 |
| prompt-compose.ts 两处错位孤儿注释（纪律段描述、LSP 描述）与 prompt-sections.ts 的 executor-context.d.ts 失效 JSDoc 引用 | 删除/改实际路径 | 3 |
| discipline-text.ts 两处孤儿注释（本机片段段标题、注入标记行前缀）与 Pi write-scope 副本提及 | 删除（常量在 core；Pi adapter 已退役不在本仓） | 6 |
| state-machine.test.ts 头注释「（步骤 1）」、active-task.test.ts 头注释「state-machine 指针段」 | 改 task/state 与 task/state/pointers 实际归属 | 16 |
| task-ops.ts / dispatch-records.ts / doc-review.ts / index.ts 头注释的 task-storage、state-machine 旧模块名 | 改 task/storage、task/state | 1/2 |

## 二、剩余注释候选（未触及文件，归子任务七或后续簿记）

- `packages/core/src/workspace/doctor.ts:9`——「复用 task-storage/state-machine/config API」旧模块名（现 task/storage、task/state）。
- `packages/core/src/task/case-structure.ts:30`——「CASE 轨道阶段（state-machine 的 CASE_PHASES 值域…）」旧模块名（现 task/state）。
- `packages/core/src/task/prd-structure.ts:31`——「task-storage 生成骨架与本模块 placeholder 判定共用此常量」旧模块名（现 task/storage）。
- `packages/core/src/task/jsonl.ts:27`——「与 executor-context 的 ERR_PREFIX 同值」；executor-context 已不存在（前缀单源在 injection/prompt-compose.ts）。
- `packages/core/test/dist-dts.test.ts:5-6`——「类型内联进 task-storage 与 state-machine」旧模块名。
- `packages/core/src/injection/prompt-compose.ts:339`——拒绝前缀 `check dispatch rejected`：阶段语义叙述文案（非派发值域消费点，AC3 检索已归类①）；角色叙述统一归子任务七。
- `packages/core/src/task/task-ops.ts:476`——「frontend 派发门禁」叙述（门禁现按 frontend-developer 角色判定）；叙述性文案归子任务七。
- resources 旧 stage 字样（workflow.md 的 stage `implement`/`check` 等，决定 10 显式保留）归子任务七。

## 三、过期 spec 条目（经 workloom-update-spec 流程更新，归子任务七）

- `repo/terminology`：executor 与 frontend executor 条目——派发值域已切五角色（researcher/developer/frontend-developer/checker/judger），旧 kind 五值仅存于历史记录兼容读。
- `repo/workflow` transport-failover 条目——三处过期：①旧多跳编排语义（现为单次重试一跳，fallbackOf 非空硬挡）；②配置面 `subagents.<kind>.fallback_models` 已改 `subagent_profiles[i].roles.<role>.fallback_models`（根层级 subagents 退役 + 内层字段改名 roles）；③rotate 轮换语义已退役（DispatchModelSource 的 'rotate' 仅存惰性历史值）。
- `repo/workflow` asset-version-bump 条目——过期路径：packages/assets→packages/core/resources、domain/protocol.js→injection/protocol.js。

## 四、测试隔离脆弱面（主会话 2026-11-08 答复五的登记项）

dsh `commands.test.ts` / `skills.test.ts` / `plugin.test.ts` / `dist-mirror.test.ts` 无 HOME+TMPDIR 隔离块（本轮已给 case-executor/inject/tasks/case 四文件补齐）。commands.test 因 doctor 将配置错误按 issue 报告而天然耐受真实全局配置泄漏；其余三文件当前不触 loadConfig 链路。建议后续簿记轮统一补隔离，防全局配置漂移再次击穿。

## 五、全局配置迁移前置（生产 pin 切换时）

`~/.workloom/config.json` 现行内容含旧内层字段名 `subagents`、旧角色键（research/review）与已退役字段 `rotate_on_busy`。生产 pin 切到含本任务代码的提交前必须完成：内层字段改 `roles`、角色键改新五值（rotate_on_busy 的支持归子任务八，见容器任务增补记录「全局配置事故记录」节）。

## 六、补充登记（主会话复核执行轮移交项，2026-11-08）

- `packages/core/resources/skills/workloom-case-active/evals/evals.json:15`：评测夹具含旧角色名词 "check executor"（AC3 允许类别之夹具数据，执行轮归属清单已补）——归子任务七文档层一并清理。
