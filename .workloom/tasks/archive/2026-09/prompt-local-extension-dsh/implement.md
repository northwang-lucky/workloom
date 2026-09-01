# 提示词本机扩展点机制（DSH 落地）— 实施计划

顺序执行；每步先写测试（test-first，接缝见 design.md §7），再实现，最后统一跑全量验证。

## 1. core 新抽象 local-prompts.ts（+ 单测）

1. 写 `packages/core/test/local-prompts.test.js`（先红）：
   - 无 front-matter 片段 → 无条件、全文本保留；
   - `requiresTools` 单值/多值解析；AND 过滤（缺任一工具不注入）；
   - 非法 YAML / 未知字段 / requiresTools 非字符串数组 → 抛 `WorkloomLocalPromptError`（含文件路径与字段）；
   - 合成顺序：all 前、target 后；target=all 只有 all；空目录/缺失 → 空串零行为；
   - 未知 `.md` 文件名 → fail loud（文案含合法清单）；`.txt`/隐藏文件被忽略。
2. 实现 `packages/core/src/service/local-prompts.ts`（TC1–TC3）：`LocalFragmentTarget`/`LocalFragment`/`WorkloomLocalPromptError`/`parseLocalFragment`/`filterAndOrderLocal`/`readLocalFragments`/`composeLocalDirectivesText`；经 `packages/core/src/index.ts` 导出。
3. `pnpm --filter @workloom-ai/core build && node --test` 全绿。

## 2. executor 注入点（legacy 参数化）

1. `executor-context.test.js` 增补（先红）：`localDirectives` 传入时文本出现在 kind 纪律段之后、leaf 契约段之前，标题 `## Local directives`；未传/空串不插入、输出与旧版逐字一致；userPrompt 含 `## Local directives` 时去重。
2. 实现：`executor-context.js` 新增参数与插入逻辑；`executor-context.d.ts` 的 `BuildExecutorPromptParams` 同步；`buildExecutorPrompt` 行为不变时旧测试必须全绿（回归）。
3. 内置基线进 `EXECUTOR_CONTRACT_BY_KIND`：implement/check/frontend 追加软句子（design.md §4 原文），research 不动；同步更新测试中对该常量的断言。

## 3. 主 agent 注入点（session-context）

1. `session-context.test.js` 增补（先红）：`localDirectives` 传入且 depth=0 → norms 后输出 `Local directives:` 小节；depth>0 → 忽略；空串/未传 → 无小节。
2. 实现：`SessionContextParams.localDirectives?: string | null` + 组装逻辑。

## 4. adapter-dsh 探测与传参

1. `plugin.ts`：`renderSessionContext` 中取 `ctx.tools.schemas()` 投影工具名 → `composeLocalDirectivesText(root, 'main', tools)` → 透传 `assembleSessionContextText`（保持现有错误告警降级口径）；确认 `tools` 已在插件 inject 清单。
2. `executor.ts`：将 `buildExecutorPrompt` 调用移至 `buildDenyList` 计算之后；`availableTools = visibleNames − denyList`；文本传入 `localDirectives`。
3. `adapter-dsh/test/executor.test.js` 增补（TC6）：mock 工具名集合与 deny；可见集缺声明工具 → 首条 prompt 无 `## Local directives`；可见集满足 → 有且内容正确。
4. `adapter-dsh/test/*`（若有 plugin/session 注入测试）覆盖主 agent 探测传参（TC6 主 agent 侧）。

## 5. workflow 契约（assets）

1. `workflow.md`：`version: 13` → `14`；2.1 完成标准、2.2 完成标准、`[workflow-state:in_progress]`、`[workflow-norms]` 各加软句子；`[workflow-state:implement/check]` 阶段正文不变（软句只在 in_progress 与 norms 两处每轮可见）。
2. `packages/core/test/contract-asset.test.js`（或对应契约测试）增补断言：version=14、软句存在于 norms 与 in_progress 步骤正文。

## 6. doctor 可观测性

1. `doctor.test.js` 增补（先红）：临时项目含 prompts.local 片段/未知文件名/坏 front-matter 三种场景的 issue 输出；目录缺失不产出。
2. 实现：`doctor-check-rules.ts` 新增 `checkLocalPrompts`；`doctor-checks.ts` 注册。

## 7. 文档与本机落地

1. `config.example.yaml`：新增 `## prompt local extensions` 节（目录约定、文件清单、front-matter、AND 语义、示例）。
2. `.workloom/.gitignore`：追加 `prompts.local/`。
3. 本机四偏好文件：`.workloom/prompts.local/{main,implement,check,frontend}.md`（英文硬约束；后三个声明 `requiresTools: [lsp_diagnostics]`）；验证 `git status` 不显示（TC9）。

## 8. 全量验证与收尾

1. `pnpm lint`；`pnpm -r typecheck`；`pnpm -r build`；core/adapter-dsh 各 `node --test test/*.test.js`。
2. 按部署纪律提示用户：`~/dsh/bin/dsh-sync-workloom`（rsync 段）在构建后执行；**不主动重启** dsh web（属用户操作）。
3. 汇总变更清单与验证结果，交 check executor 复核。
